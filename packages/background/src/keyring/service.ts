import {
  KeyRing,
  KeyRingStatus,
  MultiKeyStoreInfoWithSelected,
} from "./keyring";
import { Key, KeyStoreMetaKnown, ScryptPriority } from "./types";
import type { ConsistencyCheckResult } from "./cache-manager";
import { CardanoService } from "../cardano/service";
import {
  CardanoRuntimeSupervisor,
  createCardanoServiceHost,
  RuntimeCreateContext,
} from "../cardano/runtime-supervisor";
import {
  CARDANO_ENSURE_MESSAGE,
  StaleCardanoRuntimeError,
  formatNetworkContextInvalidForCardano,
  formatProviderUnavailableError,
  formatWalletNotReadyError,
} from "../cardano/ensure-errors";

import {
  Bech32Address,
  checkAndValidateADR36AminoSignDoc,
  makeADR36AminoSignDoc,
  verifyADR36AminoSignDoc,
  encodeSecp256k1Pubkey,
  encodeSecp256k1Signature,
  serializeSignDoc,
} from "@keplr-wallet/cosmos";
import {
  BIP44HDPath,
  CommonCrypto,
  ExportKeyRingData,
  SignMode,
} from "./types";

import { escapeHTML, KVStore, sortObjectByKey } from "@keplr-wallet/common";

import { ChainsService } from "../chains";
import { LedgerApp, LedgerService } from "../ledger";
import {
  BIP44,
  ChainInfo,
  EthSignType,
  KeplrSignOptions,
  AminoSignResponse,
  StdSignature,
  StdSignDoc,
  DirectSignResponse,
} from "@keplr-wallet/types";
import { APP_PORT, Env, WEBPAGE_PORT } from "@keplr-wallet/router";
import { AnalyticsService } from "../analytics";
import { InteractionService } from "../interaction";
import { PermissionService } from "../permission";

import {
  SignDoc,
  TxBody,
} from "@keplr-wallet/proto-types/cosmos/tx/v1beta1/tx";
import Long from "long";
import { SupportedCurve } from "./types";
import { Buffer } from "buffer/";
import { trimAminoSignDoc } from "./amino-sign-doc";
import { KeystoneService } from "../keystone";
import {
  KEYRING_SURFACES_SYNC_MESSAGE_TYPE,
  RequestICNSAdr36SignaturesMsg,
  SwitchAccountMsg,
} from "./messages";
import {
  walletShouldLeaveCardanoChain,
  walletSupportsCardano,
} from "./keyring";
import { getDefaultFallbackChainId } from "../chains/default-chain";
import { PubKeySecp256k1, KeyCurves } from "@keplr-wallet/crypto";
import { closePopupWindow } from "@keplr-wallet/popup";
import { Msg } from "@keplr-wallet/types/build";

export class KeyRingService {
  private static isCardanoAddressCapableAlgo(algo: string): boolean {
    return algo === "ed25519" || algo === "cardano_address_only";
  }

  private static sanitizeCardanoMeta(
    meta: Record<string, string>
  ): Record<string, string> {
    const sanitized = { ...meta };
    delete sanitized["cardanoSerializedAgent"];
    return sanitized;
  }

  private keyRing!: KeyRing;

  /** Serializes wallet switches so selected keystore and session material stay aligned. */
  private keyStoreSwitchTail: Promise<void> = Promise.resolve();

  protected analyticsSerice!: AnalyticsService;
  protected interactionService!: InteractionService;
  public chainsService!: ChainsService;
  public permissionService!: PermissionService;
  private cardanoService: CardanoService;

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly embedChainInfos: ChainInfo[],
    protected readonly crypto: CommonCrypto,
    cardanoService: CardanoService
  ) {
    this.cardanoService = cardanoService;
  }

  public getKeyRing(): KeyRing {
    return this.keyRing;
  }

  init(
    interactionService: InteractionService,
    chainsService: ChainsService,
    permissionService: PermissionService,
    ledgerService: LedgerService,
    keystoneService: KeystoneService,
    analyticsSerice: AnalyticsService
  ) {
    this.interactionService = interactionService;
    this.chainsService = chainsService;
    this.permissionService = permissionService;

    this.keyRing = new KeyRing(
      this.embedChainInfos,
      this.kvStore,
      ledgerService,
      keystoneService,
      interactionService,
      this.crypto,
      this.chainsService
    );

    this.chainsService.addChainRemovedHandler(this.onChainRemoved);

    if (!this.chainsService.hasNetworkAuthority()) {
      throw new Error(
        "KeyRingService requires NetworkAuthority before init (wire and hydrate first)"
      );
    }

    const supervisor = new CardanoRuntimeSupervisor({
      host: createCardanoServiceHost(this.cardanoService, (ctx) =>
        this.createAndAttachCardanoRuntime(ctx)
      ),
      isCardanoChain: (chainId) =>
        this.chainsService.isCardanoFeatureSync(chainId),
    });
    this.cardanoRuntimeSupervisor = supervisor;

    this.chainsService.subscribeNetworkAuthority((snapshot, previous) => {
      supervisor.onAuthorityCommitted(snapshot, previous);
      if (
        this.keyRing.status === KeyRingStatus.UNLOCKED &&
        this.chainsService.isCardanoFeatureSync(snapshot.chainId)
      ) {
        this.runAddressCacheRepairBestEffort(snapshot.chainId).catch(
          (error) => {
            console.error(
              `[KeyRingService] Post-switch cache repair failed for ${snapshot.chainId}:`,
              error
            );
          }
        );
      }
    });

    // Prefer adopting mirrors after a successful hydrateNetworkAuthority().
    // If startup hydrate failed and later recovered via ensureHydrated, authority
    // observers notify and onAuthorityCommitted updates ownership instead.
    const hydratedChainId = this.chainsService.peekSelectedChainId();
    const hydratedRevision = this.chainsService.getCommittedRevision();
    if (hydratedChainId != null && hydratedRevision >= 1) {
      supervisor.adoptCommittedSnapshot({
        chainId: hydratedChainId,
        revision: hydratedRevision,
      });
    }
    this.analyticsSerice = analyticsSerice;
  }

  protected readonly onChainRemoved = (chainId: string) => {
    this.keyRing.removeAllKeyStoreCoinType(chainId);
  };

  private async isCardanoChain(chainId: string): Promise<boolean> {
    const chainInfo = await this.chainsService.getChainInfo(chainId);
    return chainInfo.features?.includes("cardano") ?? false;
  }

  private async isCardanoChainSafe(chainId: string): Promise<boolean> {
    const chainInfo = await this.chainsService.findChainInfo(chainId);
    return chainInfo?.features?.includes("cardano") ?? false;
  }

  public async isRegisteredCardanoChain(chainId: string): Promise<boolean> {
    return this.isCardanoChain(chainId);
  }

  private cardanoRuntimeSupervisor!: CardanoRuntimeSupervisor;

  private resetCardanoRuntime(): void {
    this.cardanoRuntimeSupervisor.resetHostRuntime();
  }

  public async reinitializeCardanoService(chainId: string): Promise<void> {
    if (this.keyRing.status !== KeyRingStatus.UNLOCKED) {
      throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
    }
    if (!(await this.isRegisteredCardanoChain(chainId))) {
      throw new Error(formatNetworkContextInvalidForCardano(chainId));
    }

    this.resetCardanoRuntime();
    await this.ensureCardanoServiceReady(chainId);
  }

  private async runAddressCacheRepairBestEffort(
    chainId: string
  ): Promise<void> {
    if (this.keyRing.status !== KeyRingStatus.UNLOCKED) {
      return;
    }
    const unlockSessionId = this.keyRing.getCurrentUnlockSessionId();
    if (!this.isAddressCacheRepairSessionCurrent(unlockSessionId)) {
      return;
    }

    const currentChainId = await this.chainsService.getSelectedChain();
    if (
      currentChainId !== chainId ||
      !this.isAddressCacheRepairSessionCurrent(unlockSessionId)
    ) {
      return;
    }

    const chainInfo = await this.chainsService.getChainInfo(chainId);
    const isCardano = chainInfo.features?.includes("cardano") ?? false;
    const isEvm = chainInfo.features?.includes("evm") ?? false;
    const keys = isCardano
      ? await this.keyRing.getKeysForCardano(chainId, {
          scryptPriority: "background",
        })
      : await this.keyRing.getKeys(chainId, isEvm, {
          scryptPriority: "background",
        });
    if (!this.isAddressCacheRepairSessionCurrent(unlockSessionId)) {
      return;
    }
    await this.ensureAndRepairAddressCaches(
      chainId,
      keys,
      {
        isCardano,
        isEvm,
      },
      unlockSessionId
    );
  }

  private isAddressCacheRepairSessionCurrent(unlockSessionId: string): boolean {
    return (
      unlockSessionId.length > 0 &&
      this.keyRing.addressCacheManager.hasPassword() &&
      this.keyRing.getCurrentUnlockSessionId() === unlockSessionId
    );
  }

  async restore(): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    // Opening another extension surface must not replace the live keystore
    // objects while their decrypted material belongs to the current session.
    if (this.keyRing.status !== KeyRingStatus.UNLOCKED) {
      await this.keyRing.restore();
    }
    return {
      status: this.keyRing.status,
      multiKeyStoreInfo: this.keyRing.getMultiKeyStoreInfo(),
    };
  }

  async checkReadiness(env: Env): Promise<KeyRingStatus> {
    if (this.keyRing.status === KeyRingStatus.EMPTY) {
      return KeyRingStatus.EMPTY;
    }

    if (this.keyRing.status === KeyRingStatus.NOTLOADED) {
      await this.keyRing.restore();
    }

    if (this.keyRing.status === KeyRingStatus.LOCKED) {
      await this.interactionService.waitApprove(env, "/unlock", "unlock", {});
    }

    return this.keyRing.status;
  }

  async enable(env: Env): Promise<KeyRingStatus> {
    if (this.keyRing.status === KeyRingStatus.EMPTY) {
      throw new Error("key doesn't exist");
    }

    if (this.keyRing.status === KeyRingStatus.NOTLOADED) {
      await this.keyRing.restore();
    }

    if (this.keyRing.status === KeyRingStatus.LOCKED) {
      await this.interactionService.waitApprove(env, "/unlock", "unlock", {});
      return this.keyRing.status;
    }

    return this.keyRing.status;
  }

  get keyRingStatus(): KeyRingStatus {
    return this.keyRing.status;
  }

  async deleteKeyRing(
    index: number,
    password: string
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
    status: KeyRingStatus;
  }> {
    let keyStoreChanged = false;

    try {
      const result = await this.keyRing.deleteKeyRing(index, password);
      keyStoreChanged = result.keyStoreChanged;

      if (keyStoreChanged) {
        this.resetCardanoRuntime();
        await this.alignSelectedChainWithCurrentWalletIfNeeded();
      }

      return {
        multiKeyStoreInfo: this.keyRing.getMultiKeyStoreInfo(),
        status: this.keyRing.status,
      };
    } finally {
      if (keyStoreChanged) {
        this.interactionService.dispatchEvent(
          WEBPAGE_PORT,
          "keystore-changed",
          {}
        );
      }
    }
  }

  /**
   * When the current chain is Cardano but the selected wallet cannot use Cardano,
   * move to the same non-Cardano fallback policy as the rest of keyring (see default-chain).
   */
  private async alignSelectedChainWithCurrentWalletIfNeeded(): Promise<void> {
    try {
      const ks = this.keyRing.getCurrentKeyStore();
      const currentChainId = await this.chainsService.getSelectedChain();
      if (currentChainId && ks && walletShouldLeaveCardanoChain(ks)) {
        const chainInfo = await this.chainsService.getChainInfo(currentChainId);
        const isCardano = chainInfo.features?.includes("cardano") ?? false;
        if (isCardano) {
          const chainInfos = await this.chainsService.getChainInfos();
          const fallbackId = getDefaultFallbackChainId(chainInfos);
          if (fallbackId) {
            await this.chainsService.setSelectedChain(fallbackId);
          }
        }
      }
    } catch (e) {
      console.error(
        "[KeyRingService] Failed to align chain with wallet after key store change:",
        e
      );
    }
  }

  /**
   * Fan-out to all extension UI contexts so each surface refreshes MobX state.
   */
  broadcastKeyringSurfacesSync(): void {
    try {
      const g = globalThis as {
        browser?: { runtime?: typeof browser.runtime };
        chrome?: { runtime?: typeof chrome.runtime };
      };
      const rt = g.browser?.runtime ?? g.chrome?.runtime;
      if (!rt?.sendMessage) {
        return;
      }
      const payload = {
        type: KEYRING_SURFACES_SYNC_MESSAGE_TYPE,
        seq: Date.now(),
      };
      // browser/chrome runtime typings union yields non-callable intersection; narrow at call site.
      const sendMessage = rt.sendMessage as (
        message: unknown
      ) => void | Promise<unknown>;
      const out = sendMessage(payload);
      if (out != null && typeof (out as Promise<unknown>).then === "function") {
        void (out as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      // noop
    }
  }

  async updateNameKeyRing(
    index: number,
    name: string,
    nameByChain?: string
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const multiKeyStoreInfo = await this.keyRing.updateNameKeyRing(
      index,
      name,
      nameByChain
    );
    return {
      multiKeyStoreInfo,
    };
  }

  async showKeyRing(index: number, password: string): Promise<string> {
    return await this.keyRing.showKeyRing(index, password);
  }

  async createMnemonicKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    mnemonic: string,
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const cardanoMeta = await this.cardanoService
      .createMetaFromMnemonic(mnemonic, password)
      .catch((error) => {
        console.error("Failed to create Cardano meta:", error);
        return {};
      });
    const safeCardanoMeta = KeyRingService.sanitizeCardanoMeta(cardanoMeta);

    const keyStoreInfo = await this.keyRing.createMnemonicKey(
      kdf,
      mnemonic,
      password,
      { ...meta, ...safeCardanoMeta },
      bip44HDPath,
      "secp256k1"
    );
    return keyStoreInfo;
  }

  async createPrivateKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    privateKey: Uint8Array,
    password: string,
    meta: Record<string, string>
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    return await this.keyRing.createPrivateKey(
      kdf,
      privateKey,
      password,
      meta,
      KeyCurves.secp256k1
    );
  }

  async createKeystoneKey(
    env: Env,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    return await this.keyRing.createKeystoneKey(
      env,
      kdf,
      password,
      meta,
      bip44HDPath
    );
  }

  async createLedgerKey(
    env: Env,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    cosmosLikeApp?: string
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    return await this.keyRing.createLedgerKey(
      env,
      kdf,
      password,
      meta,
      bip44HDPath,
      cosmosLikeApp
    );
  }

  lock(): KeyRingStatus {
    this.keyRing.lock();
    this.resetCardanoRuntime();
    return this.keyRing.status;
  }

  async unlock(password: string): Promise<KeyRingStatus> {
    if (this.keyRing.status === KeyRingStatus.UNLOCKED) {
      if (!this.keyRing.checkPassword(password)) {
        throw new Error("Invalid password");
      }
      return this.keyRing.status;
    }

    await this.keyRing.unlock(password);

    const ks = this.keyRing.getCurrentKeyStore();

    if (ks && walletSupportsCardano(ks)) {
      try {
        const currentChainId = await this.chainsService.getSelectedChain();
        // Reconcile detach only: never create NetworkRuntime on unlock (P2 lazy).
        if (!(await this.isCardanoChainSafe(currentChainId))) {
          this.resetCardanoRuntime();
        }
      } catch (error) {
        console.error(
          "[KeyRingService] Post-unlock Cardano detach reconciliation failed:",
          error
        );
        this.resetCardanoRuntime();
      }
    }

    return this.keyRing.status;
  }

  async getKey(chainId: string): Promise<Key> {
    const chainInfo = await this.chainsService.getChainInfo(chainId);

    if (chainInfo.features?.includes("cardano")) {
      // Offline KeyContext: registered Cardano chain only; independent of selected network.
      if (!(await this.isRegisteredCardanoChain(chainId))) {
        throw new Error(formatNetworkContextInvalidForCardano(chainId));
      }
      if (this.keyRing.status !== KeyRingStatus.UNLOCKED) {
        throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
      }
      const ks = this.keyRing.getCurrentKeyStore();
      if (!ks) {
        throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
      }
      if (walletShouldLeaveCardanoChain(ks)) {
        throw new Error(CARDANO_ENSURE_MESSAGE.MNEMONIC_24);
      }
      return await this.keyRing.getCardanoKeyForKeyStore(chainId, ks);
    }

    const ethereumKeyFeatures =
      await this.chainsService.getChainEthereumKeyFeatures(chainId);
    const isEvm = chainInfo.features?.includes("evm") ?? false;

    if (ethereumKeyFeatures.address || ethereumKeyFeatures.signing) {
      // Check the comment on the method itself.
      if (!isEvm) {
        this.keyRing.throwErrorIfEthermintWithLedgerButNotSupported(chainId);
      }
    }

    return this.keyRing.getKey(
      chainId,
      await this.chainsService.getChainCoinType(chainId),
      ethereumKeyFeatures.address
    );
  }

  /**
   * Registered Cardano chain for offline KeyContext (no selected-network gate).
   * BG boundary: chain must exist in the registry and include `features: cardano`.
   * CardanoKeyContext itself only validates ASI `cardano-*` → network mapping.
   */
  private async resolveRegisteredCardanoChainId(
    chainId?: string
  ): Promise<string> {
    const selectedChainId = await this.chainsService.getSelectedChain();
    const targetChainId = chainId ?? selectedChainId;
    if (!targetChainId) {
      throw new Error(CARDANO_ENSURE_MESSAGE.NETWORK_CONTEXT_MISSING);
    }
    if (!(await this.isCardanoChain(targetChainId))) {
      throw new Error(formatNetworkContextInvalidForCardano(targetChainId));
    }
    return targetChainId;
  }

  /**
   * Resolves Cardano chain that NetworkRuntime may use: must match background
   * selected chain and be a Cardano network.
   */
  private async resolveSelectedCardanoTargetChainId(
    chainId?: string
  ): Promise<string> {
    const selectedChainId = await this.chainsService.getSelectedChain();
    const targetChainId = chainId ?? selectedChainId;
    if (!targetChainId) {
      throw new Error(CARDANO_ENSURE_MESSAGE.NETWORK_CONTEXT_MISSING);
    }
    if (selectedChainId !== targetChainId) {
      throw new Error(formatNetworkContextInvalidForCardano(targetChainId));
    }
    if (!(await this.isCardanoChain(targetChainId))) {
      throw new Error(formatNetworkContextInvalidForCardano(targetChainId));
    }
    return targetChainId;
  }

  /**
   * Cardano readiness gate used by tx/sync/history and ListAccounts preflight.
   *
   * - Default / omitted `mode` → `transaction`: ensures NetworkRuntime for the
   *   selected Cardano chain (may restore / create Blockfrost wallet).
   * - `mode: "key"` → offline preflight only (unlock + 24-word + registered
   *   Cardano chain). Does not create KeyContext or NetworkRuntime.
   *
   * Callers that need addresses without a runtime must use getKey /
   * deriveKeyFromKeyStore / getKeysForCardano rather than relying on
   * default ensure alone.
   *
   * Enter Cardano / unlock intentionally do not call this for NetworkRuntime;
   * runtime stays lazy until the first transaction-mode ensure.
   */
  public async ensureCardanoServiceReady(
    chainId?: string,
    options?: { mode?: "transaction" | "key" }
  ): Promise<void> {
    const mode = options?.mode ?? "transaction";

    // mode:key → offline KeyContext only (no NetworkRuntime / Blockfrost).
    if (mode === "key") {
      await this.ensureCardanoKeyContextReady(chainId);
      return;
    }

    try {
      await this.ensureCardanoServiceReadyOnce(chainId, options);
    } catch (error) {
      if (!(error instanceof StaleCardanoRuntimeError)) {
        throw error;
      }
      // Re-validate selected/target via the same contract before retrying.
      await this.resolveSelectedCardanoTargetChainId(chainId);
      await this.ensureCardanoServiceReadyOnce(chainId, options);
    }
  }

  /**
   * Validates unlock + Cardano-capable keystore for offline derivation.
   * Does not publish NetworkRuntime (isInitialized / isReady unchanged).
   */
  private async ensureCardanoKeyContextReady(chainId?: string): Promise<void> {
    await this.resolveRegisteredCardanoChainId(chainId);
    if (this.keyRing.status !== KeyRingStatus.UNLOCKED) {
      throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
    }
    const ks = this.keyRing.getCurrentKeyStore();
    if (!ks) {
      throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
    }
    if (walletShouldLeaveCardanoChain(ks)) {
      throw new Error(CARDANO_ENSURE_MESSAGE.MNEMONIC_24);
    }
  }

  /**
   * Single-flight NetworkRuntime ensure (transaction mode only).
   * Joins create/ownership through CardanoRuntimeSupervisor.
   */
  private async ensureCardanoServiceReadyOnce(
    chainId?: string,
    _options?: { mode?: "transaction" | "key" }
  ): Promise<void> {
    const targetChainId = await this.resolveSelectedCardanoTargetChainId(
      chainId
    );
    const snapshot = await this.chainsService.getSelectedChainSnapshot();
    await this.cardanoRuntimeSupervisor.ensureReady(
      targetChainId,
      snapshot.revision
    );
    this.assertCardanoServiceReady(targetChainId);
  }

  private async createAndAttachCardanoRuntime(
    ctx: RuntimeCreateContext
  ): Promise<void> {
    const ks = this.keyRing.getCurrentKeyStore();
    if (!ks || this.keyRing.status !== KeyRingStatus.UNLOCKED) {
      throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
    }
    if (walletShouldLeaveCardanoChain(ks)) {
      throw new Error(CARDANO_ENSURE_MESSAGE.MNEMONIC_24);
    }

    ctx.assertStillOwner();
    await this.cardanoService.restoreFromKeyStore(
      ks,
      this.keyRing.currentPassword,
      this.crypto,
      ctx.chainId,
      {
        runtimeGeneration: ctx.runtimeGeneration,
        ownerSwitchGeneration: ctx.authorityRevision,
        selectedChainIdAtCreate: ctx.chainId,
        getSelectedChainId: () => this.chainsService.peekSelectedChainId(),
        getOwnerSwitchGeneration: () =>
          this.chainsService.getCommittedRevision(),
        createdBy: "restore",
        runtimeLease: ctx.runtimeLease,
      }
    );
    ctx.assertStillOwner();
  }

  private assertCardanoServiceReady(chainId?: string): void {
    if (chainId && typeof this.cardanoService.isReadyForChain === "function") {
      if (!this.cardanoService.isReadyForChain(chainId)) {
        const runtimeState = this.cardanoService.getRuntimeState();
        if (runtimeState === "provider_unavailable") {
          throw new Error(formatProviderUnavailableError(chainId));
        }
        throw new Error(formatWalletNotReadyError(chainId));
      }
      return;
    }
    const runtimeState = this.cardanoService.getRuntimeState();
    if (runtimeState === "provider_unavailable") {
      throw new Error(formatProviderUnavailableError(chainId));
    }
    if (!this.cardanoService.isReady()) {
      throw new Error(formatWalletNotReadyError(chainId));
    }
  }

  getKeyStoreMeta(key: string): string {
    return this.keyRing.getKeyStoreMeta(key);
  }

  getKeyRingType(): string {
    return this.keyRing.type;
  }

  async requestSignAmino(
    env: Env,
    msgOrigin: string,
    chainId: string,
    signer: string,
    signDoc: StdSignDoc,
    signOptions: KeplrSignOptions & {
      // Hack option field to detect the sign arbitrary for string
      isADR36WithString?: boolean;
      ethSignType?: EthSignType;
    }
  ): Promise<AminoSignResponse> {
    signDoc = {
      ...signDoc,
      memo: escapeHTML(signDoc.memo),
    };

    signDoc = trimAminoSignDoc(signDoc);
    signDoc = sortObjectByKey(signDoc);

    const coinType = await this.chainsService.getChainCoinType(chainId);
    const ethereumKeyFeatures =
      await this.chainsService.getChainEthereumKeyFeatures(chainId);
    const isEvm =
      (await this.chainsService.getChainInfo(chainId)).features?.includes(
        "evm"
      ) ?? false;

    if (ethereumKeyFeatures.address || ethereumKeyFeatures.signing) {
      // Check the comment on the method itself.
      if (!isEvm) {
        this.keyRing.throwErrorIfEthermintWithLedgerButNotSupported(chainId);
      }
    }

    const key = await this.keyRing.getKey(
      chainId,
      coinType,
      ethereumKeyFeatures.address
    );
    const bech32Prefix = (await this.chainsService.getChainInfo(chainId))
      .bech32Config.bech32PrefixAccAddr;
    const bech32Address = new Bech32Address(key.address).toBech32(bech32Prefix);
    if (signer !== bech32Address) {
      throw new Error("Signer mismatched");
    }

    const isADR36SignDoc = checkAndValidateADR36AminoSignDoc(
      signDoc,
      bech32Prefix
    );
    if (isADR36SignDoc) {
      if (signDoc.msgs[0].value.signer !== signer) {
        throw new Error("Unmatched signer in sign doc");
      }
    }

    if (signOptions.isADR36WithString != null && !isADR36SignDoc) {
      throw new Error(
        'Sign doc is not for ADR-36. But, "isADR36WithString" option is defined'
      );
    }

    if (signOptions.ethSignType && !isADR36SignDoc) {
      throw new Error(
        "Eth sign type can be requested with only ADR-36 amino sign doc"
      );
    }

    if (signDoc.fee?.amount) {
      const filteredAmounts = signDoc.fee.amount.filter(
        (coin) => coin.amount !== "0"
      );
      signDoc = sortObjectByKey({
        ...signDoc,
        fee: {
          ...signDoc.fee,
          amount: filteredAmounts,
        },
      });
    }

    let newSignDoc = (await this.interactionService.waitApprove(
      env,
      "/sign",
      "request-sign",
      {
        msgOrigin,
        chainId,
        mode: "amino",
        signDoc,
        signer,
        signOptions,
        isADR36SignDoc,
        isADR36WithString: signOptions.isADR36WithString,
        ethSignType: signOptions.ethSignType,
      }
    )) as StdSignDoc;

    newSignDoc = {
      ...newSignDoc,
      memo: escapeHTML(newSignDoc.memo),
    };

    if (isADR36SignDoc) {
      // Validate the new sign doc, if it was for ADR-36.
      if (checkAndValidateADR36AminoSignDoc(signDoc, bech32Prefix)) {
        if (signDoc.msgs[0].value.signer !== signer) {
          throw new Error("Unmatched signer in new sign doc");
        }
      } else {
        throw new Error(
          "Signing request was for ADR-36. But, accidentally, new sign doc is not for ADR-36"
        );
      }
    }

    // Handle Ethereum signing
    if (signOptions.ethSignType) {
      if (newSignDoc.msgs.length !== 1) {
        // Validate number of messages
        throw new Error("Invalid number of messages for Ethereum sign request");
      }

      const signBytes = Buffer.from(newSignDoc.msgs[0].value.data, "base64");

      try {
        const signatureBytes = await this.keyRing.signEthereum(
          env,
          chainId,
          coinType,
          signBytes,
          signOptions.ethSignType
        );

        this.analyticsSerice.logEventIgnoreError("tx_signed", {
          chainId,
          isInternal: env.isInternalMsg,
          origin: msgOrigin,
          ethSignType: signOptions.ethSignType,
        });

        return {
          signed: newSignDoc, // Included to match return type
          signature: {
            pub_key: encodeSecp256k1Pubkey(key.pubKey), // Included to match return type
            signature: Buffer.from(signatureBytes).toString("base64"), // No byte limit
          },
        };
      } finally {
        this.interactionService.dispatchEvent(APP_PORT, "request-sign-end", {});
      }
    }

    try {
      const signature = await this.keyRing.sign(
        env,
        chainId,
        coinType,
        serializeSignDoc(newSignDoc),
        ethereumKeyFeatures.signing,
        SignMode.Amino
      );

      const msgTypes = newSignDoc.msgs
        .filter((msg: Msg) => msg.type)
        .map((msg: Msg) => msg.type);

      this.analyticsSerice.logEventIgnoreError("tx_signed", {
        chainId,
        isInternal: env.isInternalMsg,
        origin: msgOrigin,
        signMode: SignMode.Amino,
        msgTypes,
        isADR36SignDoc,
      });

      return {
        signed: newSignDoc,
        signature: encodeSecp256k1Signature(key.pubKey, signature),
      };
    } finally {
      this.interactionService.dispatchEvent(APP_PORT, "request-sign-end", {});
    }
  }

  async requestSignEIP712CosmosTx_v0(
    env: Env,
    msgOrigin: string,
    chainId: string,
    signer: string,
    eip712: {
      types: Record<string, { name: string; type: string }[] | undefined>;
      domain: Record<string, any>;
      primaryType: string;
    },
    signDoc: StdSignDoc,
    signOptions: KeplrSignOptions
  ): Promise<AminoSignResponse> {
    signDoc = {
      ...signDoc,
      memo: escapeHTML(signDoc.memo),
    };

    signDoc = trimAminoSignDoc(signDoc);
    signDoc = sortObjectByKey(signDoc);

    const coinType = await this.chainsService.getChainCoinType(chainId);
    const ethereumKeyFeatures =
      await this.chainsService.getChainEthereumKeyFeatures(chainId);
    const isEvm =
      (await this.chainsService.getChainInfo(chainId)).features?.includes(
        "evm"
      ) ?? false;

    if (ethereumKeyFeatures.address || ethereumKeyFeatures.signing) {
      // Check the comment on the method itself.
      if (!isEvm) {
        this.keyRing.throwErrorIfEthermintWithLedgerButNotSupported(chainId);
      }
    }

    const key = await this.keyRing.getKey(
      chainId,
      coinType,
      ethereumKeyFeatures.address
    );
    const bech32Prefix = (await this.chainsService.getChainInfo(chainId))
      .bech32Config.bech32PrefixAccAddr;
    const bech32Address = new Bech32Address(key.address).toBech32(bech32Prefix);
    if (signer !== bech32Address) {
      throw new Error("Signer mismatched");
    }

    let newSignDoc = (await this.interactionService.waitApprove(
      env,
      "/sign",
      "request-sign",
      {
        msgOrigin,
        chainId,
        mode: "amino",
        signDoc,
        signer,
        signOptions,
        isADR36SignDoc: false,
        ethSignType: EthSignType.EIP712,
      }
    )) as StdSignDoc;

    newSignDoc = {
      ...newSignDoc,
      memo: escapeHTML(newSignDoc.memo),
    };

    try {
      const signature = await this.keyRing.signEthereum(
        env,
        chainId,
        coinType,
        Buffer.from(
          JSON.stringify({
            types: eip712.types,
            domain: eip712.domain,
            primaryType: eip712.primaryType,
            message: newSignDoc,
          })
        ),
        EthSignType.EIP712
      );

      const msgTypes = newSignDoc.msgs
        .filter((msg: Msg) => msg.type)
        .map((msg: Msg) => msg.type);

      this.analyticsSerice.logEventIgnoreError("tx_signed", {
        chainId,
        isInternal: env.isInternalMsg,
        origin: msgOrigin,
        ethSignType: EthSignType.EIP712,
        msgTypes,
      });

      return {
        signed: newSignDoc,
        signature: {
          pub_key: encodeSecp256k1Pubkey(key.pubKey),
          // Return eth signature (r | s | v) 65 bytes.
          signature: Buffer.from(signature).toString("base64"),
        },
      };
    } finally {
      this.interactionService.dispatchEvent(APP_PORT, "request-sign-end", {});
    }
  }

  async requestSignDirect(
    env: Env,
    msgOrigin: string,
    chainId: string,
    signer: string,
    signDoc: SignDoc,
    signOptions: KeplrSignOptions
  ): Promise<DirectSignResponse> {
    const coinType = await this.chainsService.getChainCoinType(chainId);
    const ethereumKeyFeatures =
      await this.chainsService.getChainEthereumKeyFeatures(chainId);
    const isEvm =
      (await this.chainsService.getChainInfo(chainId)).features?.includes(
        "evm"
      ) ?? false;

    if (ethereumKeyFeatures.address || ethereumKeyFeatures.signing) {
      // Check the comment on the method itself.
      if (!isEvm) {
        this.keyRing.throwErrorIfEthermintWithLedgerButNotSupported(chainId);
      }
    }

    const key = await this.keyRing.getKey(
      chainId,
      coinType,
      ethereumKeyFeatures.address
    );
    const bech32Address = new Bech32Address(key.address).toBech32(
      (await this.chainsService.getChainInfo(chainId)).bech32Config
        .bech32PrefixAccAddr
    );
    if (signer !== bech32Address) {
      throw new Error("Signer mismatched");
    }

    const newSignDocBytes = (await this.interactionService.waitApprove(
      env,
      "/sign",
      "request-sign",
      {
        msgOrigin,
        chainId,
        mode: "direct",
        signDocBytes: SignDoc.encode(signDoc).finish(),
        signer,
        signOptions,
      }
    )) as Uint8Array;

    const newSignDoc = SignDoc.decode(newSignDocBytes);

    try {
      const signature = await this.keyRing.sign(
        env,
        chainId,
        coinType,
        newSignDocBytes,
        ethereumKeyFeatures.signing,
        SignMode.Direct
      );

      const msgTypes = TxBody.decode(newSignDoc.bodyBytes).messages.map(
        (msg: any) => {
          return msg.typeUrl;
        }
      );

      this.analyticsSerice.logEventIgnoreError("tx_signed", {
        chainId,
        isInternal: env.isInternalMsg,
        origin: msgOrigin,
        signMode: SignMode.Direct,
        msgTypes,
      });

      return {
        signed: {
          ...newSignDoc,
          accountNumber: Long.fromString(newSignDoc.accountNumber),
        },
        signature: encodeSecp256k1Signature(key.pubKey, signature),
      };
    } finally {
      this.interactionService.dispatchEvent(APP_PORT, "request-sign-end", {});
    }
  }

  async requestICNSAdr36Signatures(
    env: Env,
    chainId: string,
    contractAddress: string,
    owner: string,
    username: string,
    addressChainIds: string[]
  ): Promise<
    {
      chainId: string;
      bech32Prefix: string;
      bech32Address: string;
      addressHash: "cosmos" | "ethereum";
      pubKey: Uint8Array;
      signatureSalt: number;
      signature: Uint8Array;
    }[]
  > {
    const r: {
      chainId: string;
      bech32Prefix: string;
      bech32Address: string;
      addressHash: "cosmos" | "ethereum";
      pubKey: Uint8Array;
      signatureSalt: number;
      signature: Uint8Array;
    }[] = [];

    const interactionInfo = {
      chainId,
      owner,
      username,
      accountInfos: [] as {
        chainId: string;
        bech32Prefix: string;
        bech32Address: string;
        pubKey: Uint8Array;
      }[],
    };

    {
      // Do this on other code block to avoid variable conflict.
      const chainInfo = await this.chainsService.getChainInfo(chainId);

      Bech32Address.validate(
        contractAddress,
        chainInfo.bech32Config.bech32PrefixAccAddr
      );

      const key = await this.getKey(chainId);
      const bech32Address = new Bech32Address(key.address).toBech32(
        chainInfo.bech32Config.bech32PrefixAccAddr
      );

      if (bech32Address !== owner) {
        throw new Error(
          `Unmatched owner: (expected: ${bech32Address}, actual: ${owner})`
        );
      }
    }
    const salt = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

    for (const chainId of addressChainIds) {
      const chainInfo = await this.chainsService.getChainInfo(chainId);

      const key = await this.getKey(chainId);

      const bech32Address = new Bech32Address(key.address).toBech32(
        chainInfo.bech32Config.bech32PrefixAccAddr
      );

      interactionInfo.accountInfos.push({
        chainId: chainInfo.chainId,
        bech32Prefix: chainInfo.bech32Config.bech32PrefixAccAddr,
        bech32Address: bech32Address,
        pubKey: key.pubKey,
      });
    }

    await this.interactionService.waitApprove(
      env,
      "/icns/adr36-signatures",
      RequestICNSAdr36SignaturesMsg.type(),
      interactionInfo
    );

    const ownerBech32 = Bech32Address.fromBech32(owner);
    for (const accountInfo of interactionInfo.accountInfos) {
      if (
        ownerBech32.toHex(false) !==
        Bech32Address.fromBech32(accountInfo.bech32Address).toHex(false)
      ) {
        // When only the address is different with owner, the signature is necessary.
        const data = `The following is the information for ICNS registration for ${username}.${accountInfo.bech32Prefix}.

Chain id: ${chainId}
Contract Address: ${contractAddress}
Owner: ${owner}
Salt: ${salt}`;

        const signDoc = makeADR36AminoSignDoc(accountInfo.bech32Address, data);

        const coinType = await this.chainsService.getChainCoinType(
          accountInfo.chainId
        );
        const ethereumKeyFeatures =
          await this.chainsService.getChainEthereumKeyFeatures(
            accountInfo.chainId
          );

        const signature = await this.keyRing
          .sign(
            env,
            accountInfo.chainId,
            coinType,
            serializeSignDoc(signDoc),
            ethereumKeyFeatures.signing,
            SignMode.Message
          )
          .finally(() => {
            if (this.keyRing.type === "keystone") {
              closePopupWindow("default");
            }
          });

        r.push({
          chainId: accountInfo.chainId,
          bech32Prefix: accountInfo.bech32Prefix,
          bech32Address: accountInfo.bech32Address,
          addressHash: ethereumKeyFeatures.signing ? "ethereum" : "cosmos",
          pubKey: new PubKeySecp256k1(accountInfo.pubKey).toBytes(
            // Should return uncompressed format if ethereum.
            // Else return as compressed format.
            ethereumKeyFeatures.signing
          ),
          signatureSalt: salt,
          signature,
        });
      } else {
        // If address is same with owner, there is no need to sign.
        const ethereumKeyFeatures =
          await this.chainsService.getChainEthereumKeyFeatures(
            accountInfo.chainId
          );

        r.push({
          chainId: accountInfo.chainId,
          bech32Prefix: accountInfo.bech32Prefix,
          bech32Address: accountInfo.bech32Address,
          addressHash: ethereumKeyFeatures.signing ? "ethereum" : "cosmos",
          pubKey: new PubKeySecp256k1(accountInfo.pubKey).toBytes(
            // Should return uncompressed format if ethereum.
            // Else return as compressed format.
            ethereumKeyFeatures.signing
          ),
          signatureSalt: 0,
          signature: new Uint8Array(0),
        });
      }
    }

    return r;
  }

  async verifyADR36AminoSignDoc(
    chainId: string,
    signer: string,
    data: Uint8Array,
    signature: StdSignature
  ): Promise<boolean> {
    const coinType = await this.chainsService.getChainCoinType(chainId);
    const ethereumKeyFeatures =
      await this.chainsService.getChainEthereumKeyFeatures(chainId);

    const key = await this.keyRing.getKey(
      chainId,
      coinType,
      ethereumKeyFeatures.address
    );
    const bech32Prefix = (await this.chainsService.getChainInfo(chainId))
      .bech32Config.bech32PrefixAccAddr;
    const bech32Address = new Bech32Address(key.address).toBech32(bech32Prefix);
    if (signer !== bech32Address) {
      throw new Error("Signer mismatched");
    }
    if (signature.pub_key.type !== "tendermint/PubKeySecp256k1") {
      throw new Error(`Unsupported type of pub key: ${signature.pub_key.type}`);
    }
    if (
      Buffer.from(key.pubKey).toString("base64") !== signature.pub_key.value
    ) {
      throw new Error("Pub key unmatched");
    }

    const signDoc = makeADR36AminoSignDoc(signer, data);

    return verifyADR36AminoSignDoc(
      bech32Prefix,
      signDoc,
      Buffer.from(signature.pub_key.value, "base64"),
      Buffer.from(signature.signature, "base64"),
      ethereumKeyFeatures.address ? "ethsecp256k1" : "secp256k1"
    );
  }

  async sign(
    env: Env,
    chainId: string,
    message: Uint8Array
  ): Promise<Uint8Array> {
    return this.keyRing.sign(
      env,
      chainId,
      await this.chainsService.getChainCoinType(chainId),
      message,
      (await this.chainsService.getChainEthereumKeyFeatures(chainId)).signing
    );
  }

  async addMnemonicKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    mnemonic: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    curve: SupportedCurve = KeyCurves.secp256k1
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const result = await this.keyRing.addMnemonicKey(
      kdf,
      mnemonic,
      meta,
      bip44HDPath,
      curve
    );

    return result;
  }

  async addPrivateKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    privateKey: Uint8Array,
    meta: Record<string, string>,
    curve: SupportedCurve = KeyCurves.secp256k1
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const result = await this.keyRing.addPrivateKey(
      kdf,
      privateKey,
      meta,
      curve
    );

    return result;
  }

  async addKeystoneKey(
    env: Env,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const result = await this.keyRing.addKeystoneKey(
      env,
      kdf,
      meta,
      bip44HDPath
    );

    return result;
  }

  async addLedgerKey(
    env: Env,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    cosmosLikeApp?: string
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const result = await this.keyRing.addLedgerKey(
      env,
      kdf,
      meta,
      bip44HDPath,
      cosmosLikeApp
    );

    return result;
  }

  public changeKeyStoreFromMultiKeyStore(index: number): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const operation = this.keyStoreSwitchTail.then(
      () => this.changeKeyStoreFromMultiKeyStoreInternal(index),
      () => this.changeKeyStoreFromMultiKeyStoreInternal(index)
    );

    this.keyStoreSwitchTail = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  private async changeKeyStoreFromMultiKeyStoreInternal(
    index: number
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    try {
      const result = await this.keyRing.changeKeyStoreFromMultiKeyStore(index);
      const currentChainId = await this.chainsService.getSelectedChain();
      if (await this.isCardanoChainSafe(currentChainId)) {
        this.resetCardanoRuntime();
      }
      await this.alignSelectedChainWithCurrentWalletIfNeeded();
      return result;
    } finally {
      // Note: if fallback `setSelectedChain` ran above, it also dispatches
      // `keystore-changed` — duplicate event is benign but can trigger extra UI refresh.
      this.interactionService.dispatchEvent(
        WEBPAGE_PORT,
        "keystore-changed",
        {}
      );
    }
  }

  public checkPassword(password: string): boolean {
    return this.keyRing.checkPassword(password);
  }

  public getCurrentUnlockSessionId(): string {
    return this.keyRing.getCurrentUnlockSessionId();
  }

  public async waitApprove(
    env: Env,
    url: string,
    type: string,
    data: unknown
  ): Promise<unknown> {
    return await this.interactionService.waitApprove(env, url, type, data);
  }

  async updatePassword(oldPassword: string, newPassword: string) {
    return await this.keyRing.updatePassword(oldPassword, newPassword);
  }

  getMultiKeyStoreInfo(): MultiKeyStoreInfoWithSelected {
    return this.keyRing.getMultiKeyStoreInfo();
  }

  isKeyStoreCoinTypeSet(chainId: string): boolean {
    return this.keyRing.isKeyStoreCoinTypeSet(chainId);
  }

  async setKeyStoreCoinType(chainId: string, coinType: number): Promise<void> {
    const prevCoinType = this.keyRing.computeKeyStoreCoinType(
      chainId,
      await this.chainsService.getChainCoinType(chainId)
    );

    await this.keyRing.setKeyStoreCoinType(chainId, coinType);

    if (prevCoinType !== coinType) {
      this.interactionService.dispatchEvent(
        WEBPAGE_PORT,
        "keystore-changed",
        {}
      );
    }
  }

  async getKeyStoreBIP44Selectables(
    chainId: string,
    paths: BIP44[]
  ): Promise<{ readonly path: BIP44; readonly bech32Address: string }[]> {
    if (this.isKeyStoreCoinTypeSet(chainId)) {
      return [];
    }

    const result = [];
    const chainInfo = await this.chainsService.getChainInfo(chainId);

    for (const path of paths) {
      const key = await this.keyRing.getKeyFromCoinType(
        path.coinType,
        (
          await this.chainsService.getChainEthereumKeyFeatures(chainId)
        ).address
      );
      const bech32Address = new Bech32Address(key.address).toBech32(
        chainInfo.bech32Config.bech32PrefixAccAddr
      );

      result.push({
        path,
        bech32Address,
      });
    }

    return result;
  }

  async exportKeyRingDatas(password: string): Promise<ExportKeyRingData[]> {
    return await this.keyRing.exportKeyRingDatas(password);
  }

  async initializeNonDefaultLedgerApp(env: Env, ledgerApp: LedgerApp) {
    return await this.keyRing.initializeNonDefaultLedgerApp(env, ledgerApp);
  }

  async changeKeyRingName(
    env: Env,
    index: number,
    { defaultName, editable }: { defaultName: string; editable: boolean }
  ): Promise<string> {
    const newName = (await this.interactionService.waitApprove(
      env,
      `/setting/keyring/change/name/${index}`,
      "change-keyring-name",
      { defaultName, editable }
    )) as string;

    await this.updateNameKeyRing(index, newName);

    return newName;
  }

  async switchAccountByAddress(
    env: Env,
    address: string,
    origin: string
  ): Promise<void> {
    (await this.interactionService.waitApprove(
      env,
      "/switch-account-by-address",
      SwitchAccountMsg.type(),
      {
        address,
        origin,
      }
    )) as string;
  }

  async getKeys(
    chainId: string,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<(Key & { name: string })[]> {
    const chainInfo = await this.chainsService.getChainInfo(chainId);
    const isCardano = chainInfo.features?.includes("cardano") ?? false;

    if (isCardano) {
      const keys = await this.keyRing.getKeysForCardano(chainId, options);
      // Skip ensureAndRepairAddressCaches for performance - getKeysForCardano() already handles caching
      return keys;
    }

    const useEthereumAddress = (
      await this.chainsService.getChainEthereumKeyFeatures(chainId)
    ).address;
    const keys = await this.keyRing.getKeys(
      chainId,
      useEthereumAddress,
      options
    );
    // Skip ensureAndRepairAddressCaches for performance - getKeys() already handles caching
    return keys;
  }

  private static resolveGenericWalletNameForChain(
    meta: KeyStoreMetaKnown | undefined,
    chainId: string
  ): string {
    if (!meta) {
      return "Unnamed Account";
    }

    let nameByChain: Record<string, string> = {};
    try {
      nameByChain = meta["nameByChain"] ? JSON.parse(meta["nameByChain"]) : {};
    } catch {
      nameByChain = {};
    }

    return nameByChain?.[chainId] || meta["name"] || "Unnamed Account";
  }

  private async ensureAndRepairAddressCaches(
    chainId: string,
    keys: (Key & { name: string })[],
    flags: { isCardano: boolean; isEvm: boolean },
    expectedUnlockSessionId = this.keyRing.getCurrentUnlockSessionId()
  ): Promise<void> {
    const isSessionCurrent = () =>
      this.isAddressCacheRepairSessionCurrent(expectedUnlockSessionId);

    // This prevents returning an empty cache during startup and rejects work
    // captured by an older unlock session.
    if (!isSessionCurrent()) {
      console.warn(
        `[ensureAndRepairAddressCaches] Address-cache session is unavailable or changed for ${chainId}; skipping cache operations.`
      );
      return;
    }

    const chainInfo = await this.chainsService.getChainInfo(chainId);
    const walletInfos = this.keyRing.getMultiKeyStoreInfo();
    const walletIds = walletInfos.map(
      (w) => (w.meta as KeyStoreMetaKnown)?.["__id__"] || ""
    );
    const genericWalletNames = flags.isCardano
      ? []
      : walletInfos.map((walletInfo) =>
          KeyRingService.resolveGenericWalletNameForChain(
            walletInfo.meta as KeyStoreMetaKnown,
            chainId
          )
        );
    const selectedIndex = walletInfos.findIndex((w) => w.selected);
    const activeWalletId =
      selectedIndex >= 0 ? walletIds[selectedIndex] : walletIds[0] || "";

    const displayAddresses = keys.map((key) => {
      if (flags.isCardano) {
        return KeyRingService.isCardanoAddressCapableAlgo(key.algo)
          ? Buffer.from(key.address).toString("utf8")
          : "";
      }
      if (flags.isEvm) {
        return `0x${Buffer.from(key.address).toString("hex")}`;
      }
      const bech32Add = new Bech32Address(key.address).toBech32(
        chainInfo.bech32Config.bech32PrefixAccAddr
      );
      return bech32Add;
    });

    if (flags.isCardano) {
      const cache = await this.keyRing.loadCardanoChainCache(chainId, {
        scryptPriority: "background",
      });
      if (Object.keys(cache).length === 0) {
        const next: Record<string, { address: string; pubKey: string }> = {};
        walletIds.forEach((id, idx) => {
          const key = keys[idx];
          const addr = key ? displayAddresses[idx] || "" : "";
          const pub =
            key && KeyRingService.isCardanoAddressCapableAlgo(key.algo)
              ? Buffer.from(key.pubKey).toString("hex")
              : "";
          next[id] = { address: addr, pubKey: pub };
        });
        if (isSessionCurrent()) {
          await this.keyRing.saveCardanoChainCache(chainId, next);
        }
        return;
      }
    }

    if (!flags.isCardano) {
      const cache = await this.keyRing.loadGenericChainCache(chainId, {
        scryptPriority: "background",
      });
      if (Object.keys(cache).length === 0) {
        const next: Record<
          string,
          {
            address: string;
            name?: string;
            pubKey?: string;
          }
        > = {};
        walletIds.forEach((id, idx) => {
          const key = keys[idx];
          const addressHex = key
            ? Buffer.from(key.address).toString("hex")
            : "";
          const pubKeyHex = key ? Buffer.from(key.pubKey).toString("hex") : "";
          next[id] = {
            address: addressHex,
            name: genericWalletNames[idx],
            pubKey: pubKeyHex,
          };
        });
        if (isSessionCurrent()) {
          await this.keyRing.saveGenericChainCache(chainId, next);
        }
        return;
      }
    }

    const activeKey = selectedIndex >= 0 ? keys[selectedIndex] : null;
    const activeAddressForCheck =
      activeKey && selectedIndex >= 0
        ? flags.isCardano
          ? displayAddresses[selectedIndex]
          : Buffer.from(activeKey.address).toString("hex")
        : "";

    let consistencyResult: ConsistencyCheckResult;
    try {
      if (!isSessionCurrent()) {
        return;
      }
      consistencyResult =
        await this.keyRing.addressCacheManager.checkConsistency(
          chainId,
          walletIds,
          activeWalletId,
          activeAddressForCheck,
          flags.isCardano
        );
    } catch (e: unknown) {
      // "Could not check" is not "inconsistent". Clearing every network's
      // address cache here would cost one key derivation per wallet per
      // network on the next unlock; see KeyRing.reconcileCacheConsistencyAfterSwitch.
      console.warn(
        `[KeyRingService] Skipped cache consistency check for ${chainId}; cache left intact:`,
        e
      );
      return;
    }

    if (!consistencyResult.isConsistent) {
      if (!isSessionCurrent()) {
        // The session that produced this verdict is gone (lock/sign-out), or
        // a newer unlock session is already active with another password.
        return;
      }

      console.warn(
        `Cache inconsistency detected for ${chainId}:`,
        consistencyResult.issues
      );

      await this.keyRing.clearAllAddressCaches({
        shouldContinue: isSessionCurrent,
      });

      if (!isSessionCurrent()) {
        return;
      }

      if (flags.isCardano) {
        const next: Record<string, { address: string; pubKey: string }> = {};
        walletIds.forEach((id, idx) => {
          const key = keys[idx];
          const addr = key ? displayAddresses[idx] || "" : "";
          const pub =
            key && KeyRingService.isCardanoAddressCapableAlgo(key.algo)
              ? Buffer.from(key.pubKey).toString("hex")
              : "";
          next[id] = { address: addr, pubKey: pub };
        });
        await this.keyRing.saveCardanoChainCache(chainId, next);
      } else {
        const next: Record<
          string,
          {
            address: string;
            name?: string;
            pubKey?: string;
          }
        > = {};
        walletIds.forEach((id, idx) => {
          const key = keys[idx];
          const addressHex = key
            ? Buffer.from(key.address).toString("hex")
            : "";
          const pubKeyHex = key ? Buffer.from(key.pubKey).toString("hex") : "";
          next[id] = {
            address: addressHex,
            name: genericWalletNames[idx],
            pubKey: pubKeyHex,
          };
        });
        await this.keyRing.saveGenericChainCache(chainId, next);
      }

      if (!isSessionCurrent()) {
        return;
      }

      try {
        this.interactionService.dispatchEvent(WEBPAGE_PORT, "clear-cache", {
          seq: Date.now(),
        });
      } catch (e) {
        console.error(
          `[KeyRingService] Failed to dispatch clear-cache event:`,
          e
        );
      }
    }
  }
}
