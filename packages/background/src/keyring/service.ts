import {
  KeyRing,
  KeyRingStatus,
  MultiKeyStoreInfoWithSelected,
} from "./keyring";
import { Key, KeyStoreMetaKnown } from "./types";
import { CardanoService } from "../cardano/service";
import {
  CARDANO_ENSURE_MESSAGE,
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
import { getDefaultFallbackChainId } from "./default-chain";
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
    this.chainsService.addNetworkSwitchHandler(this.onNetworkSwitch);
    this.analyticsSerice = analyticsSerice;
  }

  protected readonly onChainRemoved = (chainId: string) => {
    this.keyRing.removeAllKeyStoreCoinType(chainId);
  };

  private async isCardanoChain(chainId: string): Promise<boolean> {
    const chainInfo = await this.chainsService.getChainInfo(chainId);
    return chainInfo.features?.includes("cardano") ?? false;
  }

  public async isRegisteredCardanoChain(chainId: string): Promise<boolean> {
    return this.isCardanoChain(chainId);
  }

  public async reinitializeCardanoService(chainId: string): Promise<void> {
    if (this.keyRing.status !== KeyRingStatus.UNLOCKED) {
      throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
    }
    if (!(await this.isRegisteredCardanoChain(chainId))) {
      throw new Error(formatNetworkContextInvalidForCardano(chainId));
    }

    this.cardanoService.reset();
    this.cardanoRestoreByChainId.clear();
    await this.ensureCardanoServiceReady(chainId);
  }

  /**
   * Runs in background after setSelectedChain (fire-and-forget).
   * First ListAccounts/getKey for the new chain may wait for restore or cache fill in background;
   * ensureCardanoServiceReady restores when needed so correctness is preserved.
   */
  protected readonly onNetworkSwitch = async (
    oldChainId: string | undefined,
    newChainId: string
  ): Promise<void> => {
    let cardanoRuntimeTouched = false;
    try {
      if (this.keyRing.status !== KeyRingStatus.UNLOCKED) {
        return;
      }

      const targetChainId = newChainId;
      const currentChainId = await this.chainsService.getSelectedChain();
      if (currentChainId !== targetChainId) {
        return;
      }

      const chainInfo = await this.chainsService.getChainInfo(newChainId);
      const isCardano = chainInfo.features?.includes("cardano") ?? false;

      if (isCardano) {
        const stillCurrent = await this.chainsService.getSelectedChain();
        if (stillCurrent !== targetChainId) {
          return;
        }
        cardanoRuntimeTouched = true;
        await this.ensureCardanoServiceReady(newChainId);
      }
    } catch (error) {
      if (cardanoRuntimeTouched) {
        // Cleanup touched Cardano runtime state to avoid cross-chain stale side effects
        // when selected chain rollback is triggered by ChainsService.
        this.cardanoService.reset();
        this.cardanoRestoreByChainId.clear();

        // Best-effort restore old Cardano context after rollback.
        try {
          if (
            oldChainId &&
            (await this.isCardanoChain(oldChainId)) &&
            this.keyRing.status === KeyRingStatus.UNLOCKED
          ) {
            const ks = this.keyRing.getCurrentKeyStore();
            if (ks && walletSupportsCardano(ks)) {
              await this.cardanoService.restoreFromKeyStore(
                ks,
                this.keyRing.currentPassword,
                this.crypto,
                oldChainId
              );
            }
          }
        } catch (rollbackError) {
          console.error(
            "[KeyRingService] Failed to restore old Cardano context after switch failure:",
            rollbackError
          );
        }
      }
      console.error(
        `Network switch consistency check failed for ${newChainId}:`,
        error
      );
      throw error;
    }

    // Non-critical post-commit step: cache repair should not fail network switch commit.
    this.runAddressCacheRepairBestEffort(newChainId).catch((error) => {
      console.error(
        `[KeyRingService] Post-switch cache repair failed for ${newChainId}:`,
        error
      );
    });
  };

  private async runAddressCacheRepairBestEffort(
    chainId: string
  ): Promise<void> {
    if (this.keyRing.status !== KeyRingStatus.UNLOCKED) {
      return;
    }
    const currentChainId = await this.chainsService.getSelectedChain();
    if (currentChainId !== chainId) {
      return;
    }

    const chainInfo = await this.chainsService.getChainInfo(chainId);
    const isCardano = chainInfo.features?.includes("cardano") ?? false;
    const isEvm = chainInfo.features?.includes("evm") ?? false;
    const keys = isCardano
      ? await this.keyRing.getKeysForCardano(chainId)
      : await this.keyRing.getKeys(chainId, isEvm);
    await this.ensureAndRepairAddressCaches(chainId, keys, {
      isCardano,
      isEvm,
    });
  }

  async restore(): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    await this.keyRing.restore();
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
        this.cardanoService.reset();
        this.cardanoRestoreByChainId.clear();
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
        void (out as Promise<unknown>).catch(() => {});
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
    let currentChainId: string | undefined;
    try {
      const { ExtensionKVStore } = await import("@keplr-wallet/common");
      const kvStore = new ExtensionKVStore("store_chain_config");
      currentChainId = await kvStore.get<string>(
        "extension_last_view_chain_id"
      );
    } catch (error) {
      console.warn("Failed to get current chainId for Cardano meta:", error);
    }

    const cardanoMeta = await this.cardanoService
      .createMetaFromMnemonic(mnemonic, password, currentChainId)
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
    this.cardanoService.reset();
    this.cardanoRestoreByChainId.clear();
    return this.keyRing.status;
  }

  async unlock(password: string): Promise<KeyRingStatus> {
    await this.keyRing.unlock(password);

    const ks = this.keyRing.getCurrentKeyStore();

    if (ks && walletSupportsCardano(ks)) {
      try {
        const currentChainId = await this.chainsService.getSelectedChain();
        if (!currentChainId) {
          throw new Error(CARDANO_ENSURE_MESSAGE.NETWORK_CONTEXT_MISSING);
        }
        const shouldInitCardano = await this.isCardanoChain(currentChainId);
        if (shouldInitCardano) {
          await this.cardanoService.restoreFromKeyStore(
            ks,
            this.keyRing.currentPassword,
            this.crypto,
            currentChainId
          );
        } else {
          // Keep Cardano detached when active chain is non-Cardano.
          this.cardanoService.reset();
          this.cardanoRestoreByChainId.clear();
        }
      } catch (error) {
        console.error(
          "[KeyRingService] Failed to initialize CardanoService:",
          error
        );
        throw error;
      }
    }

    return this.keyRing.status;
  }

  async getKey(chainId: string): Promise<Key> {
    const chainInfo = await this.chainsService.getChainInfo(chainId);

    if (chainInfo.features?.includes("cardano")) {
      await this.ensureCardanoServiceReady(chainId);
      return await this.cardanoService.getKey(chainId);
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

  private cardanoServiceInitPromise: Promise<void> | null = null;
  /** Deduplicates restore-by-chainId so parallel ListAccountsMsg for the same chain share one promise. */
  private cardanoRestoreByChainId: Map<string, Promise<void>> = new Map();

  public async ensureCardanoServiceReady(chainId?: string): Promise<void> {
    // If service is initialized but not ready, try to restore with chainId.
    // Restore/init errors are fail-closed and must reject.
    if (this.cardanoService.isInitialized() && !this.cardanoService.isReady()) {
      if (!chainId) {
        throw new Error(CARDANO_ENSURE_MESSAGE.NETWORK_CONTEXT_MISSING);
      }
      if (!(await this.isCardanoChain(chainId))) {
        throw new Error(formatNetworkContextInvalidForCardano(chainId));
      }
      // Deduplication: get then create then set in the same sync turn; no await/then between get and set
      // so concurrent callers always see the same promise.
      const existing = this.cardanoRestoreByChainId.get(chainId);
      if (existing) {
        await existing;
        this.assertCardanoServiceReady(chainId);
        return;
      }
      const promise = new Promise<void>((resolve, reject) => {
        (async () => {
          try {
            const ks = this.keyRing.getCurrentKeyStore();
            if (ks && this.keyRing.status === KeyRingStatus.UNLOCKED) {
              await this.cardanoService.restoreFromKeyStore(
                ks,
                this.keyRing.currentPassword,
                this.crypto,
                chainId
              );
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        })();
      });
      // Set must run in the same sync turn after creating the promise.
      this.cardanoRestoreByChainId.set(chainId, promise);
      promise.finally(() => this.cardanoRestoreByChainId.delete(chainId));
      await promise;
      this.assertCardanoServiceReady(chainId);
      return;
    }

    if (!this.cardanoService.isInitialized()) {
      if (this.cardanoServiceInitPromise) {
        await this.cardanoServiceInitPromise;
        this.assertCardanoServiceReady(chainId);
        return;
      }

      const ks = this.keyRing.getCurrentKeyStore();

      if (ks && this.keyRing.status === KeyRingStatus.UNLOCKED) {
        const promise = this.initializeCardanoService(ks, chainId);
        this.cardanoServiceInitPromise = promise;
        try {
          await promise;
          this.assertCardanoServiceReady(chainId);
        } catch (error) {
          console.error(
            "[KeyRingService] Failed to initialize CardanoService:",
            error
          );
          throw error;
        } finally {
          this.cardanoServiceInitPromise = null;
        }
      } else {
        throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
      }
    }

    this.assertCardanoServiceReady(chainId);
  }

  private assertCardanoServiceReady(chainId?: string): void {
    const runtimeState = this.cardanoService.getRuntimeState();
    if (runtimeState === "provider_unavailable") {
      throw new Error(formatProviderUnavailableError(chainId));
    }
    if (!this.cardanoService.isReady()) {
      throw new Error(formatWalletNotReadyError(chainId));
    }
  }

  private async initializeCardanoService(
    ks: any,
    chainId?: string
  ): Promise<void> {
    if (walletShouldLeaveCardanoChain(ks)) {
      throw new Error(CARDANO_ENSURE_MESSAGE.MNEMONIC_24);
    }
    try {
      const currentChainId =
        chainId || (await this.chainsService.getSelectedChain());
      if (!currentChainId) {
        throw new Error(CARDANO_ENSURE_MESSAGE.NETWORK_CONTEXT_MISSING);
      }
      if (!(await this.isCardanoChain(currentChainId))) {
        throw new Error(formatNetworkContextInvalidForCardano(currentChainId));
      }
      await this.cardanoService.restoreFromKeyStore(
        ks,
        this.keyRing.currentPassword,
        this.crypto,
        currentChainId
      );
    } catch (error) {
      console.error(
        "[KeyRingService] Failed to initialize CardanoService:",
        error
      );
      throw error;
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

  public async changeKeyStoreFromMultiKeyStore(index: number): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    try {
      const result = await this.keyRing.changeKeyStoreFromMultiKeyStore(index);
      this.cardanoService.reset();
      this.cardanoRestoreByChainId.clear();
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

  async getKeys(chainId: string): Promise<(Key & { name: string })[]> {
    const chainInfo = await this.chainsService.getChainInfo(chainId);
    const isEvm = chainInfo.features?.includes("evm") ?? false;
    const isCardano = chainInfo.features?.includes("cardano") ?? false;

    if (!isCardano) {
      const keys = await this.keyRing.getKeys(chainId, isEvm);
      // Skip ensureAndRepairAddressCaches for performance - getKeys() already handles caching
      return keys;
    }

    if (isCardano) {
      const keys = await this.keyRing.getKeysForCardano(chainId);
      // Skip ensureAndRepairAddressCaches for performance - getKeysForCardano() already handles caching
      return keys;
    }

    const keys = await this.keyRing.getKeys(chainId, isEvm);
    // Skip ensureAndRepairAddressCaches for performance - getKeys() already handles caching
    return keys;
  }

  private async ensureAndRepairAddressCaches(
    chainId: string,
    keys: (Key & { name: string })[],
    flags: { isCardano: boolean; isEvm: boolean }
  ): Promise<void> {
    // This prevents returning empty cache and recalculating addresses on extension startup
    if (!this.keyRing.addressCacheManager.hasPassword()) {
      console.warn(
        `[ensureAndRepairAddressCaches] Password not set in cache manager for ${chainId}, skipping cache operations. ` +
          `This can happen during extension startup before unlock completes.`
      );
      return;
    }

    const chainInfo = await this.chainsService.getChainInfo(chainId);
    const walletInfos = this.keyRing.getMultiKeyStoreInfo();
    const walletIds = walletInfos.map(
      (w) => (w.meta as KeyStoreMetaKnown)?.["__id__"] || ""
    );
    const walletNames = walletInfos.map(
      (w) => (w.meta as KeyStoreMetaKnown)?.["name"] || "Unnamed Account"
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
      const cache = await this.keyRing.loadCardanoChainCache(chainId);
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
        await this.keyRing.saveCardanoChainCache(chainId, next);
        return;
      }
    }

    if (!flags.isCardano) {
      const cache = await this.keyRing.loadGenericChainCache(chainId);
      if (Object.keys(cache).length === 0) {
        const next: Record<
          string,
          {
            address: string;
            name?: string;
            pubKey?: string;
            mnemonicLength?: string;
          }
        > = {};
        walletIds.forEach((id, idx) => {
          const key = keys[idx];
          const walletInfo = walletInfos[idx];
          const addressHex = key
            ? Buffer.from(key.address).toString("hex")
            : "";
          const pubKeyHex = key ? Buffer.from(key.pubKey).toString("hex") : "";
          const mnemonicLength = walletInfo?.meta?.["mnemonicLength"];
          next[id] = {
            address: addressHex,
            name: walletNames[idx],
            pubKey: pubKeyHex,
            mnemonicLength: mnemonicLength,
          };
        });
        await this.keyRing.saveGenericChainCache(chainId, next);
        return;
      }
    }

    // For consistency check, use display address (matches cache format)
    const activeKey = selectedIndex >= 0 ? keys[selectedIndex] : null;
    const activeAddressForCheck =
      activeKey && selectedIndex >= 0 ? displayAddresses[selectedIndex] : "";

    const consistencyResult =
      await this.keyRing.addressCacheManager.checkConsistency(
        chainId,
        walletIds,
        walletNames,
        activeWalletId,
        activeAddressForCheck,
        flags.isCardano
      );

    if (!consistencyResult.isConsistent) {
      console.warn(
        `Cache inconsistency detected for ${chainId}:`,
        consistencyResult.issues
      );

      await this.keyRing.clearAllAddressCaches();

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
            mnemonicLength?: string;
          }
        > = {};
        walletIds.forEach((id, idx) => {
          const key = keys[idx];
          const walletInfo = walletInfos[idx];
          const addressHex = key
            ? Buffer.from(key.address).toString("hex")
            : "";
          const pubKeyHex = key ? Buffer.from(key.pubKey).toString("hex") : "";
          const mnemonicLength = walletInfo?.meta?.["mnemonicLength"];
          next[id] = {
            address: addressHex,
            name: walletNames[idx],
            pubKey: pubKeyHex,
            mnemonicLength: mnemonicLength,
          };
        });
        await this.keyRing.saveGenericChainCache(chainId, next);
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
