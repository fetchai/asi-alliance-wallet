import { Crypto } from "./crypto";
import {
  KeyStore,
  BIP44HDPath,
  CommonCrypto,
  ExportKeyRingData,
  SignMode,
  SupportedCurve,
  Key,
  ScryptPriority,
} from "./types";
import {
  Hash,
  Mnemonic,
  PrivKeySecp256k1,
  PubKeySecp256k1,
  SecretKey,
  KeyCurve,
  KeyCurves,
} from "@keplr-wallet/crypto";
import { KVStore, MultiGet } from "@keplr-wallet/common";
import { LedgerApp, LedgerService } from "../ledger";
import { ChainInfo, EthSignType } from "@keplr-wallet/types";
import { Env, WEBPAGE_PORT } from "@keplr-wallet/router";

import { Buffer } from "buffer/";
import { ChainIdHelper, EthermintChainIdHelper } from "@keplr-wallet/cosmos";

import { Wallet } from "@ethersproject/wallet";
import * as BytesUtils from "@ethersproject/bytes";
import { computeAddress } from "@ethersproject/transactions";
import { EIP712MessageValidator } from "./eip712";
import { domainHash, messageHash } from "./utils";
import { KeystoneService } from "../keystone";
import { publicKeyConvert } from "secp256k1";
import { KeystoneKeyringData } from "../keystone/cosmos-keyring";
import { InteractionService } from "../interaction";
import { AddressCacheManager } from "./cache-manager";
import { isValidCardanoAddress } from "@keplr-wallet/cardano";

export enum KeyRingStatus {
  NOTLOADED,
  EMPTY,
  LOCKED,
  UNLOCKED,
}

type SessionKeyStoreMaterial =
  | { type: "mnemonic"; mnemonicMasterSeed: Uint8Array }
  | { type: "privateKey"; privateKey: Uint8Array }
  | {
      type: "ledger";
      ledgerPublicKeyCache: Record<string, Uint8Array | undefined>;
    }
  | { type: "keystone"; keystonePublicKey: KeystoneKeyringData };

type UnlockSessionContext = {
  password: string;
  unlockSessionId: string;
};

type LegacyMirrorFingerprints = {
  selected: string;
  multi: string;
};

type LegacyMirrorState =
  | {
      status: "pending";
      previous: LegacyMirrorFingerprints;
      target: LegacyMirrorFingerprints;
    }
  | {
      status: "synced";
      fingerprint: LegacyMirrorFingerprints;
    };

type PersistedKeyRingState = {
  selectedId: string | null;
  keyStores: KeyStore[];
  /** Diagnostic generation; source selection relies on mirror fingerprints. */
  revision?: number;
  legacyMirror?: LegacyMirrorState;
};

export type MultiKeyStoreInfoElem = Pick<
  KeyStore,
  "version" | "type" | "meta" | "bip44HDPath" | "coinTypeForChain" | "curve"
>;
export type MultiKeyStoreInfo = MultiKeyStoreInfoElem[];
export type MultiKeyStoreInfoWithSelectedElem = MultiKeyStoreInfoElem & {
  selected: boolean;
};
export type MultiKeyStoreInfoWithSelected = MultiKeyStoreInfoWithSelectedElem[];

export {
  walletSupportsCardano,
  walletShouldLeaveCardanoChain,
} from "./cardano-wallet-guards";

const KeyStoreKey = "key-store";
const KeyMultiStoreKey = "key-multi-store";
const KeyRingStateV2Key = "keyring-state:v2";
const KeyRingPersistenceKeys = [
  KeyRingStateV2Key,
  KeyStoreKey,
  KeyMultiStoreKey,
] as const;
const ErrUndefinedLedgerKeeper = new Error("Ledger keeper is not defined");
const UNLOCK_MAINTENANCE_GRACE_MS = 5000;
const UNLOCK_CACHE_WARMUP_GRACE_MS = 5000;

type KeyRingPersistenceSnapshot = {
  persisted: unknown;
  incrementalNumber?: unknown;
  legacy: {
    selected: unknown;
    multi: unknown;
  };
};

type ResolvedKeyRingState = {
  keyStores: KeyStore[];
  selectedId: string | null;
  selectedFingerprint: string | null;
};

function hasMultiGet(kvStore: KVStore): kvStore is KVStore & MultiGet {
  return (
    typeof (kvStore as KVStore & Partial<MultiGet>).multiGet === "function"
  );
}

// Cardano constants moved to CardanoService

/*
 Keyring stores keys in persistent backround.
 And, this manages the state, crypto, address, signing and so on...
 */
export class KeyRing {
  private static readonly SAFE_META_KEYS = new Set<string>([
    "__id__",
    "name",
    "nameByChain",
    "mnemonicLength",
    "cardano",
    "coinType",
    "__ledger__cosmos_app_like__",
    "email",
    "exportKeyRingDataDuplicationCheckKey",
  ]);
  private static readonly LEGACY_SENSITIVE_META_KEYS = new Set<string>([
    "cardanoSerializedAgent",
  ]);
  private cached: Map<string, Uint8Array> = new Map();
  private cardanoKeyCache: Map<
    string,
    { address: Uint8Array; pubKey: Uint8Array }
  > = new Map();
  private cardanoKeyFlights: Map<string, Promise<Key>> = new Map();
  private cardanoKeyGeneration = 0;
  private cacheManager: AddressCacheManager;

  private loaded: boolean;

  /**
   * Keyring can have either private key or mnemonic.
   * If keyring has private key, it can't set the BIP 44 path.
   */
  private _privateKey?: Uint8Array;
  private _mnemonicMasterSeed?: Uint8Array;
  private _ledgerPublicKeyCache?: Record<string, Uint8Array | undefined>;
  private _keystonePublicKeyCache?: KeystoneKeyringData;
  // Cardano-specific handling moved to CardanoService

  /**
   * The selected keystore is identified inside multiKeyStore instead of being
   * stored as a second, independently mutable copy.
   */
  private selectedKeyStoreId: string | null = null;

  private get keyStore(): KeyStore | null {
    if (!this.selectedKeyStoreId) {
      return null;
    }

    return (
      this.multiKeyStore.find(
        (keyStore) =>
          KeyRing.getKeyStoreId(keyStore) === this.selectedKeyStoreId
      ) ?? null
    );
  }

  public getCurrentKeyStore(): KeyStore | null {
    return this.keyStore;
  }

  public get addressCacheManager(): AddressCacheManager {
    return this.cacheManager;
  }

  private multiKeyStore: KeyStore[];

  private password: string = "";
  private unlockSessionId: string = "";
  private lifecycleGeneration = 0;
  private unlockCacheWarmupTimer?: ReturnType<typeof setTimeout>;
  private unlockMaintenanceTimer?: ReturnType<typeof setTimeout>;
  private unlockMaintenanceFlight?: Promise<void>;
  private unlockMaintenanceFlightSessionId = "";
  private detachedBackgroundWork = new Set<Promise<void>>();
  private disposed = false;
  private disposeFlight?: Promise<void>;
  private initialKeyCreationInProgress = false;
  private unlockInProgress = false;
  /** Prevent an older mirror finalization from overwriting a newer v2 save. */
  private persistStateTail: Promise<void> = Promise.resolve();
  /**
   * Serialize wallet-array commit stages. Expensive device/KDF/decrypt work is
   * prepared before entering this queue; the callback must rebuild its change
   * from the then-current array and keep the queue until persistence settles.
   */
  private keyRingMutationTail: Promise<void> = Promise.resolve();
  private pendingAddOperations = 0;
  /**
   * Serialize only wallet-ID allocation. This is deliberately independent of
   * persistStateTail: ID monotonicity and keyring-generation persistence have
   * different failure and ordering semantics.
   */
  private idAllocationTail: Promise<void> = Promise.resolve();

  /**
   * Run cache migration once per unlock session to avoid delay on every wallet switch.
   * Session = from unlock() until lock(); migration runs at most once per session.
   */
  private cacheMigrationDoneThisSession = false;

  /**
   * Decrypted signing material per wallet for the current unlock session.
   * Cleared on lock/password change; avoids re-scrypt on account switch.
   */
  private sessionKeyStoreMaterial = new Map<string, SessionKeyStoreMaterial>();

  constructor(
    private readonly embedChainInfos: ChainInfo[],
    private readonly kvStore: KVStore,
    // TODO: use an interface instead of `LedgerService` class for easier testing.
    private readonly ledgerKeeper: LedgerService,
    private readonly keystoneService: KeystoneService,
    private readonly interactionService: InteractionService,
    private readonly crypto: CommonCrypto,
    private readonly chainsService: any
  ) {
    this.loaded = false;

    this.cacheManager = new AddressCacheManager({
      kvStore: this.kvStore,
      crypto: this.crypto,
      embedChainInfos: this.embedChainInfos,
    });
    this.multiKeyStore = [];
  }

  public async loadCardanoChainCache(
    chainId: string,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<Record<string, { address: string; pubKey: string }>> {
    return await this.cacheManager.loadCardanoCache(chainId, options);
  }

  public async saveCardanoChainCache(
    chainId: string,
    cache: Record<string, { address: string; pubKey: string }>,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<void> {
    await this.cacheManager.saveCardanoCache(chainId, cache, options);
  }

  /**
   * Clear only in-memory Cardano cache.
   * Persistent cache is preserved to avoid re-derivation on unlock.
   */
  public clearCardanoMemoryCache(): void {
    this.cardanoKeyGeneration += 1;
    this.cardanoKeyCache.clear();
    this.cardanoKeyFlights.clear();
  }

  private removeCardanoMemoryCacheForWallet(walletId: string): void {
    if (!walletId) return;

    // Invalidate single-key flights created by getCardanoKeyForKeyStore so
    // they cannot repopulate the memory cache after this cleanup completes.
    this.cardanoKeyGeneration += 1;
    for (const info of this.embedChainInfos) {
      if (info?.features?.includes("cardano")) {
        const keyId = `cardano:${info.chainId}:${walletId}`;
        this.cardanoKeyCache.delete(keyId);
        this.cardanoKeyFlights.delete(keyId);
      }
    }
  }

  public async loadGenericChainCache(
    chainId: string,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<
    Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
      }
    >
  > {
    return await this.cacheManager.loadGenericCache(chainId, options);
  }

  public async saveGenericChainCache(
    chainId: string,
    cache: Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
      }
    >,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<void> {
    await this.cacheManager.saveGenericCache(chainId, cache, options);
  }

  /**
   * Migrate existing plain text cache data to encrypted format.
   * This method should be called during unlock to ensure all caches are encrypted.
   */
  public async migrateCacheToEncrypted(): Promise<void> {
    await this.cacheManager.migrateToEncrypted();
  }

  public async clearAllAddressCaches(): Promise<void> {
    this.clearCardanoMemoryCache();
    await this.cacheManager.clearAllCaches();
  }

  public static getTypeOfKeyStore(
    keyStore: Omit<KeyStore, "crypto">
  ): "mnemonic" | "privateKey" | "ledger" | "keystone" {
    const type = keyStore["type"];
    if (type == null) {
      return "mnemonic";
    }

    if (
      type !== "mnemonic" &&
      type !== "privateKey" &&
      type !== "ledger" &&
      type !== "keystone"
    ) {
      throw new Error("Invalid type of key store");
    }

    return type;
  }

  public get type():
    | "mnemonic"
    | "privateKey"
    | "ledger"
    | "keystone"
    | "none" {
    if (!this.keyStore) {
      return "none";
    } else {
      return KeyRing.getTypeOfKeyStore(this.keyStore);
    }
  }

  public get curve(): KeyCurve {
    const curve = this.keyStore?.curve;
    if (curve === undefined) {
      throw new Error("Unable to lookup curve");
    }
    return curve;
  }

  public isLocked(): boolean {
    const locked =
      this.privateKey == null &&
      this.mnemonicMasterSeed == null &&
      this.ledgerPublicKeyCache == null &&
      this.keystonePublicKey == null;

    return locked;
  }

  private get privateKey(): Uint8Array | undefined {
    return this._privateKey;
  }

  private set privateKey(privateKey: Uint8Array | undefined) {
    this.clearCaches();
    this._privateKey = privateKey;
  }

  private get mnemonicMasterSeed(): Uint8Array | undefined {
    return this._mnemonicMasterSeed;
  }

  private set mnemonicMasterSeed(masterSeed: Uint8Array | undefined) {
    this.clearCaches();
    this._mnemonicMasterSeed = masterSeed;
  }

  private get keystonePublicKey(): KeystoneKeyringData | undefined {
    return this._keystonePublicKeyCache;
  }

  private set keystonePublicKey(publicKey: KeystoneKeyringData | undefined) {
    this.clearCaches();
    this._keystonePublicKeyCache = publicKey;
  }

  private get ledgerPublicKeyCache():
    | Record<string, Uint8Array | undefined>
    | undefined {
    return this._ledgerPublicKeyCache;
  }

  private set ledgerPublicKeyCache(
    publicKeys: Record<string, Uint8Array | undefined> | undefined
  ) {
    this.clearCaches();
    this._ledgerPublicKeyCache = publicKeys;
  }

  public get status(): KeyRingStatus {
    if (!this.loaded) {
      return KeyRingStatus.NOTLOADED;
    }

    if (!this.keyStore) {
      return KeyRingStatus.EMPTY;
    } else if (!this.isLocked()) {
      return KeyRingStatus.UNLOCKED;
    } else {
      return KeyRingStatus.LOCKED;
    }
  }

  public getKeyStoreCoinType(chainId: string): number | undefined {
    if (!this.keyStore) {
      return undefined;
    }

    if (!this.keyStore.coinTypeForChain) {
      return undefined;
    }

    return this.keyStore.coinTypeForChain[
      ChainIdHelper.parse(chainId).identifier
    ];
  }

  /**
   * Unified async getKey for all supported chains (Cosmos, Ethereum, Cardano).
   * For Cardano, uses Cardano SDK (Lace-style). For others, wraps sync logic in Promise.resolve.
   */
  public async getKey(
    chainId: string,
    defaultCoinType: number,
    useEthereumAddress: boolean
  ): Promise<Key> {
    // Check if KeyRing is ready before attempting to get key
    if (this.status === KeyRingStatus.NOTLOADED) {
      throw new Error(
        "KeyRing is not ready yet. Please wait for initialization to complete."
      );
    }

    // determine base coin type later via computeKeyStoreCoinType or higher-level service
    return Promise.resolve(
      this.loadKey(
        this.computeKeyStoreCoinType(chainId, defaultCoinType),
        useEthereumAddress
      )
    );
  }

  public getKeyStoreMeta(key: string): string {
    if (!this.keyStore || this.keyStore.meta == null) {
      return "";
    }

    return this.keyStore.meta[key] ?? "";
  }

  public get currentPassword(): string {
    return this.password;
  }

  public computeKeyStoreCoinType(
    chainId: string,
    defaultCoinType: number
  ): number {
    if (!this.keyStore) {
      throw new Error("Key store is empty");
    }

    // Fix a coin type if it is 60 (metamask compatibility).
    // XXX: Actually, this is required because there are users who the coin type was set as not 60 for evmos on mobile.
    //      The reason of this problem is unknown, maybe the reason is from the difference of handling suggesting chain on extension and mobile.
    if (defaultCoinType === 60) {
      return 60;
    }

    return this.keyStore.coinTypeForChain
      ? this.keyStore.coinTypeForChain[
          ChainIdHelper.parse(chainId).identifier
        ] ?? defaultCoinType
      : defaultCoinType;
  }

  public getKeyFromCoinType(
    coinType: number,
    useEthereumAddress: boolean
  ): Key {
    return this.loadKey(coinType, useEthereumAddress);
  }

  private async beginInitialKeyCreation(): Promise<void> {
    if (this.initialKeyCreationInProgress) {
      throw new Error("Key ring initialization is already in progress");
    }

    this.initialKeyCreationInProgress = true;
    try {
      if (this.status === KeyRingStatus.NOTLOADED) {
        await this.restore();
      }
      if (this.status !== KeyRingStatus.EMPTY) {
        throw new Error("Key ring is not loaded or not empty");
      }
    } catch (e: unknown) {
      this.initialKeyCreationInProgress = false;
      throw e;
    }
  }

  public async createMnemonicKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    mnemonic: string,
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    curve: SupportedCurve
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    await this.beginInitialKeyCreation();

    try {
      const words = mnemonic.trim().split(/\s+/);
      const mnemonicLength = words.length.toString();
      const metaWithMnemonicLength = {
        ...meta,
        mnemonicLength: mnemonicLength,
      };

      // Cardano meta injected by KeyRingService when needed
      const mnemonicMasterSeed =
        Mnemonic.generateMasterSeedFromMnemonic(mnemonic);
      const keyStore = await KeyRing.CreateMnemonicKeyStore(
        this.crypto,
        kdf,
        mnemonic,
        password,
        await this.assignKeyStoreIdMeta(metaWithMnemonicLength),
        bip44HDPath,
        curve
      );
      this.multiKeyStore.push(keyStore);
      const unlockSessionId = this.activateUnlockSession(password);
      this.commitActiveKeyStoreForSession(
        keyStore,
        {
          type: "mnemonic",
          mnemonicMasterSeed,
        },
        { password, unlockSessionId }
      );
      await this.save();

      this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});
      return {
        status: this.status,
        multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
      };
    } finally {
      this.initialKeyCreationInProgress = false;
    }
  }

  public async createPrivateKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    privateKey: Uint8Array,
    password: string,
    meta: Record<string, string>,
    curve: SupportedCurve
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    await this.beginInitialKeyCreation();

    try {
      const keyStore = await KeyRing.CreatePrivateKeyStore(
        this.crypto,
        kdf,
        privateKey,
        password,
        await this.assignKeyStoreIdMeta(meta),
        curve
      );
      this.multiKeyStore.push(keyStore);
      const unlockSessionId = this.activateUnlockSession(password);
      this.commitActiveKeyStoreForSession(
        keyStore,
        { type: "privateKey", privateKey: new Uint8Array(privateKey) },
        { password, unlockSessionId }
      );
      await this.save();
      this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});

      return {
        status: this.status,
        multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
      };
    } finally {
      this.initialKeyCreationInProgress = false;
    }
  }

  public async createKeystoneKey(
    env: Env,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    await this.beginInitialKeyCreation();

    try {
      if (!this.ledgerKeeper) {
        throw ErrUndefinedLedgerKeeper;
      }

      // Get public key first
      const publicKey = await this.keystoneService.getPubkey(env, bip44HDPath);

      const keyStore = await KeyRing.CreateKeystoneKeyStore(
        this.crypto,
        kdf,
        publicKey,
        password,
        await this.assignKeyStoreIdMeta(meta),
        bip44HDPath
      );

      this.multiKeyStore.push(keyStore);
      const unlockSessionId = this.activateUnlockSession(password);
      this.commitActiveKeyStoreForSession(
        keyStore,
        { type: "keystone", keystonePublicKey: publicKey },
        { password, unlockSessionId }
      );
      await this.save();

      this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});

      return {
        status: this.status,
        multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
      };
    } finally {
      this.initialKeyCreationInProgress = false;
    }
  }

  public async createLedgerKey(
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
    await this.beginInitialKeyCreation();

    try {
      if (cosmosLikeApp) {
        meta = {
          ...meta,
          __ledger__cosmos_app_like__: cosmosLikeApp,
        };
      }

      // Get public key first
      const publicKey = await this.ledgerKeeper.getPublicKey(
        env,
        LedgerApp.Cosmos,
        bip44HDPath,
        cosmosLikeApp
      );

      const pubKeys = {
        [LedgerApp.Cosmos]: publicKey,
      };

      const keyStore = await KeyRing.CreateLedgerKeyStore(
        this.crypto,
        kdf,
        pubKeys,
        password,
        await this.assignKeyStoreIdMeta(meta),
        bip44HDPath
      );

      this.multiKeyStore.push(keyStore);
      const unlockSessionId = this.activateUnlockSession(password);
      this.commitActiveKeyStoreForSession(
        keyStore,
        { type: "ledger", ledgerPublicKeyCache: pubKeys },
        { password, unlockSessionId }
      );
      await this.save();

      this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});
      return {
        status: this.status,
        multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
      };
    } finally {
      this.initialKeyCreationInProgress = false;
    }
  }

  public lock() {
    if (this.status !== KeyRingStatus.UNLOCKED) {
      throw new Error("Key ring is not unlocked");
    }
    this.cacheMigrationDoneThisSession = false;
    this.invalidateUnlockSession();
    this.clearSessionKeyStoreMaterial();
    this.clearCaches();
    this.password = "";

    this.cacheManager.setPassword("");

    this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});
  }

  private activateUnlockSession(password: string): string {
    if (this.disposed) {
      throw new Error("Key ring is disposed");
    }
    this.cancelUnlockCacheWarmup();
    this.cancelUnlockMaintenance();
    this.lifecycleGeneration += 1;
    this.password = password;
    const unlockSessionId = this.createUnlockSessionId();
    this.unlockSessionId = unlockSessionId;
    this.cacheManager.setPassword(password);
    this.clearCardanoMemoryCache();
    this.scheduleUnlockCacheWarmup(password, unlockSessionId);
    return unlockSessionId;
  }

  private invalidateUnlockSession(): number {
    this.cancelUnlockCacheWarmup();
    this.cancelUnlockMaintenance();
    this.lifecycleGeneration += 1;
    this.unlockSessionId = "";
    return this.lifecycleGeneration;
  }

  private captureUnlockSession(): UnlockSessionContext {
    if (
      this.status !== KeyRingStatus.UNLOCKED ||
      !this.password ||
      !this.unlockSessionId
    ) {
      throw new Error("Key ring is locked or changing state");
    }
    return {
      password: this.password,
      unlockSessionId: this.unlockSessionId,
    };
  }

  private assertUnlockSessionCurrent(
    password: string,
    unlockSessionId: string
  ): void {
    if (!this.isUnlockSessionCurrent(password, unlockSessionId)) {
      throw new Error("Key ring session changed while operation was running");
    }
  }

  /**
   * Serializes the logical commit of every keystore mutation. This is not
   * redundant with the per-mutation re-read of `multiKeyStore`: a commit stage
   * stays open across its `save()`, and the code after that await may act on
   * conclusions drawn before it. `deleteKeyRing` is the concrete case — it
   * tears the unlock session down when the wallet it removed was the last one,
   * and without this tail a concurrent add can publish a wallet and drop
   * `pendingAddOperations` back to zero inside that window, so the delete wipes
   * the password of a wallet that now exists.
   *
   * Pinned by "holds an add outside the wallet array until the delete commit
   * stage settles" in `keyring.spec.ts`; that test reddens if the tail is
   * dropped for `Promise.resolve().then(operation)` or a direct `operation()`.
   */
  private runKeyRingMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.keyRingMutationTail.then(operation);
    this.keyRingMutationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private finishPendingAdd(session: UnlockSessionContext): void {
    this.pendingAddOperations = Math.max(0, this.pendingAddOperations - 1);
    if (
      this.pendingAddOperations === 0 &&
      this.multiKeyStore.length === 0 &&
      this.selectedKeyStoreId === null &&
      this.isUnlockSessionCurrent(session.password, session.unlockSessionId)
    ) {
      this.invalidateUnlockSession();
      this.clearSessionKeyStoreMaterial();
      this.clearCaches();
      this.password = "";
      this.cacheManager.setPassword("");
    }
  }

  private async commitPreparedKeyStoreAddition(
    keyStore: KeyStore,
    material: SessionKeyStoreMaterial,
    session: UnlockSessionContext
  ): Promise<MultiKeyStoreInfoWithSelected> {
    return await this.runKeyRingMutation(async () => {
      this.assertUnlockSessionCurrent(
        session.password,
        session.unlockSessionId
      );
      const shouldSelectAddedWallet = this.selectedKeyStoreId === null;
      this.multiKeyStore = [...this.multiKeyStore, keyStore];
      this.rememberSessionKeyStoreMaterial(keyStore, material);
      if (shouldSelectAddedWallet) {
        this.commitActiveKeyStoreForSession(keyStore, material, session);
      }
      await this.save();
      if (shouldSelectAddedWallet) {
        this.interactionService.dispatchEvent(
          WEBPAGE_PORT,
          "status-changed",
          {}
        );
      }
      return this.getMultiKeyStoreInfo();
    });
  }

  private clearSessionKeyStoreMaterial(): void {
    for (const material of this.sessionKeyStoreMaterial.values()) {
      this.clearSessionMaterialBytes(material);
    }
    this.sessionKeyStoreMaterial.clear();
  }

  private removeSessionKeyStoreMaterial(walletId: string): void {
    if (walletId) {
      const material = this.sessionKeyStoreMaterial.get(walletId);
      if (material) {
        this.clearSessionMaterialBytes(material);
      }
      this.sessionKeyStoreMaterial.delete(walletId);
    }
  }

  private clearSessionMaterialBytes(material: SessionKeyStoreMaterial): void {
    if (material.type === "mnemonic") {
      material.mnemonicMasterSeed.fill(0);
    } else if (material.type === "privateKey") {
      material.privateKey.fill(0);
    }
  }

  /**
   * Keep material that was already available while creating a keystore in the
   * current unlock session. This avoids immediately decrypting the same store
   * again when the newly imported wallet is selected.
   */
  private rememberSessionKeyStoreMaterial(
    keyStore: KeyStore,
    material: SessionKeyStoreMaterial
  ): void {
    const walletId = KeyRing.getKeyStoreId(keyStore);
    if (walletId) {
      this.sessionKeyStoreMaterial.set(
        walletId,
        this.cloneSessionKeyStoreMaterial(material)
      );
    }
  }

  private cloneSessionKeyStoreMaterial(
    material: SessionKeyStoreMaterial
  ): SessionKeyStoreMaterial {
    switch (material.type) {
      case "mnemonic":
        return {
          type: "mnemonic",
          mnemonicMasterSeed: new Uint8Array(material.mnemonicMasterSeed),
        };
      case "privateKey":
        return {
          type: "privateKey",
          privateKey: new Uint8Array(material.privateKey),
        };
      case "ledger": {
        const ledgerPublicKeyCache: Record<string, Uint8Array | undefined> = {};
        for (const [k, v] of Object.entries(material.ledgerPublicKeyCache)) {
          ledgerPublicKeyCache[k] = v ? new Uint8Array(v) : undefined;
        }
        return { type: "ledger", ledgerPublicKeyCache };
      }
      case "keystone":
        return {
          type: "keystone",
          keystonePublicKey: JSON.parse(
            JSON.stringify(material.keystonePublicKey)
          ) as KeystoneKeyringData,
        };
      default: {
        const _exhaustive: never = material;
        throw new Error(
          `Unexpected session material type: ${String(_exhaustive)}`
        );
      }
    }
  }

  private applySessionKeyStoreMaterial(
    material: SessionKeyStoreMaterial
  ): void {
    this.clearActiveKeyStoreCaches();
    switch (material.type) {
      case "mnemonic":
        this._mnemonicMasterSeed = new Uint8Array(material.mnemonicMasterSeed);
        break;
      case "privateKey":
        this._privateKey = new Uint8Array(material.privateKey);
        break;
      case "ledger":
        this._ledgerPublicKeyCache = Object.fromEntries(
          Object.entries(material.ledgerPublicKeyCache).map(([k, v]) => [
            k,
            v ? new Uint8Array(v) : undefined,
          ])
        );
        break;
      case "keystone":
        this._keystonePublicKeyCache = JSON.parse(
          JSON.stringify(material.keystonePublicKey)
        ) as KeystoneKeyringData;
        break;
      default: {
        const _exhaustive: never = material;
        throw new Error(
          `Unexpected session material type: ${String(_exhaustive)}`
        );
      }
    }
  }

  private async decryptKeyStoreToMaterial(
    keyStore: KeyStore,
    password: string
  ): Promise<SessionKeyStoreMaterial> {
    const type = KeyRing.getTypeOfKeyStore(keyStore);

    if (type === "mnemonic") {
      const decrypted = await Crypto.decrypt(this.crypto, keyStore, password);
      const plaintext = Buffer.from(decrypted);
      try {
        const mnemonic = plaintext.toString();
        return {
          type: "mnemonic",
          mnemonicMasterSeed: Mnemonic.generateMasterSeedFromMnemonic(mnemonic),
        };
      } finally {
        plaintext.fill(0);
        decrypted.fill(0);
      }
    }

    if (type === "privateKey") {
      const decrypted = await Crypto.decrypt(this.crypto, keyStore, password);
      const plaintext = Buffer.from(decrypted);
      try {
        return {
          type: "privateKey",
          privateKey: Buffer.from(plaintext.toString(), "hex"),
        };
      } finally {
        plaintext.fill(0);
        decrypted.fill(0);
      }
    }

    if (type === "ledger") {
      const pubKeys: Record<string, Uint8Array> = {};
      const cipherText = await Crypto.decrypt(this.crypto, keyStore, password);
      const plaintext = Buffer.from(cipherText);

      try {
        const encodedPubkeys = JSON.parse(plaintext.toString());
        Object.keys(encodedPubkeys).forEach(
          (k) => (pubKeys[k] = Buffer.from(encodedPubkeys[k], "hex"))
        );
      } catch {
        pubKeys[LedgerApp.Cosmos] = Buffer.from(plaintext.toString(), "hex");
      } finally {
        plaintext.fill(0);
        cipherText.fill(0);
      }

      return { type: "ledger", ledgerPublicKeyCache: pubKeys };
    }

    if (type === "keystone") {
      const cipherText = await Crypto.decrypt(this.crypto, keyStore, password);
      const plaintext = Buffer.from(cipherText);
      try {
        return {
          type: "keystone",
          keystonePublicKey: JSON.parse(
            plaintext.toString()
          ) as KeystoneKeyringData,
        };
      } catch (e: any) {
        throw new Error("Unexpected content of Keystone public keys");
      } finally {
        plaintext.fill(0);
        cipherText.fill(0);
      }
    }

    throw new Error("Unexpected type of keyring");
  }

  private async decryptKeyStoreText(
    keyStore: KeyStore,
    password: string,
    options?: { priority?: ScryptPriority }
  ): Promise<string> {
    const decrypted = await Crypto.decrypt(
      this.crypto,
      keyStore,
      password,
      options
    );
    const plaintext = Buffer.from(decrypted);
    try {
      return plaintext.toString();
    } finally {
      plaintext.fill(0);
      decrypted.fill(0);
    }
  }

  private async resolveSessionKeyStoreMaterial(
    keyStore: KeyStore,
    password: string
  ): Promise<SessionKeyStoreMaterial> {
    const walletId = KeyRing.getKeyStoreId(keyStore);
    const cached = this.sessionKeyStoreMaterial.get(walletId);
    return cached
      ? this.cloneSessionKeyStoreMaterial(cached)
      : this.cloneSessionKeyStoreMaterial(
          await this.decryptKeyStoreToMaterial(keyStore, password)
        );
  }

  private commitActiveKeyStoreForSession(
    keyStore: KeyStore,
    material: SessionKeyStoreMaterial,
    session: UnlockSessionContext
  ): void {
    this.assertUnlockSessionCurrent(session.password, session.unlockSessionId);

    const walletId = KeyRing.getKeyStoreId(keyStore);
    if (!this.sessionKeyStoreMaterial.has(walletId)) {
      this.rememberSessionKeyStoreMaterial(keyStore, material);
    }

    // Publish the selected keystore and its signing material in the same
    // synchronous turn, after all asynchronous work and session validation.
    this.selectKeyStore(keyStore);
    this.applySessionKeyStoreMaterial(material);
  }

  private selectKeyStore(keyStore: KeyStore | null): void {
    if (!keyStore) {
      this.selectedKeyStoreId = null;
      return;
    }

    const selectedId = KeyRing.getKeyStoreId(keyStore);
    if (
      !this.multiKeyStore.some(
        (candidate) => KeyRing.getKeyStoreId(candidate) === selectedId
      )
    ) {
      throw new Error("Selected key store is not in the keyring");
    }

    this.selectedKeyStoreId = selectedId;
  }

  /**
   * Resolve and atomically publish a selected keystore without unlock side
   * effects (events, mnemonic-length work, cache migration).
   */
  private async reloadActiveKeyStoreForSwitch(
    keyStore: KeyStore,
    session: UnlockSessionContext
  ): Promise<void> {
    this.assertUnlockSessionCurrent(session.password, session.unlockSessionId);
    const material = await this.resolveSessionKeyStoreMaterial(
      keyStore,
      session.password
    );
    this.commitActiveKeyStoreForSession(keyStore, material, session);
  }

  public async unlock(password: string) {
    const keyStore = this.keyStore;
    if (!keyStore || this.type === "none") {
      throw new Error("Key ring not initialized");
    }
    if (this.status !== KeyRingStatus.LOCKED) {
      throw new Error("Key ring is not locked");
    }
    if (this.unlockInProgress) {
      throw new Error("Key ring unlock is already in progress");
    }

    const lifecycleGeneration = this.lifecycleGeneration;
    const walletId = KeyRing.getKeyStoreId(keyStore);
    let pendingMaterial: SessionKeyStoreMaterial | undefined;
    this.unlockInProgress = true;
    try {
      pendingMaterial = this.cloneSessionKeyStoreMaterial(
        await this.decryptKeyStoreToMaterial(keyStore, password)
      );
      if (
        this.lifecycleGeneration !== lifecycleGeneration ||
        this.status !== KeyRingStatus.LOCKED ||
        this.keyStore !== keyStore
      ) {
        throw new Error("Key ring changed while unlock was running");
      }

      this.clearSessionKeyStoreMaterial();
      this.sessionKeyStoreMaterial.set(walletId, pendingMaterial);
      this.applySessionKeyStoreMaterial(pendingMaterial);
      pendingMaterial = undefined;

      const unlockSessionId = this.activateUnlockSession(password);
      this.assertUnlockSessionCurrent(password, unlockSessionId);
      this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});
      this.scheduleUnlockMaintenance(password, unlockSessionId);
    } finally {
      if (pendingMaterial) {
        this.clearSessionMaterialBytes(pendingMaterial);
      }
      this.unlockInProgress = false;
    }
  }

  public getCurrentUnlockSessionId(): string {
    return this.unlockSessionId;
  }

  private createUnlockSessionId(): string {
    return `kr_sess_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  private isUnlockSessionCurrent(
    password: string,
    unlockSessionId: string
  ): boolean {
    return (
      !this.disposed &&
      unlockSessionId.length > 0 &&
      this.unlockSessionId === unlockSessionId &&
      this.password === password
    );
  }

  private cancelUnlockCacheWarmup(): void {
    if (this.unlockCacheWarmupTimer !== undefined) {
      clearTimeout(this.unlockCacheWarmupTimer);
      this.unlockCacheWarmupTimer = undefined;
    }
  }

  /**
   * Address-cache KDF work is best-effort idle work. Keeping its actual scrypt
   * behind a cancellable grace period lets an immediate wallet switch enqueue
   * the target keystore decrypt before background warm-up occupies scrypt.
   */
  private scheduleUnlockCacheWarmup(
    password: string,
    unlockSessionId: string
  ): void {
    if (
      this.disposed ||
      !this.isUnlockSessionCurrent(password, unlockSessionId)
    ) {
      return;
    }

    this.cancelUnlockCacheWarmup();
    const lifecycleGeneration = this.lifecycleGeneration;
    const timer = setTimeout(() => {
      if (this.unlockCacheWarmupTimer === timer) {
        this.unlockCacheWarmupTimer = undefined;
      }
      if (
        this.lifecycleGeneration !== lifecycleGeneration ||
        !this.isUnlockSessionCurrent(password, unlockSessionId)
      ) {
        return;
      }

      this.trackDetachedBackgroundWork(
        this.cacheManager.warmSharedDerivedKey().catch((e: unknown) => {
          // A lock or password transition intentionally invalidates an in-flight
          // warm-up. Report failures only while they still belong to this session.
          if (
            this.lifecycleGeneration === lifecycleGeneration &&
            this.isUnlockSessionCurrent(password, unlockSessionId)
          ) {
            throw e;
          }
        }),
        "[KeyRing] Failed to warm address-cache derived key:"
      );
    }, UNLOCK_CACHE_WARMUP_GRACE_MS);
    this.unlockCacheWarmupTimer = timer;
    (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
  }

  private rescheduleUnlockCacheWarmupIfCurrent(
    session: UnlockSessionContext
  ): void {
    if (
      !this.disposed &&
      this.isUnlockSessionCurrent(session.password, session.unlockSessionId)
    ) {
      this.scheduleUnlockCacheWarmup(session.password, session.unlockSessionId);
    }
  }

  private cancelUnlockMaintenance(): void {
    if (this.unlockMaintenanceTimer !== undefined) {
      clearTimeout(this.unlockMaintenanceTimer);
      this.unlockMaintenanceTimer = undefined;
    }
  }

  private scheduleUnlockMaintenance(
    password: string,
    unlockSessionId: string
  ): void {
    if (this.disposed) {
      return;
    }
    this.cancelUnlockMaintenance();
    const timer = setTimeout(() => {
      if (this.unlockMaintenanceTimer === timer) {
        this.unlockMaintenanceTimer = undefined;
      }
      if (!this.isUnlockSessionCurrent(password, unlockSessionId)) {
        return;
      }
      if (
        this.unlockMaintenanceFlight &&
        this.unlockMaintenanceFlightSessionId === unlockSessionId
      ) {
        return;
      }
      void this.runUnlockMaintenance(password, unlockSessionId).catch(
        (e: unknown) => {
          if (this.isUnlockSessionCurrent(password, unlockSessionId)) {
            console.error(`[KeyRing] Unlock maintenance failed:`, e);
          }
        }
      );
    }, UNLOCK_MAINTENANCE_GRACE_MS);
    this.unlockMaintenanceTimer = timer;
    (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
  }

  private rescheduleUnlockMaintenanceIfCurrent(
    session: UnlockSessionContext
  ): void {
    if (
      !this.disposed &&
      this.isUnlockSessionCurrent(session.password, session.unlockSessionId)
    ) {
      this.scheduleUnlockMaintenance(session.password, session.unlockSessionId);
    }
  }

  private async runUnlockMaintenance(
    password: string,
    unlockSessionId: string
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    const existingFlight = this.unlockMaintenanceFlight;
    if (existingFlight) {
      const existingSessionId = this.unlockMaintenanceFlightSessionId;
      if (existingSessionId === unlockSessionId) {
        await existingFlight;
        return;
      }

      try {
        await existingFlight;
      } catch {
        // The caller that started the old session's flight owns its error.
      }

      // If a newer session had to wait for an older run to stop, start its own
      // run once the old one has released the single-flight slot.
      if (
        !this.disposed &&
        this.isUnlockSessionCurrent(password, unlockSessionId)
      ) {
        await this.runUnlockMaintenance(password, unlockSessionId);
      }
      return;
    }

    const flight = this.performUnlockMaintenance(password, unlockSessionId);
    const trackedFlight = flight.finally(() => {
      if (this.unlockMaintenanceFlight === trackedFlight) {
        this.unlockMaintenanceFlight = undefined;
        this.unlockMaintenanceFlightSessionId = "";
      }
    });
    this.unlockMaintenanceFlight = trackedFlight;
    this.unlockMaintenanceFlightSessionId = unlockSessionId;
    await trackedFlight;
  }

  private trackDetachedBackgroundWork(
    work: Promise<void>,
    failureMessage: string
  ): void {
    const tracked = work
      .catch((e: unknown) => {
        if (!this.disposed) {
          console.error(failureMessage, e);
        }
      })
      .finally(() => {
        this.detachedBackgroundWork.delete(tracked);
      });
    this.detachedBackgroundWork.add(tracked);
  }

  /**
   * Stops timers and waits until already-started maintenance owned by this
   * instance has settled. A disposed KeyRing must not be reused.
   */
  public dispose(): Promise<void> {
    if (!this.disposeFlight) {
      this.disposeFlight = this.performDispose();
    }
    return this.disposeFlight;
  }

  private async performDispose(): Promise<void> {
    this.disposed = true;
    this.cancelUnlockCacheWarmup();
    this.cancelUnlockMaintenance();
    this.lifecycleGeneration += 1;
    this.unlockSessionId = "";
    this.clearSessionKeyStoreMaterial();
    this.clearCaches();
    this.clearCardanoMemoryCache();
    this.password = "";
    this.cacheManager.setPassword("");

    // Work may finish and remove itself while the snapshot is being awaited.
    // Loop so disposal also owns work that was detached immediately before it.
    while (
      this.unlockMaintenanceFlight ||
      this.detachedBackgroundWork.size > 0
    ) {
      const pending = [
        ...(this.unlockMaintenanceFlight ? [this.unlockMaintenanceFlight] : []),
        ...this.detachedBackgroundWork,
      ];
      await Promise.allSettled(pending);
    }
  }

  private async performUnlockMaintenance(
    password: string,
    unlockSessionId: string
  ): Promise<void> {
    await this.calculateMnemonicLengthInBackground(password, unlockSessionId);

    if (
      !this.isUnlockSessionCurrent(password, unlockSessionId) ||
      this.cacheMigrationDoneThisSession
    ) {
      return;
    }

    try {
      await this.migrateCacheToEncrypted();
      if (this.isUnlockSessionCurrent(password, unlockSessionId)) {
        this.cacheMigrationDoneThisSession = true;
      }
    } catch (e: unknown) {
      if (this.isUnlockSessionCurrent(password, unlockSessionId)) {
        console.error(`[KeyRing] Cache migration failed:`, e);
      }
      // Migration is best effort and will be retried in the next session.
    }
  }

  /**
   * Calculate mnemonicLength for all keystores in background after unlock
   */
  private async calculateMnemonicLengthInBackground(
    password: string,
    unlockSessionId: string
  ): Promise<void> {
    try {
      const keystoresNeedingCalculation = this.multiKeyStore
        .map((ks, index) => ({ ks, index }))
        .filter(
          ({ ks }) => ks.type === "mnemonic" && !ks.meta?.["mnemonicLength"]
        );

      if (keystoresNeedingCalculation.length === 0) {
        return;
      }

      this.interactionService.dispatchEvent(
        WEBPAGE_PORT,
        "mnemonic-length-calculating",
        {
          total: keystoresNeedingCalculation.length,
        }
      );

      let hasUpdatedMnemonicLength = false;
      let successCount = 0;

      // Run sequentially so locking the wallet prevents any not-yet-started
      // background decryptions from retaining and using the old password.
      for (let index = 0; index < keystoresNeedingCalculation.length; index++) {
        if (!this.isUnlockSessionCurrent(password, unlockSessionId)) {
          return;
        }

        const { ks } = keystoresNeedingCalculation[index];
        try {
          const mnemonic = await this.decryptKeyStoreText(ks, password, {
            priority: "background",
          });

          if (!this.isUnlockSessionCurrent(password, unlockSessionId)) {
            return;
          }

          const walletId = KeyRing.getKeyStoreId(ks);
          const currentKeyStore = this.multiKeyStore.find(
            (candidate) => KeyRing.getKeyStoreId(candidate) === walletId
          );
          if (!currentKeyStore || currentKeyStore.meta?.["mnemonicLength"]) {
            continue;
          }

          const newLen = mnemonic.trim().split(/\s+/).length.toString();

          currentKeyStore.meta = {
            ...(currentKeyStore.meta ?? {}),
            mnemonicLength: newLen,
          };
          hasUpdatedMnemonicLength = true;
          successCount += 1;

          this.interactionService.dispatchEvent(
            WEBPAGE_PORT,
            "mnemonic-length-progress",
            {
              completed: index + 1,
              total: keystoresNeedingCalculation.length,
              walletId,
              mnemonicLength: newLen,
            }
          );
        } catch {
          // One corrupt keystore must not stop maintenance for the others.
        }
      }

      if (
        hasUpdatedMnemonicLength &&
        this.isUnlockSessionCurrent(password, unlockSessionId)
      ) {
        await this.save();
        if (this.isUnlockSessionCurrent(password, unlockSessionId)) {
          // Existing consumers refresh Cardano capability from status-changed;
          // mnemonic-length-* events are informational and are not wired to UI.
          this.interactionService.dispatchEvent(
            WEBPAGE_PORT,
            "status-changed",
            {}
          );
        }
      }

      if (!this.isUnlockSessionCurrent(password, unlockSessionId)) {
        return;
      }

      this.interactionService.dispatchEvent(
        WEBPAGE_PORT,
        "mnemonic-length-completed",
        {
          successful: successCount,
          total: keystoresNeedingCalculation.length,
        }
      );
    } catch (e: any) {
      if (this.isUnlockSessionCurrent(password, unlockSessionId)) {
        this.interactionService.dispatchEvent(
          WEBPAGE_PORT,
          "mnemonic-length-error",
          {
            error: e?.message,
          }
        );
      }
    }
  }

  /**
   * Update cache with new active wallet address before consistency check
   * This prevents false inconsistency when switching wallets
   */
  private async updateCacheForActiveWallet(
    chainId: string,
    keys: Key[],
    walletIds: string[],
    walletNames: string[],
    activeWalletId: string,
    isCardano: boolean
  ): Promise<void> {
    try {
      const activeWalletIndex = walletIds.indexOf(activeWalletId);
      if (activeWalletIndex < 0) {
        return;
      }

      const activeKey = keys[activeWalletIndex];
      if (!activeKey) {
        return;
      }

      if (isCardano) {
        const existingCache = await this.loadCardanoChainCache(chainId, {
          scryptPriority: "background",
        });
        const activeAddr = Buffer.from(activeKey.address).toString("utf8");
        const activePub =
          activeKey.algo === "ed25519" ||
          activeKey.algo === "cardano_address_only"
            ? Buffer.from(activeKey.pubKey).toString("hex")
            : "";

        existingCache[activeWalletId] = {
          address: activeAddr,
          pubKey: activePub,
        };

        await this.saveCardanoChainCache(chainId, existingCache);
      } else {
        const existingCache = await this.loadGenericChainCache(chainId, {
          scryptPriority: "background",
        });
        const activeAddr = Buffer.from(activeKey.address).toString("hex");
        const activePubKey = Buffer.from(activeKey.pubKey).toString("hex");

        existingCache[activeWalletId] = {
          address: activeAddr,
          name: walletNames[activeWalletIndex],
          pubKey: activePubKey,
        };

        await this.saveGenericChainCache(chainId, existingCache);
      }
    } catch (e: unknown) {
      console.error(`[KeyRing] Failed to update cache for active wallet:`, e);
      // Continue execution - cache update failure is not critical
    }
  }

  private static isPersistedKeyStore(value: unknown): value is KeyStore {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const keyStore = value as Record<string, unknown>;
    if (
      !["1", "1.1", "1.2"].includes(keyStore["version"] as string) ||
      !["mnemonic", "privateKey", "ledger", "keystone"].includes(
        keyStore["type"] as string
      ) ||
      // `curve` only exists in keystores written after 2022; absent means the
      // historical secp256k1. Requiring it here would reject every pre-2022
      // wallet and, through the all-or-nothing legacy check, make the whole
      // keyring unrestorable. restore() backfills it instead.
      (keyStore["curve"] !== undefined &&
        keyStore["curve"] !== KeyCurves.secp256k1) ||
      !keyStore["meta"] ||
      typeof keyStore["meta"] !== "object" ||
      Array.isArray(keyStore["meta"]) ||
      Object.values(keyStore["meta"] as Record<string, unknown>).some(
        (entry) => typeof entry !== "string"
      ) ||
      !KeyRing.isPersistedCrypto(keyStore["crypto"])
    ) {
      return false;
    }

    if (
      keyStore["key"] !== undefined &&
      (typeof keyStore["key"] !== "string" || keyStore["key"].length === 0)
    ) {
      return false;
    }

    if (keyStore["bip44HDPath"] !== undefined) {
      if (
        !keyStore["bip44HDPath"] ||
        typeof keyStore["bip44HDPath"] !== "object" ||
        Array.isArray(keyStore["bip44HDPath"])
      ) {
        return false;
      }
      const path = keyStore["bip44HDPath"] as Record<string, unknown>;
      if (
        !KeyRing.isBip44Index(path["account"]) ||
        (path["change"] !== 0 && path["change"] !== 1) ||
        !KeyRing.isBip44Index(path["addressIndex"])
      ) {
        return false;
      }
    }

    if (keyStore["coinTypeForChain"] !== undefined) {
      if (
        !keyStore["coinTypeForChain"] ||
        typeof keyStore["coinTypeForChain"] !== "object" ||
        Array.isArray(keyStore["coinTypeForChain"]) ||
        Object.values(
          keyStore["coinTypeForChain"] as Record<string, unknown>
        ).some(
          (coinType) =>
            coinType !== undefined && !KeyRing.isBip44Index(coinType)
        )
      ) {
        return false;
      }
    }

    return true;
  }

  private static isBip44Index(value: unknown): value is number {
    return (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 0x7fffffff
    );
  }

  private static isHex(value: unknown, bytes?: number): value is string {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length % 2 === 0 &&
      (bytes === undefined || value.length === bytes * 2) &&
      /^[0-9a-f]+$/i.test(value)
    );
  }

  private static isPersistedCrypto(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const crypto = value as Record<string, unknown>;
    if (
      crypto["cipher"] !== "aes-128-ctr" ||
      !crypto["cipherparams"] ||
      typeof crypto["cipherparams"] !== "object" ||
      Array.isArray(crypto["cipherparams"]) ||
      !KeyRing.isHex(
        (crypto["cipherparams"] as Record<string, unknown>)["iv"],
        16
      ) ||
      !KeyRing.isHex(crypto["ciphertext"]) ||
      !KeyRing.isHex(crypto["mac"], 32) ||
      !["scrypt", "sha256", "pbkdf2"].includes(crypto["kdf"] as string) ||
      !crypto["kdfparams"] ||
      typeof crypto["kdfparams"] !== "object" ||
      Array.isArray(crypto["kdfparams"])
    ) {
      return false;
    }

    const params = crypto["kdfparams"] as Record<string, unknown>;
    if (!KeyRing.isHex(params["salt"], 32)) {
      return false;
    }

    if (crypto["kdf"] === "scrypt") {
      const n = params["n"];
      return (
        params["dklen"] === 32 &&
        typeof n === "number" &&
        Number.isSafeInteger(n) &&
        n >= 2 &&
        n <= 1_048_576 &&
        (n & (n - 1)) === 0 &&
        typeof params["r"] === "number" &&
        Number.isSafeInteger(params["r"]) &&
        params["r"] > 0 &&
        params["r"] <= 32 &&
        typeof params["p"] === "number" &&
        Number.isSafeInteger(params["p"]) &&
        params["p"] > 0 &&
        params["p"] <= 16
      );
    }

    // Historical sha256/pbkdf2 keystores were produced with the same params
    // object as scrypt, but their current runtime only consumes the salt and
    // uses a fixed 32-byte output. Accept both that historical shape and the
    // minimal shape actually consumed by the runtime.
    return true;
  }

  private static isPersistedKeyRingState(
    value: unknown
  ): value is PersistedKeyRingState {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const state = value as Partial<PersistedKeyRingState>;
    return (
      (state.selectedId === null || typeof state.selectedId === "string") &&
      Array.isArray(state.keyStores) &&
      state.keyStores.every((keyStore) => KeyRing.isPersistedKeyStore(keyStore))
    );
  }

  private static isLegacyMirrorFingerprints(
    value: unknown
  ): value is LegacyMirrorFingerprints {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const fingerprints = value as Partial<LegacyMirrorFingerprints>;
    return (
      typeof fingerprints.selected === "string" &&
      typeof fingerprints.multi === "string"
    );
  }

  private static isLegacyMirrorState(
    value: unknown
  ): value is LegacyMirrorState {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const mirror = value as Partial<LegacyMirrorState> & {
      previous?: unknown;
      target?: unknown;
      fingerprint?: unknown;
    };
    if (mirror.status === "synced") {
      return KeyRing.isLegacyMirrorFingerprints(mirror.fingerprint);
    }
    if (mirror.status === "pending") {
      return (
        KeyRing.isLegacyMirrorFingerprints(mirror.previous) &&
        KeyRing.isLegacyMirrorFingerprints(mirror.target)
      );
    }
    return false;
  }

  private static canonicalizeForFingerprint(value: unknown): unknown {
    if (value === undefined) {
      return { __keyringUndefined__: true };
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    if (value instanceof Uint8Array) {
      return { __keyringBytes__: Buffer.from(value).toString("hex") };
    }
    if (Array.isArray(value)) {
      return value.map((item) => KeyRing.canonicalizeForFingerprint(item));
    }
    if (typeof value === "object") {
      const canonical: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        const child = (value as Record<string, unknown>)[key];
        if (child !== undefined) {
          canonical[key] = KeyRing.canonicalizeForFingerprint(child);
        }
      }
      return canonical;
    }
    return String(value);
  }

  private static clonePersistedValue<T>(value: T): T {
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    if (value instanceof Uint8Array) {
      return new Uint8Array(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map((item) => KeyRing.clonePersistedValue(item)) as T;
    }
    if (typeof value === "object") {
      const clone: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>
      )) {
        clone[key] = KeyRing.clonePersistedValue(child);
      }
      return clone as T;
    }
    return value;
  }

  private static fingerprintLegacyValue(value: unknown): string {
    const canonical = JSON.stringify(KeyRing.canonicalizeForFingerprint(value));
    return `sha256:${Buffer.from(Hash.sha256(Buffer.from(canonical))).toString(
      "hex"
    )}`;
  }

  /**
   * Proves that two persistence entries contain the same saved key material
   * without decrypting it. User-editable metadata (including name and
   * nameByChain) and __id__ are deliberately excluded; crypto/ciphertext and
   * the derivation/signing context must match exactly. A mismatch is treated
   * as ambiguity and both entries are retained.
   */
  private static fingerprintPersistedKeyStore(keyStore: KeyStore): string {
    return KeyRing.fingerprintLegacyValue({
      type: keyStore.type,
      // Normalised so backfilling an absent `curve` cannot change a keystore's
      // identity: the same ciphertext must keep the same fingerprint whether or
      // not the field has been repaired yet.
      curve: keyStore.curve ?? KeyCurves.secp256k1,
      crypto: keyStore.crypto,
      key: keyStore.key,
      bip44HDPath: keyStore.bip44HDPath,
      coinTypeForChain: keyStore.coinTypeForChain,
    });
  }

  private static mergeLegacyUserMetadata(
    current: KeyStore,
    legacy: KeyStore
  ): KeyStore {
    const meta = { ...(current.meta ?? {}) };
    for (const key of KeyRing.SAFE_META_KEYS) {
      if (
        key !== "__id__" &&
        legacy.meta &&
        Object.prototype.hasOwnProperty.call(legacy.meta, key)
      ) {
        meta[key] = legacy.meta[key];
      }
    }
    return { ...current, meta };
  }

  private static mergePersistedKeyStoreStates(
    canonicalKeyStores: KeyStore[],
    legacyKeyStores: KeyStore[]
  ): { keyStores: KeyStore[]; changed: boolean } {
    const keyStores: KeyStore[] = [];
    const indexByFingerprint = new Map<string, number>();
    let changed = false;

    const append = (source: KeyStore, legacyMetadataWins: boolean) => {
      const keyStore = KeyRing.clonePersistedValue(source);
      const fingerprint = KeyRing.fingerprintPersistedKeyStore(keyStore);
      const existingIndex = indexByFingerprint.get(fingerprint);
      if (existingIndex === undefined) {
        indexByFingerprint.set(fingerprint, keyStores.length);
        keyStores.push(keyStore);
        return;
      }

      // Matching immutable persistence fingerprints prove identity. Keep the
      // first stable ID, while a later legacy copy may supply user metadata.
      changed = true;
      if (legacyMetadataWins) {
        keyStores[existingIndex] = KeyRing.mergeLegacyUserMetadata(
          keyStores[existingIndex],
          keyStore
        );
      }
    };

    for (const keyStore of canonicalKeyStores) {
      append(keyStore, false);
    }
    for (const keyStore of legacyKeyStores) {
      append(keyStore, true);
    }

    return { keyStores, changed };
  }

  private static getLegacyMirrorFingerprints(
    selected: unknown,
    multi: unknown
  ): LegacyMirrorFingerprints {
    return {
      selected: KeyRing.fingerprintLegacyValue(selected),
      multi: KeyRing.fingerprintLegacyValue(multi),
    };
  }

  private static legacyMirrorFingerprintsEqual(
    a: LegacyMirrorFingerprints,
    b: LegacyMirrorFingerprints
  ): boolean {
    return a.selected === b.selected && a.multi === b.multi;
  }

  private async readKeyRingPersistenceSnapshot(
    includeIncrementalNumber = false
  ): Promise<KeyRingPersistenceSnapshot> {
    if (hasMultiGet(this.kvStore)) {
      const keys = includeIncrementalNumber
        ? [...KeyRingPersistenceKeys, "incrementalNumber"]
        : [...KeyRingPersistenceKeys];
      const values = await this.kvStore.multiGet(keys);
      return {
        persisted: values[KeyRingStateV2Key],
        incrementalNumber: includeIncrementalNumber
          ? values["incrementalNumber"]
          : undefined,
        legacy: {
          selected: values[KeyStoreKey],
          multi: values[KeyMultiStoreKey],
        },
      };
    }

    const [persisted, selected, multi, incrementalNumber] = await Promise.all([
      this.kvStore.get<unknown>(KeyRingStateV2Key),
      this.kvStore.get<unknown>(KeyStoreKey),
      this.kvStore.get<unknown>(KeyMultiStoreKey),
      includeIncrementalNumber
        ? this.kvStore.get<unknown>("incrementalNumber")
        : Promise.resolve(undefined),
    ]);
    return {
      persisted,
      incrementalNumber,
      legacy: { selected, multi },
    };
  }

  private async resolveLegacyKeyRingState(
    legacyMulti: unknown,
    legacySelected: unknown
  ): Promise<ResolvedKeyRingState | null> {
    if (KeyRing.isPersistedKeyRingState(legacyMulti)) {
      // Compatibility with the short-lived development format that stored
      // the v2 object under key-multi-store before the versioned key existed.
      const keyStores = KeyRing.clonePersistedValue(legacyMulti.keyStores);
      const selectedKeyStore = legacyMulti.selectedId
        ? keyStores.find(
            (keyStore) => keyStore.meta?.["__id__"] === legacyMulti.selectedId
          )
        : undefined;
      return {
        keyStores,
        selectedId: legacyMulti.selectedId,
        selectedFingerprint: selectedKeyStore
          ? KeyRing.fingerprintPersistedKeyStore(selectedKeyStore)
          : null,
      };
    }

    if (
      legacyMulti !== undefined &&
      legacyMulti !== null &&
      !Array.isArray(legacyMulti)
    ) {
      console.warn(
        "[KeyRing] Unrecognized legacy multi-key state; ignoring legacy storage"
      );
      return null;
    }

    const keyStores = Array.isArray(legacyMulti)
      ? KeyRing.clonePersistedValue(legacyMulti as KeyStore[])
      : [];
    if (!keyStores.every((keyStore) => KeyRing.isPersistedKeyStore(keyStore))) {
      return null;
    }

    if (
      legacySelected !== undefined &&
      legacySelected !== null &&
      !KeyRing.isPersistedKeyStore(legacySelected)
    ) {
      return null;
    }
    const selectedKeyStore = KeyRing.isPersistedKeyStore(legacySelected)
      ? KeyRing.clonePersistedValue(legacySelected)
      : null;

    // Before multi-wallet support only key-store existed. A stopped legacy
    // save can also publish a newly selected wallet before updating the array.
    // Append the selected copy even when __id__ collides. The immutable
    // fingerprint merge later proves whether this is the same saved keystore
    // or a distinct ciphertext that must be retained.
    if (selectedKeyStore) {
      keyStores.push(selectedKeyStore);
    }

    const legacySelectedId = selectedKeyStore?.meta?.["__id__"];
    const selectedFingerprint = selectedKeyStore
      ? KeyRing.fingerprintPersistedKeyStore(selectedKeyStore)
      : keyStores[0]
      ? KeyRing.fingerprintPersistedKeyStore(keyStores[0])
      : null;
    const selectedId =
      typeof legacySelectedId === "string" && legacySelectedId.length > 0
        ? legacySelectedId
        : keyStores[0]?.meta?.["__id__"] ?? null;

    return { keyStores, selectedId, selectedFingerprint };
  }

  private static numericKeyStoreId(id: string): number | null {
    if (!/^(0|[1-9]\d*)$/.test(id)) {
      return null;
    }
    const numeric = Number(id);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }

  private async synchronizeIncrementalNumberFloor(
    existingIds: Set<string>,
    storedIncrementalNumber: unknown
  ): Promise<void> {
    const operation = this.idAllocationTail.then(async () => {
      const current =
        typeof storedIncrementalNumber === "number" &&
        Number.isSafeInteger(storedIncrementalNumber) &&
        storedIncrementalNumber >= 0
          ? storedIncrementalNumber
          : 0;
      let floor = current;
      for (const id of existingIds) {
        const numeric = KeyRing.numericKeyStoreId(id);
        if (numeric !== null && numeric > floor) {
          floor = numeric;
        }
      }
      if (floor > current) {
        await this.kvStore.set("incrementalNumber", floor);
      }
    });
    this.idAllocationTail = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
  }

  private async normalizeRestoredKeyStoreIds(
    keyStores: KeyStore[],
    selectedId: string | null,
    selectedFingerprint: string | null,
    storedIncrementalNumber: unknown
  ): Promise<{
    keyStores: KeyStore[];
    selectedId: string | null;
    changed: boolean;
  }> {
    const normalized = KeyRing.clonePersistedValue(keyStores);
    const selectedIndex = (() => {
      if (selectedFingerprint) {
        const index = normalized.findIndex(
          (keyStore) =>
            KeyRing.fingerprintPersistedKeyStore(keyStore) ===
            selectedFingerprint
        );
        if (index >= 0) {
          return index;
        }
      }
      if (selectedId) {
        // A historical duplicate ID is intrinsically ambiguous. With no
        // selected-record fingerprint, the first occurrence deterministically
        // remains selected and retains the old ID.
        const index = normalized.findIndex(
          (keyStore) => keyStore.meta?.["__id__"] === selectedId
        );
        if (index >= 0) {
          return index;
        }
      }
      return normalized.length > 0 ? 0 : -1;
    })();

    const existingIds = new Set<string>();
    for (const keyStore of normalized) {
      const id = keyStore.meta?.["__id__"];
      if (typeof id === "string" && id.length > 0) {
        existingIds.add(id);
      }
    }
    await this.synchronizeIncrementalNumberFloor(
      existingIds,
      storedIncrementalNumber
    );

    const claimedIds = new Set<string>();
    let changed = false;
    for (const keyStore of normalized) {
      const currentId = keyStore.meta?.["__id__"];
      if (
        typeof currentId === "string" &&
        currentId.length > 0 &&
        !claimedIds.has(currentId)
      ) {
        claimedIds.add(currentId);
        continue;
      }

      let nextId: string;
      do {
        nextId = String(await this.getIncrementalNumber());
      } while (existingIds.has(nextId) || claimedIds.has(nextId));
      keyStore.meta = { ...(keyStore.meta ?? {}), __id__: nextId };
      existingIds.add(nextId);
      claimedIds.add(nextId);
      changed = true;
    }

    const normalizedSelectedId =
      selectedIndex >= 0
        ? normalized[selectedIndex]?.meta?.["__id__"] ?? null
        : null;
    return {
      keyStores: normalized,
      selectedId: normalizedSelectedId,
      changed: changed || normalizedSelectedId !== selectedId,
    };
  }

  private persistKeyRingState(
    keyStores: KeyStore[],
    selectedId: string | null,
    beforeCanonicalCommit?: () => void
  ): Promise<void> {
    const keyStoresSnapshot = KeyRing.clonePersistedValue(keyStores);
    const operation = this.persistStateTail.then(() =>
      this.performPersistKeyRingState(
        keyStoresSnapshot,
        selectedId,
        beforeCanonicalCommit
      )
    );
    this.persistStateTail = operation.catch(() => undefined);
    return operation;
  }

  private async performPersistKeyRingState(
    keyStores: KeyStore[],
    selectedId: string | null,
    beforeCanonicalCommit?: () => void
  ): Promise<void> {
    if (
      selectedId &&
      !keyStores.some(
        (keyStore) => KeyRing.getKeyStoreId(keyStore) === selectedId
      )
    ) {
      throw new Error("Selected key store is not in the persisted keyring");
    }

    const { persisted: previousPersisted, legacy } =
      await this.readKeyRingPersistenceSnapshot();
    const previousRevision =
      KeyRing.isPersistedKeyRingState(previousPersisted) &&
      Number.isSafeInteger(previousPersisted.revision) &&
      (previousPersisted.revision as number) >= 0
        ? (previousPersisted.revision as number)
        : 0;
    const revision = previousRevision + 1;
    const selectedKeyStore = selectedId
      ? keyStores.find(
          (keyStore) => KeyRing.getKeyStoreId(keyStore) === selectedId
        ) ?? null
      : null;
    const previousFingerprints = KeyRing.getLegacyMirrorFingerprints(
      legacy.selected,
      legacy.multi
    );
    const targetFingerprints = KeyRing.getLegacyMirrorFingerprints(
      selectedKeyStore,
      keyStores
    );
    const pendingState: PersistedKeyRingState = {
      selectedId,
      keyStores,
      revision,
      legacyMirror: {
        status: "pending",
        previous: previousFingerprints,
        target: targetFingerprints,
      },
    };

    // Commit the complete canonical generation before touching either legacy
    // key. If the worker stops after this write, restore can distinguish the
    // previous/target values from a genuine edit made by an older version.
    beforeCanonicalCommit?.();
    await this.kvStore.set<PersistedKeyRingState>(
      KeyRingStateV2Key,
      pendingState
    );

    const mirrorComplete = await this.mirrorLegacyKeyRingState(
      keyStores,
      selectedId
    );
    if (!mirrorComplete) {
      return;
    }

    // Finalization is recoverable: a pending v2 whose two legacy fingerprints
    // already equal target is equivalent to this synced state and is repaired
    // on the next restore/save. Do not report a failed wallet save after the
    // canonical generation and both rollback mirrors are durable.
    try {
      await this.kvStore.set<PersistedKeyRingState>(KeyRingStateV2Key, {
        selectedId,
        keyStores,
        revision,
        legacyMirror: {
          status: "synced",
          fingerprint: targetFingerprints,
        },
      });
    } catch (e: unknown) {
      console.warn(
        "[KeyRing] Failed to finalize legacy rollback mirror state:",
        e
      );
    }
  }

  private async mirrorLegacyKeyRingState(
    keyStores: KeyStore[],
    selectedId: string | null
  ): Promise<boolean> {
    const selectedKeyStore = selectedId
      ? keyStores.find(
          (keyStore) => KeyRing.getKeyStoreId(keyStore) === selectedId
        ) ?? null
      : null;

    const [selectedResult, multiResult] = await Promise.allSettled([
      this.kvStore.set<KeyStore>(KeyStoreKey, selectedKeyStore),
      this.kvStore.set<KeyStore[]>(KeyMultiStoreKey, keyStores),
    ]);

    if (selectedResult.status === "rejected") {
      console.warn(
        "[KeyRing] Failed to update legacy selected-key rollback mirror:",
        selectedResult.reason
      );
    }
    if (multiResult.status === "rejected") {
      console.warn(
        "[KeyRing] Failed to update legacy multi-key rollback mirror:",
        multiResult.reason
      );
    }
    return (
      selectedResult.status === "fulfilled" &&
      multiResult.status === "fulfilled"
    );
  }

  public async save() {
    await this.persistKeyRingState(this.multiKeyStore, this.selectedKeyStoreId);
  }

  public async restore() {
    if (this.disposed) {
      throw new Error("Key ring is disposed");
    }

    const { persisted, legacy, incrementalNumber } =
      await this.readKeyRingPersistenceSnapshot(true);
    let selectedId: string | null = null;
    let selectedFingerprint: string | null = null;
    let shouldSave = false;

    if (KeyRing.isPersistedKeyRingState(persisted)) {
      const actualLegacyFingerprints = KeyRing.getLegacyMirrorFingerprints(
        legacy.selected,
        legacy.multi
      );
      const mirror = KeyRing.isLegacyMirrorState(persisted.legacyMirror)
        ? persisted.legacyMirror
        : undefined;
      let legacyWasEditedByOlderVersion = false;

      if (!mirror) {
        // A pre-metadata mismatch is intrinsically ambiguous: it can be a
        // failed mirror or a real write from an older version. Merge every
        // structurally usable legacy ciphertext by immutable fingerprint so
        // neither interpretation can destroy a unique wallet.
        const restoredLegacy = await this.resolveLegacyKeyRingState(
          legacy.multi,
          legacy.selected
        );
        const merged = KeyRing.mergePersistedKeyStoreStates(
          persisted.keyStores,
          restoredLegacy?.keyStores ?? []
        );
        this.multiKeyStore = merged.keyStores;
        const canonicalSelected = persisted.selectedId
          ? persisted.keyStores.find(
              (keyStore) => keyStore.meta?.["__id__"] === persisted.selectedId
            )
          : undefined;
        selectedId = canonicalSelected
          ? persisted.selectedId
          : restoredLegacy?.selectedId ?? persisted.selectedId;
        selectedFingerprint = canonicalSelected
          ? KeyRing.fingerprintPersistedKeyStore(canonicalSelected)
          : restoredLegacy?.selectedFingerprint ?? null;
        shouldSave = true;
      } else if (mirror.status === "synced") {
        legacyWasEditedByOlderVersion = !KeyRing.legacyMirrorFingerprintsEqual(
          actualLegacyFingerprints,
          mirror.fingerprint
        );
      } else {
        const selectedIsKnown =
          actualLegacyFingerprints.selected === mirror.previous.selected ||
          actualLegacyFingerprints.selected === mirror.target.selected;
        const multiIsKnown =
          actualLegacyFingerprints.multi === mirror.previous.multi ||
          actualLegacyFingerprints.multi === mirror.target.multi;

        // Any previous/target combination is an interrupted two-key mirror and
        // v2 wins. A value outside both sets was written later by an older
        // extension and must be imported instead of being overwritten.
        legacyWasEditedByOlderVersion = !selectedIsKnown || !multiIsKnown;
        if (!legacyWasEditedByOlderVersion) {
          shouldSave = true;
        }
      }

      if (!mirror) {
        // State was resolved by the conservative pre-metadata merge above.
      } else if (legacyWasEditedByOlderVersion) {
        const restoredLegacy = await this.resolveLegacyKeyRingState(
          legacy.multi,
          legacy.selected
        );
        if (restoredLegacy) {
          const merged = KeyRing.mergePersistedKeyStoreStates(
            persisted.keyStores,
            restoredLegacy.keyStores
          );
          this.multiKeyStore = merged.keyStores;
          selectedId = restoredLegacy.selectedId;
          selectedFingerprint = restoredLegacy.selectedFingerprint;
          shouldSave = true;
        } else {
          console.warn(
            "[KeyRing] Legacy rollback state changed but is invalid; keeping v2 state"
          );
          const canonical = KeyRing.mergePersistedKeyStoreStates(
            persisted.keyStores,
            []
          );
          this.multiKeyStore = canonical.keyStores;
          selectedId = persisted.selectedId;
          const selectedKeyStore = persisted.selectedId
            ? persisted.keyStores.find(
                (keyStore) => keyStore.meta?.["__id__"] === persisted.selectedId
              )
            : undefined;
          selectedFingerprint = selectedKeyStore
            ? KeyRing.fingerprintPersistedKeyStore(selectedKeyStore)
            : null;
          shouldSave = true;
        }
      } else {
        const canonical = KeyRing.mergePersistedKeyStoreStates(
          persisted.keyStores,
          []
        );
        this.multiKeyStore = canonical.keyStores;
        selectedId = persisted.selectedId;
        const selectedKeyStore = persisted.selectedId
          ? persisted.keyStores.find(
              (keyStore) => keyStore.meta?.["__id__"] === persisted.selectedId
            )
          : undefined;
        selectedFingerprint = selectedKeyStore
          ? KeyRing.fingerprintPersistedKeyStore(selectedKeyStore)
          : null;
        shouldSave = shouldSave || canonical.changed;
      }
    } else {
      if (persisted !== undefined) {
        console.warn(
          "[KeyRing] Unrecognized v2 keyring state; falling back to legacy storage"
        );
      }

      const restoredLegacy = await this.resolveLegacyKeyRingState(
        legacy.multi,
        legacy.selected
      );
      if (
        !restoredLegacy ||
        (persisted !== undefined && restoredLegacy.keyStores.length === 0)
      ) {
        throw new Error(
          "Unable to restore key ring: unrecognized legacy multi-key state. Preserve the existing storage and restore it with a compatible wallet version."
        );
      }
      const merged = KeyRing.mergePersistedKeyStoreStates(
        [],
        restoredLegacy.keyStores
      );
      this.multiKeyStore = merged.keyStores;
      selectedId = restoredLegacy.selectedId;
      selectedFingerprint = restoredLegacy.selectedFingerprint;

      shouldSave = true;
    }

    const normalized = await this.normalizeRestoredKeyStoreIds(
      this.multiKeyStore,
      selectedId,
      selectedFingerprint,
      incrementalNumber
    );
    this.multiKeyStore = normalized.keyStores;
    selectedId = normalized.selectedId;
    shouldSave = shouldSave || normalized.changed;

    const resolvedSelectedKeyStore = selectedId
      ? this.multiKeyStore.find(
          (keyStore) => keyStore.meta?.["__id__"] === selectedId
        ) ?? null
      : null;
    this.selectKeyStore(resolvedSelectedKeyStore);

    let hasSanitizedLegacySensitiveMeta = false;
    let hasBackfilledLegacyCurve = false;
    this.multiKeyStore = this.multiKeyStore.map((ks) => {
      const { sanitized, changed } = this.stripLegacySensitiveMeta(ks);
      hasSanitizedLegacySensitiveMeta =
        hasSanitizedLegacySensitiveMeta || changed;
      const backfill = KeyRing.backfillLegacyCurve(sanitized);
      hasBackfilledLegacyCurve = hasBackfilledLegacyCurve || backfill.changed;
      return backfill.backfilled;
    });

    let hasLegacyKeyStore = false;
    // In prior of version 1.2, bip44 path didn't tie with the keystore, and bip44 exists on the chain info.
    // But, after some chain matures, they decided the bip44 path's coin type.
    // So, some chain can have the multiple bip44 coin type (one is the standard coin type and other is the legacy coin type).
    // We should support the legacy coin type, so we determined that the coin type ties with the keystore.
    // To decrease the barrier of existing users, set the alternative coin type by force if the keystore version is prior than 1.2.
    for (const keyStore of this.multiKeyStore) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (keyStore.version === "1" || keyStore.version === "1.1") {
        hasLegacyKeyStore = true;
        this.updateLegacyKeyStore(keyStore);
      }
    }
    if (
      shouldSave ||
      hasLegacyKeyStore ||
      hasSanitizedLegacySensitiveMeta ||
      hasBackfilledLegacyCurve
    ) {
      await this.save();
    }

    // Cardano-specific handling moved to CardanoService

    this.loaded = true;
    this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});
  }

  private updateLegacyKeyStore(keyStore: KeyStore) {
    keyStore.version = "1.2";
    for (const chainInfo of this.embedChainInfos) {
      const coinType = (() => {
        if (
          chainInfo.alternativeBIP44s &&
          chainInfo.alternativeBIP44s.length > 0
        ) {
          return chainInfo.alternativeBIP44s[0].coinType;
        } else {
          return chainInfo.bip44.coinType;
        }
      })();
      keyStore.coinTypeForChain = {
        ...keyStore.coinTypeForChain,
        [ChainIdHelper.parse(chainInfo.chainId).identifier]: coinType,
      };
    }
  }

  public isKeyStoreCoinTypeSet(chainId: string): boolean {
    if (!this.keyStore) {
      throw new Error("Key store is empty");
    }

    return (
      !!this.keyStore.coinTypeForChain &&
      this.keyStore.coinTypeForChain[
        ChainIdHelper.parse(chainId).identifier
      ] !== undefined
    );
  }

  public async setKeyStoreCoinType(chainId: string, coinType: number) {
    const session = this.captureUnlockSession();
    const keyStore = this.keyStore;
    if (!keyStore) {
      throw new Error("Key store is empty");
    }

    if (
      keyStore.coinTypeForChain &&
      keyStore.coinTypeForChain[ChainIdHelper.parse(chainId).identifier] !==
        undefined
    ) {
      throw new Error("Coin type already set");
    }

    keyStore.coinTypeForChain = {
      ...keyStore.coinTypeForChain,
      [ChainIdHelper.parse(chainId).identifier]: coinType,
    };

    this.assertUnlockSessionCurrent(session.password, session.unlockSessionId);
    await this.save();
  }

  public removeAllKeyStoreCoinType(chainId: string) {
    const identifier = ChainIdHelper.parse(chainId).identifier;

    for (const keyStore of this.multiKeyStore) {
      const coinTypeForChain = keyStore.coinTypeForChain;
      if (coinTypeForChain) {
        delete coinTypeForChain[identifier];
        keyStore.coinTypeForChain = coinTypeForChain;
      }
    }

    this.trackDetachedBackgroundWork(
      this.save(),
      "[KeyRing] Failed to persist removed coin type:"
    );
  }

  public async deleteKeyRing(
    index: number,
    password: string
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
    keyStoreChanged: boolean;
  }> {
    const session = this.captureUnlockSession();
    if (session.password !== password) {
      throw new Error("Invalid password");
    }
    this.cancelUnlockMaintenance();

    try {
      const keyStore = this.multiKeyStore[index];

      if (!keyStore) {
        throw new Error("Key store is empty");
      }

      const targetId = KeyRing.getKeyStoreId(keyStore);
      const targetFingerprint = KeyRing.fingerprintPersistedKeyStore(keyStore);
      const isTarget = (candidate: KeyStore): boolean =>
        KeyRing.getKeyStoreId(candidate) === targetId &&
        KeyRing.fingerprintPersistedKeyStore(candidate) === targetFingerprint;

      // Make sure that password is valid.
      const validationPlaintext = await Crypto.decrypt(
        this.crypto,
        keyStore,
        password
      );
      validationPlaintext.fill(0);
      this.assertUnlockSessionCurrent(
        session.password,
        session.unlockSessionId
      );

      let keyStoreChanged = false;
      let remainingCount = 0;
      for (;;) {
        this.assertUnlockSessionCurrent(
          session.password,
          session.unlockSessionId
        );
        const currentTarget = this.multiKeyStore.find(isTarget);
        if (!currentTarget) {
          throw new Error("Key store changed while deletion was running");
        }
        const targetIsSelected = this.selectedKeyStoreId === targetId;
        const preparedReplacement = targetIsSelected
          ? this.multiKeyStore.find((candidate) => !isTarget(candidate)) ?? null
          : null;
        const preparedReplacementFingerprint = preparedReplacement
          ? KeyRing.fingerprintPersistedKeyStore(preparedReplacement)
          : null;
        let replacementMaterial: SessionKeyStoreMaterial | undefined;
        try {
          if (preparedReplacement) {
            replacementMaterial = await this.resolveSessionKeyStoreMaterial(
              preparedReplacement,
              session.password
            );
          }
          this.assertUnlockSessionCurrent(
            session.password,
            session.unlockSessionId
          );

          const committed = await this.runKeyRingMutation(async () => {
            this.assertUnlockSessionCurrent(
              session.password,
              session.unlockSessionId
            );
            const latestTarget = this.multiKeyStore.find(isTarget);
            if (!latestTarget) {
              throw new Error("Key store changed while deletion was running");
            }
            const remaining = this.multiKeyStore.filter(
              (candidate) => !isTarget(candidate)
            );
            const latestTargetIsSelected = this.selectedKeyStoreId === targetId;
            const latestReplacement = latestTargetIsSelected
              ? remaining[0] ?? null
              : null;
            if (
              latestTargetIsSelected &&
              ((latestReplacement === null) !==
                (preparedReplacement === null) ||
                (latestReplacement !== null &&
                  (KeyRing.getKeyStoreId(latestReplacement) !==
                    KeyRing.getKeyStoreId(preparedReplacement as KeyStore) ||
                    KeyRing.fingerprintPersistedKeyStore(latestReplacement) !==
                      preparedReplacementFingerprint)))
            ) {
              return false;
            }

            this.multiKeyStore = remaining;
            if (latestTargetIsSelected) {
              if (latestReplacement && replacementMaterial) {
                this.commitActiveKeyStoreForSession(
                  latestReplacement,
                  replacementMaterial,
                  session
                );
              } else {
                this.selectKeyStore(null);
                this.clearActiveKeyStoreCaches();
              }
            }

            await this.save();
            keyStoreChanged = latestTargetIsSelected;
            remainingCount = remaining.length;
            this.removeSessionKeyStoreMaterial(targetId);
            this.removeCardanoMemoryCacheForWallet(targetId);

            if (remaining.length === 0 && this.pendingAddOperations === 0) {
              this.invalidateUnlockSession();
              this.clearSessionKeyStoreMaterial();
              this.password = "";
              this.cacheManager.setPassword("");
            }
            return true;
          });
          if (committed) {
            break;
          }
        } finally {
          if (replacementMaterial) {
            this.clearSessionMaterialBytes(replacementMaterial);
          }
        }
      }

      if (keyStoreChanged) {
        this.interactionService.dispatchEvent(
          WEBPAGE_PORT,
          "status-changed",
          {}
        );
      }

      // removeWalletFromAllCaches records an in-memory tombstone before its
      // first await. Selective physical cleanup remains best effort so lock can
      // safely abort decrypting blobs that may contain retained wallets. When
      // no wallets remain, the detached full-clear path instead nulls every
      // known blob without a password, cache decrypt, or scrypt.
      const cacheCleanup =
        remainingCount === 0
          ? this.cacheManager.removeWalletFromAllCaches(targetId, {
              mode: "full-clear",
            })
          : this.cacheManager.removeWalletFromAllCaches(targetId);
      this.trackDetachedBackgroundWork(
        cacheCleanup,
        "[KeyRing] Failed to clean caches after wallet deletion:"
      );

      const result = {
        multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
        keyStoreChanged,
      };

      return result;
    } finally {
      this.rescheduleUnlockMaintenanceIfCurrent(session);
    }
  }

  public async updateNameKeyRing(
    index: number,
    name: string,
    nameByChain?: string
  ): Promise<MultiKeyStoreInfoWithSelected> {
    const session = this.captureUnlockSession();

    const keyStore = this.multiKeyStore[index];

    if (!keyStore) {
      throw new Error("Key store is empty");
    }

    keyStore.meta = { ...keyStore.meta, name: name };

    if (nameByChain) {
      keyStore.meta = { ...keyStore.meta, nameByChain };
    }

    this.assertUnlockSessionCurrent(session.password, session.unlockSessionId);
    await this.save();

    return this.getMultiKeyStoreInfo();
  }

  private loadKey(coinType: number, useEthereumAddress: boolean = false): Key {
    if (this.status !== KeyRingStatus.UNLOCKED) {
      throw new Error("Key ring is not unlocked");
    }

    if (!this.keyStore) {
      throw new Error("Key store is empty");
    }

    if (this.keyStore.type === "ledger") {
      if (!this.ledgerPublicKeyCache) {
        throw new Error("Ledger public key not set");
      }

      if (useEthereumAddress) {
        const pubKey = this.ensureLedgerPublicKey(LedgerApp.Ethereum);
        // Generate the Ethereum address for this public key
        const address = computeAddress(pubKey);

        return {
          algo: "ethsecp256k1",
          pubKey: pubKey,
          address: Buffer.from(address.replace("0x", ""), "hex"),
          isKeystone: false,
          isNanoLedger: true,
        };
      }

      const pubKey = new PubKeySecp256k1(
        this.ensureLedgerPublicKey(LedgerApp.Cosmos)
      );

      // TODO: support bls12381 (?)
      return {
        algo: KeyCurves.secp256k1,
        pubKey: pubKey.toBytes(),
        address: pubKey.getAddress(),
        isKeystone: false,
        isNanoLedger: true,
      };
    } else if (this.keyStore.type === "keystone") {
      if (!this.keystonePublicKey || this.keystonePublicKey.keys.length === 0) {
        throw new Error("Keystone public key not set");
      }
      const key = this.keystonePublicKey.keys.find(
        (e) => e.coinType === coinType
      );
      if (!key) {
        throw new Error("CoinType is not available");
      }
      if (useEthereumAddress) {
        const pubKey = publicKeyConvert(Buffer.from(key.pubKey, "hex"), true);
        const address = computeAddress(pubKey);
        return {
          algo: "ethsecp256k1",
          pubKey,
          address: Buffer.from(address.replace(/^0x/, ""), "hex"),
          isKeystone: true,
          isNanoLedger: false,
        };
      }
      const pubKey = new PubKeySecp256k1(Buffer.from(key.pubKey, "hex"));
      return {
        algo: KeyCurves.secp256k1,
        pubKey: pubKey.toBytes(),
        address: pubKey.getAddress(),
        isKeystone: true,
        isNanoLedger: false,
      };
    } else {
      const privKey = this.loadPrivKey(coinType);
      const pubKey = privKey.getPubKey();

      if (useEthereumAddress) {
        // For Ethereum Key-Gen Only:
        const wallet = new Wallet(privKey.toBytes());

        return {
          algo: "ethsecp256k1",
          pubKey: pubKey.toBytes(),
          address: Buffer.from(wallet.address.replace("0x", ""), "hex"),
          isKeystone: false,
          isNanoLedger: false,
        };
      }

      // Default
      return {
        algo: privKey.curve,
        pubKey: pubKey.toBytes(),
        address: pubKey.getAddress(),
        isKeystone: false,
        isNanoLedger: false,
      };
    }
  }

  private loadPrivKey(coinType: number): SecretKey {
    if (
      this.status !== KeyRingStatus.UNLOCKED ||
      this.type === "none" ||
      !this.keyStore
    ) {
      throw new Error("Key ring is not unlocked");
    }

    const bip44HDPath = KeyRing.getKeyStoreBIP44Path(this.keyStore);

    if (this.type === "mnemonic") {
      const path = `m/44'/${coinType}'/${bip44HDPath.account}'/${bip44HDPath.change}/${bip44HDPath.addressIndex}`;
      const cachedKey = this.cached.get(path);
      if (cachedKey) {
        // TODO: support bls12381 key type (?)
        return new PrivKeySecp256k1(cachedKey);
      }

      if (!this.mnemonicMasterSeed) {
        throw new Error(
          "Key store type is mnemonic and it is unlocked. But, mnemonic is not loaded unexpectedly"
        );
      }

      const privKey = Mnemonic.generatePrivateKeyFromMasterSeed(
        this.mnemonicMasterSeed,
        path
      );

      this.cached.set(path, privKey);
      switch (this.keyStore.curve) {
        case KeyCurves.secp256k1:
          return new PrivKeySecp256k1(privKey);
        default:
          throw new Error(`Unexpected key curve: "${this.keyStore.curve}"`);
      }
    } else if (this.type === "privateKey") {
      // If key store type is private key, path will be ignored.

      if (!this.privateKey) {
        throw new Error(
          "Key store type is private key and it is unlocked. But, private key is not loaded unexpectedly"
        );
      }

      switch (this.keyStore.curve) {
        case KeyCurves.secp256k1:
          return new PrivKeySecp256k1(this.privateKey);
        default:
          throw new Error(`Unexpected key curve: "${this.keyStore.curve}"`);
      }
    } else {
      throw new Error("Unexpected type of keyring");
    }
  }

  public async sign(
    env: Env | null,
    chainId: string,
    defaultCoinType: number,
    message: Uint8Array,
    useEthereumSigning: boolean,
    mode: SignMode = SignMode.Amino
  ): Promise<Uint8Array> {
    if (this.status !== KeyRingStatus.UNLOCKED) {
      throw new Error("Key ring is not unlocked");
    }

    if (!this.keyStore) {
      throw new Error("Key store is empty");
    }

    if (!env) {
      throw new Error("Env was not provided");
    }

    if (this.keyStore.type === "ledger") {
      if (!this.ledgerKeeper) {
        throw ErrUndefinedLedgerKeeper;
      }

      const pubKeys = this.ledgerPublicKeyCache;

      if (!pubKeys) {
        throw new Error("Ledger public key is not initialized");
      }

      if (useEthereumSigning) {
        throw new Error("Can't sign cosmos sign doc by ethereum app on ledger");
      }

      const cosmosLikeApp =
        (this.keyStore.meta
          ? this.keyStore.meta["__ledger__cosmos_app_like__"]
          : undefined) || "Cosmos";

      return await this.ledgerKeeper.sign(
        env,
        KeyRing.getKeyStoreBIP44Path(this.keyStore),
        await this.ensureLedgerPublicKey(LedgerApp.Cosmos),
        message,
        cosmosLikeApp
      );
    } else if (this.keyStore.type === "keystone") {
      const coinType = this.computeKeyStoreCoinType(chainId, defaultCoinType);
      if (useEthereumSigning) {
        const ethChainId = EthermintChainIdHelper.parse(chainId).ethChainId;
        return await this.keystoneService.signEvm(
          env,
          coinType,
          KeyRing.getKeyStoreBIP44Path(this.keyStore),
          this.loadKey(coinType, true),
          this.keystonePublicKey as KeystoneKeyringData,
          message,
          mode,
          ethChainId
        );
      }
      return await this.keystoneService.sign(
        env,
        coinType,
        KeyRing.getKeyStoreBIP44Path(this.keyStore),
        this.loadKey(coinType, useEthereumSigning),
        this.keystonePublicKey as KeystoneKeyringData,
        message,
        mode
      );
    } else {
      const coinType = this.computeKeyStoreCoinType(chainId, defaultCoinType);

      const privKey = this.loadPrivKey(coinType);
      const signature = useEthereumSigning
        ? privKey.signDigest32(Hash.keccak256(message))
        : privKey.sign(message);

      // Signing indicates an explicit use of this coin type.
      // Mainly, this logic exists to explicitly set the coin type when signing by an external request.
      if (!this.isKeyStoreCoinTypeSet(chainId)) {
        await this.setKeyStoreCoinType(chainId, coinType);
      }

      return signature;
    }
  }

  public async signEthereum(
    env: Env,
    chainId: string,
    defaultCoinType: number,
    message: Uint8Array,
    type: EthSignType
  ): Promise<Uint8Array> {
    if (this.status !== KeyRingStatus.UNLOCKED) {
      throw new Error("Key ring is not unlocked");
    }

    if (!this.keyStore) {
      throw new Error("Key store is empty");
    }

    if (this.keyStore.type === "ledger") {
      if (!this.ledgerPublicKeyCache) {
        throw new Error("Ledger public key is not initialized");
      }

      return this.ledgerKeeper.signEthereum(
        env,
        type,
        KeyRing.getKeyStoreBIP44Path(this.keyStore),
        await this.ensureLedgerPublicKey(LedgerApp.Ethereum),
        message
      );
    }

    if (this.keyStore.type === "keystone") {
      const coinType = this.computeKeyStoreCoinType(chainId, defaultCoinType);
      return this.keystoneService.signEthereum(
        env,
        coinType,
        KeyRing.getKeyStoreBIP44Path(this.keyStore),
        this.loadKey(coinType, true),
        this.keystonePublicKey as KeystoneKeyringData,
        message,
        type
      );
    }

    const coinType = this.computeKeyStoreCoinType(chainId, defaultCoinType);
    // Allow signing with Ethereum for chains with coinType !== 60
    const privKey = this.loadPrivKey(coinType);

    const ethWallet = new Wallet(privKey.toBytes());

    switch (type) {
      case EthSignType.MESSAGE: {
        // Sign bytes with prefixed Ethereum magic
        const signature = await ethWallet.signMessage(message);
        return BytesUtils.arrayify(signature);
      }
      case EthSignType.TRANSACTION: {
        // Sign Ethereum transaction
        const signature = await ethWallet.signTransaction(
          JSON.parse(Buffer.from(message).toString())
        );
        return BytesUtils.arrayify(signature);
      }
      case EthSignType.EIP712: {
        const data = await EIP712MessageValidator.validateAsync(
          JSON.parse(Buffer.from(message).toString())
        );
        // Since ethermint eip712 tx uses non-standard format, it cannot pass validation of ethersjs.
        // Therefore, it should be handled at a slightly lower level.
        const signature = await ethWallet._signingKey().signDigest(
          Hash.keccak256(
            Buffer.concat([
              // eth separator
              Buffer.from("19", "hex"),
              // Version: 1
              Buffer.from("01", "hex"),
              Buffer.from(domainHash(data).replace("0x", ""), "hex"),
              Buffer.from(messageHash(data).replace("0x", ""), "hex"),
            ])
          )
        );
        return Buffer.concat([
          Buffer.from(signature.r.replace("0x", ""), "hex"),
          Buffer.from(signature.s.replace("0x", ""), "hex"),
          // The metamask doesn't seem to consider the chain id in this case... (maybe bug on metamask?)
          signature.recoveryParam
            ? Buffer.from("1c", "hex")
            : Buffer.from("1b", "hex"),
        ]);
      }
      default:
        throw new Error(`Unknown sign type: ${type}`);
    }
  }

  // Show private key or mnemonic key if password is valid.
  public async showKeyRing(index: number, password: string): Promise<string> {
    if (this.status !== KeyRingStatus.UNLOCKED) {
      throw new Error("Key ring is not unlocked");
    }

    if (this.password !== password) {
      throw new Error("Invalid password");
    }

    const keyStore = this.multiKeyStore[index];

    if (!keyStore) {
      throw new Error("Key store is empty");
    }

    // If password is invalid, error will be thrown. The returned string is an
    // unavoidable immutable API value; controlled byte buffers are zeroed by
    // decryptKeyStoreText before this method resolves.
    return await this.decryptKeyStoreText(keyStore, password);
  }

  public get canSetPath(): boolean {
    return this.type === "mnemonic" || this.type === "ledger";
  }

  public async addMnemonicKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    mnemonic: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    curve: SupportedCurve = KeyCurves.secp256k1
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const session = this.captureUnlockSession();
    this.pendingAddOperations += 1;
    this.cancelUnlockMaintenance();
    let preparedMaterial: SessionKeyStoreMaterial | undefined;

    try {
      const words = mnemonic.trim().split(/\s+/);
      const mnemonicLength = words.length.toString();
      const metaWithMnemonicLength = {
        ...meta,
        mnemonicLength: mnemonicLength,
      };

      // Preserve previous behaviour — coin type is determined later when the
      // key is actually used. No need to pre-compute it here.
      const keyStore = await KeyRing.CreateMnemonicKeyStore(
        this.crypto,
        kdf,
        mnemonic,
        session.password,
        await this.assignKeyStoreIdMeta(metaWithMnemonicLength),
        bip44HDPath,
        curve
      );
      this.assertUnlockSessionCurrent(
        session.password,
        session.unlockSessionId
      );
      preparedMaterial = {
        type: "mnemonic",
        mnemonicMasterSeed: Mnemonic.generateMasterSeedFromMnemonic(mnemonic),
      };
      const multiKeyStoreInfo = await this.commitPreparedKeyStoreAddition(
        keyStore,
        preparedMaterial,
        session
      );

      return {
        multiKeyStoreInfo,
      };
    } finally {
      if (preparedMaterial) {
        this.clearSessionMaterialBytes(preparedMaterial);
      }
      this.finishPendingAdd(session);
      this.rescheduleUnlockMaintenanceIfCurrent(session);
    }
  }

  public async addPrivateKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    privateKey: Uint8Array,
    meta: Record<string, string>,
    curve: SupportedCurve = KeyCurves.secp256k1
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const session = this.captureUnlockSession();
    this.pendingAddOperations += 1;
    this.cancelUnlockMaintenance();
    let preparedMaterial: SessionKeyStoreMaterial | undefined;

    try {
      const keyStore = await KeyRing.CreatePrivateKeyStore(
        this.crypto,
        kdf,
        privateKey,
        session.password,
        await this.assignKeyStoreIdMeta(meta),
        curve
      );
      this.assertUnlockSessionCurrent(
        session.password,
        session.unlockSessionId
      );
      preparedMaterial = {
        type: "privateKey",
        privateKey: new Uint8Array(privateKey),
      };
      const multiKeyStoreInfo = await this.commitPreparedKeyStoreAddition(
        keyStore,
        preparedMaterial,
        session
      );

      return {
        multiKeyStoreInfo,
      };
    } finally {
      if (preparedMaterial) {
        this.clearSessionMaterialBytes(preparedMaterial);
      }
      this.finishPendingAdd(session);
      this.rescheduleUnlockMaintenanceIfCurrent(session);
    }
  }

  public async addKeystoneKey(
    env: Env,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const session = this.captureUnlockSession();
    this.pendingAddOperations += 1;
    this.cancelUnlockMaintenance();
    let preparedMaterial: SessionKeyStoreMaterial | undefined;

    try {
      if (!this.ledgerKeeper) {
        throw ErrUndefinedLedgerKeeper;
      }

      // Get public key first
      const publicKey = await this.keystoneService.getPubkey(env, bip44HDPath);

      const keyStore = await KeyRing.CreateKeystoneKeyStore(
        this.crypto,
        kdf,
        publicKey,
        session.password,
        await this.assignKeyStoreIdMeta(meta),
        bip44HDPath
      );
      this.assertUnlockSessionCurrent(
        session.password,
        session.unlockSessionId
      );
      preparedMaterial = {
        type: "keystone",
        keystonePublicKey: publicKey,
      };
      const multiKeyStoreInfo = await this.commitPreparedKeyStoreAddition(
        keyStore,
        preparedMaterial,
        session
      );

      return {
        multiKeyStoreInfo,
      };
    } finally {
      if (preparedMaterial) {
        this.clearSessionMaterialBytes(preparedMaterial);
      }
      this.finishPendingAdd(session);
      this.rescheduleUnlockMaintenanceIfCurrent(session);
    }
  }

  public async addLedgerKey(
    env: Env,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    cosmosLikeApp?: string
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const session = this.captureUnlockSession();
    this.pendingAddOperations += 1;
    this.cancelUnlockMaintenance();
    let preparedMaterial: SessionKeyStoreMaterial | undefined;

    if (cosmosLikeApp) {
      meta = {
        ...meta,
        __ledger__cosmos_app_like__: cosmosLikeApp,
      };
    }

    try {
      // Get public key first
      const publicKey = await this.ledgerKeeper.getPublicKey(
        env,
        LedgerApp.Cosmos,
        bip44HDPath,
        cosmosLikeApp
      );

      const pubKeys = {
        [LedgerApp.Cosmos]: publicKey,
      };

      const keyStore = await KeyRing.CreateLedgerKeyStore(
        this.crypto,
        kdf,
        pubKeys,
        session.password,
        await this.assignKeyStoreIdMeta(meta),
        bip44HDPath
      );
      this.assertUnlockSessionCurrent(
        session.password,
        session.unlockSessionId
      );
      preparedMaterial = {
        type: "ledger",
        ledgerPublicKeyCache: pubKeys,
      };
      const multiKeyStoreInfo = await this.commitPreparedKeyStoreAddition(
        keyStore,
        preparedMaterial,
        session
      );

      return {
        multiKeyStoreInfo,
      };
    } finally {
      if (preparedMaterial) {
        this.clearSessionMaterialBytes(preparedMaterial);
      }
      this.finishPendingAdd(session);
      this.rescheduleUnlockMaintenanceIfCurrent(session);
    }
  }

  public async changeKeyStoreFromMultiKeyStore(index: number): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    const session = this.captureUnlockSession();

    const keyStore = this.multiKeyStore[index];
    if (!keyStore) {
      throw new Error("Invalid keystore");
    }

    this.cancelUnlockCacheWarmup();
    this.cancelUnlockMaintenance();

    try {
      await this.reloadActiveKeyStoreForSwitch(keyStore, session);
    } catch (e: unknown) {
      if (
        this.isUnlockSessionCurrent(session.password, session.unlockSessionId)
      ) {
        this.scheduleUnlockCacheWarmup(
          session.password,
          session.unlockSessionId
        );
        this.scheduleUnlockMaintenance(
          session.password,
          session.unlockSessionId
        );
      }
      throw e;
    }

    try {
      const currentChainId = await this.chainsService.getSelectedChain();
      const isCardano =
        this.embedChainInfos
          .find((c) => c.chainId === currentChainId)
          ?.features?.includes("cardano") ?? false;
      const walletIds = this.multiKeyStore.map((ks) =>
        KeyRing.getKeyStoreId(ks)
      );

      const walletNames = this.multiKeyStore.map((ks) => {
        let nameByChain;
        try {
          nameByChain = ks.meta?.["nameByChain"]
            ? JSON.parse(ks.meta["nameByChain"])
            : {};
        } catch {
          nameByChain = {};
        }
        const walletName = ks.meta
          ? nameByChain?.[currentChainId] || ks.meta?.["name"]
          : "Unnamed Account";
        return walletName;
      });
      const activeWalletId = KeyRing.getKeyStoreId(keyStore);
      const cacheUpdate = (async () => {
        if (!isCardano) {
          let cachedActiveAddress = "";
          let hasFullCache = false;

          try {
            const cache = await this.loadGenericChainCache(currentChainId, {
              scryptPriority: "background",
            });
            const activeEntry = activeWalletId
              ? cache[activeWalletId]
              : undefined;
            if (activeEntry?.address) {
              cachedActiveAddress = activeEntry.address;
            }
            hasFullCache =
              walletIds.length > 0 &&
              walletIds.every((id) => Boolean(cache[id]?.address));
          } catch {
            // Skip cache-based checks if cache cannot be read
          }

          let activeWalletAddress = cachedActiveAddress;
          let keys: Key[] | undefined;

          if (!activeWalletAddress) {
            const useEthereumAddress = (
              await this.chainsService.getChainEthereumKeyFeatures(
                currentChainId
              )
            ).address;
            keys = await this.getKeys(currentChainId, useEthereumAddress, {
              scryptPriority: "background",
            });
            const activeWalletIndex = walletIds.indexOf(activeWalletId);
            activeWalletAddress =
              activeWalletIndex >= 0 && keys[activeWalletIndex]?.address
                ? Buffer.from(keys[activeWalletIndex].address).toString("hex")
                : "";

            await this.updateCacheForActiveWallet(
              currentChainId,
              keys,
              walletIds,
              walletNames,
              activeWalletId,
              isCardano
            );
          }

          if (activeWalletAddress && hasFullCache) {
            const consistencyResult = await this.cacheManager.checkConsistency(
              currentChainId,
              walletIds,
              activeWalletId,
              activeWalletAddress,
              isCardano
            );

            if (!consistencyResult.isConsistent) {
              console.warn(
                `[KeyRing] Cache inconsistency after wallet switch for ${currentChainId}:`,
                consistencyResult.issues
              );
              await this.clearAllAddressCaches();

              try {
                const seq = Date.now();
                this.interactionService.dispatchEvent(
                  WEBPAGE_PORT,
                  "clear-cache",
                  {
                    seq,
                  }
                );
              } catch (e: unknown) {
                console.error(
                  `[KeyRing] Failed to dispatch clear-cache event:`,
                  e
                );
                // Continue execution - event dispatch failure is not critical
              }
            }
          }
        } else {
          let cachedActiveAddress = "";
          let hasFullCache = false;

          try {
            const cache = await this.loadCardanoChainCache(currentChainId, {
              scryptPriority: "background",
            });
            const activeEntry = activeWalletId
              ? cache[activeWalletId]
              : undefined;
            if (
              activeEntry?.address &&
              isValidCardanoAddress(activeEntry.address)
            ) {
              cachedActiveAddress = activeEntry.address;
            }
            hasFullCache =
              walletIds.length > 0 &&
              walletIds.every((id) => Boolean(cache[id]?.address));
          } catch {
            // Skip cache-based checks if cache cannot be read
          }

          let activeWalletAddress = cachedActiveAddress;
          let keys: Key[] | undefined;

          if (!activeWalletAddress || !hasFullCache) {
            keys = await this.getKeysForCardano(currentChainId, {
              scryptPriority: "background",
            });
            const activeWalletIndex = walletIds.indexOf(activeWalletId);
            activeWalletAddress =
              activeWalletIndex >= 0 && keys[activeWalletIndex]?.address
                ? Buffer.from(keys[activeWalletIndex].address).toString("utf8")
                : "";

            await this.updateCacheForActiveWallet(
              currentChainId,
              keys,
              walletIds,
              walletNames,
              activeWalletId,
              isCardano
            );
          }

          if (activeWalletAddress && hasFullCache) {
            const consistencyResult = await this.cacheManager.checkConsistency(
              currentChainId,
              walletIds,
              activeWalletId,
              activeWalletAddress,
              isCardano
            );

            if (!consistencyResult.isConsistent) {
              await this.clearAllAddressCaches();

              try {
                const seq = Date.now();
                this.interactionService.dispatchEvent(
                  WEBPAGE_PORT,
                  "clear-cache",
                  {
                    seq,
                  }
                );
              } catch (e: unknown) {
                console.error(
                  `[KeyRing] Failed to dispatch clear-cache event:`,
                  e
                );
                // Continue execution - event dispatch failure is not critical
              }
            }
          }
        }
      })();
      this.trackDetachedBackgroundWork(
        cacheUpdate,
        "[KeyRing] Failed to update caches after wallet switch:"
      );
    } catch (e: unknown) {
      console.error(
        `[KeyRing] Failed to schedule cache updates after wallet switch:`,
        e
      );
      // Continue execution - consistency check failure is not critical
    }

    try {
      this.assertUnlockSessionCurrent(
        session.password,
        session.unlockSessionId
      );
      await this.save();
    } catch (e: unknown) {
      this.rescheduleUnlockCacheWarmupIfCurrent(session);
      this.rescheduleUnlockMaintenanceIfCurrent(session);
      throw e;
    }

    if (
      this.isUnlockSessionCurrent(session.password, session.unlockSessionId)
    ) {
      this.scheduleUnlockCacheWarmup(session.password, session.unlockSessionId);
      this.scheduleUnlockMaintenance(session.password, session.unlockSessionId);
    }
    return {
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
  }

  public getMultiKeyStoreInfo(): MultiKeyStoreInfoWithSelected {
    const result: MultiKeyStoreInfoWithSelected = [];

    for (const keyStore of this.multiKeyStore) {
      result.push({
        version: keyStore.version,
        type: keyStore.type,
        curve: keyStore.curve,
        meta: this.sanitizeMetaForPublicInfo(keyStore.meta),
        ...(keyStore.coinTypeForChain !== undefined
          ? { coinTypeForChain: keyStore.coinTypeForChain }
          : {}),
        bip44HDPath: keyStore.bip44HDPath,
        selected: KeyRing.getKeyStoreId(keyStore) === this.selectedKeyStoreId,
      });
    }

    return result;
  }

  private sanitizeMetaForPublicInfo(
    meta: Record<string, string> | undefined
  ): Record<string, string> {
    if (!meta) {
      return {};
    }

    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (KeyRing.SAFE_META_KEYS.has(key)) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private stripLegacySensitiveMeta(keyStore: KeyStore): {
    sanitized: KeyStore;
    changed: boolean;
  } {
    if (!keyStore?.meta) {
      return { sanitized: keyStore, changed: false };
    }

    let changed = false;
    const nextMeta = { ...keyStore.meta };
    for (const key of KeyRing.LEGACY_SENSITIVE_META_KEYS) {
      if (key in nextMeta) {
        delete nextMeta[key];
        changed = true;
      }
    }

    if (!changed) {
      return { sanitized: keyStore, changed: false };
    }

    return {
      sanitized: {
        ...keyStore,
        meta: nextMeta,
      },
      changed: true,
    };
  }

  /**
   * Keystores written before `curve` existed are implicitly secp256k1, the only
   * curve this keyring has ever derived. Ledger and Keystone never read the
   * field, so those wallets kept working without it, but mnemonic and
   * privateKey signing switches on it and fails. Repair it once on restore so
   * the field is present everywhere it is later assumed.
   */
  private static backfillLegacyCurve(keyStore: KeyStore): {
    backfilled: KeyStore;
    changed: boolean;
  } {
    if (keyStore?.curve !== undefined) {
      return { backfilled: keyStore, changed: false };
    }

    return {
      backfilled: { ...keyStore, curve: KeyCurves.secp256k1 },
      changed: true,
    };
  }

  /**
   * Resolve one Cardano key without starting NetworkRuntime or Blockfrost.
   */
  public getCardanoKeyForKeyStore(
    chainId: string,
    keyStore: KeyStore,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<Key> {
    const storeId = KeyRing.getKeyStoreId(keyStore);
    const keyId = `cardano:${chainId}:${storeId}`;
    const unlockSessionId = this.unlockSessionId;
    const password = this.password;

    const cached = this.cardanoKeyCache.get(keyId);
    if (cached) {
      // Serve the cached pubKey, not an empty one: getKeysForCardano writes
      // this result back into the memory and persisted address caches, so
      // dropping it here would overwrite a good entry with `pubKey: ""`.
      return Promise.resolve({
        algo: "cardano_address_only",
        pubKey: cached.pubKey,
        address: cached.address,
        isKeystone: false,
        isNanoLedger: false,
      });
    }

    const existingFlight = this.cardanoKeyFlights.get(keyId);
    if (existingFlight) {
      return existingFlight;
    }

    const cardanoKeyGeneration = this.cardanoKeyGeneration;
    const derivationHandle = import("../cardano/service").then(
      ({ CardanoService }) => {
        const result = new CardanoService().deriveKeyFromKeyStore(
          keyStore as any,
          password,
          this.crypto,
          chainId,
          { scryptPriority: options?.scryptPriority }
        );
        return {
          result,
          // Keep compatibility with test doubles and older local service
          // implementations while production exposes actual SDK completion.
          completion: result.completion ?? result,
        };
      }
    );
    const ownedCompletion = derivationHandle
      .then(({ completion }) => completion)
      .then((key) => {
        if (
          this.unlockSessionId === unlockSessionId &&
          this.cardanoKeyGeneration === cardanoKeyGeneration &&
          this.multiKeyStore.some(
            (candidate) => KeyRing.getKeyStoreId(candidate) === storeId
          )
        ) {
          this.cardanoKeyCache.set(keyId, {
            address: key.address,
            pubKey: key.pubKey,
          });
        }
        return key;
      });
    const flight = derivationHandle.then(async ({ result }) => {
      try {
        const key = await result;
        // On success, preserve the existing contract that cache publication and
        // flight cleanup are observable before the caller resumes.
        await ownedCompletion;
        return key;
      } catch (error) {
        const isCallerTimeout =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: unknown }).code === "cardano_key_context_timeout";
        if (!isCallerTimeout) {
          // A definitive failure settled the real operation, so release the
          // slot before allowing a later independent call to try again.
          await ownedCompletion.catch(() => undefined);
        }
        throw error;
      }
    });

    this.cardanoKeyFlights.set(keyId, flight);
    ownedCompletion.then(
      () => {
        if (this.cardanoKeyFlights.get(keyId) === flight) {
          this.cardanoKeyFlights.delete(keyId);
        }
      },
      () => {
        if (this.cardanoKeyFlights.get(keyId) === flight) {
          this.cardanoKeyFlights.delete(keyId);
        }
      }
    );

    return flight;
  }

  /**
   * Derive Cardano keys for all wallets (including non-selected) using the in-memory password.
   * Cache miss uses offline KeyContext (deriveKeyFromKeyStore) — never NetworkRuntime /
   * CardanoWalletManager / Blockfrost. For wallets that don't support Cardano or fail
   * derivation, returns a typed capability marker with empty address/pubKey
   * (`cardano_unsupported` / `cardano_derivation_failed`).
   */
  public async getKeysForCardano(
    chainId: string,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<(Key & { name: string })[]> {
    const session = this.captureUnlockSession();
    const cardanoKeyGeneration = this.cardanoKeyGeneration;
    const keyStores = [...this.multiKeyStore];
    const isBulkContextCurrent = () =>
      this.cardanoKeyGeneration === cardanoKeyGeneration &&
      this.isUnlockSessionCurrent(session.password, session.unlockSessionId);
    const isWalletCurrent = (walletId: string) =>
      isBulkContextCurrent() &&
      this.multiKeyStore.some(
        (keyStore) => KeyRing.getKeyStoreId(keyStore) === walletId
      );

    const keys: (Key & { name: string })[] = [];
    let persistent: Record<string, { address: string; pubKey: string }> = {};
    try {
      persistent = await this.loadCardanoChainCache(chainId, options);
    } catch (e: unknown) {
      console.warn(
        `[KeyRing] Failed to load Cardano cache for ${chainId}; rebuilding:`,
        e
      );
    }

    const validIds = new Set(
      keyStores.map((keyStore) => KeyRing.getKeyStoreId(keyStore))
    );
    for (const id of Object.keys(persistent)) {
      if (!validIds.has(id)) {
        delete persistent[id];
      }
    }
    // The final best-effort save below also persists tombstone pruning.

    for (const keyStore of keyStores) {
      let nameByChain;

      try {
        nameByChain = keyStore.meta?.["nameByChain"]
          ? JSON.parse(keyStore.meta["nameByChain"])
          : {};
      } catch {
        nameByChain = {};
      }

      const walletName = keyStore.meta
        ? nameByChain?.[chainId] || keyStore.meta?.["name"]
        : "Unnamed Account";
      const storeId = KeyRing.getKeyStoreId(keyStore);
      const keyId = `cardano:${chainId}:${storeId}`;

      // 1) Try caches FIRST (no decryption/restore on hit)
      const cached = this.cardanoKeyCache.get(keyId);
      if (cached) {
        keys.push({
          name: walletName,
          algo: "cardano_address_only",
          pubKey: cached.pubKey,
          address: cached.address,
          isKeystone: false,
          isNanoLedger: false,
        });
        continue;
      }

      const persisted = persistent[storeId];
      if (persisted && persisted.address) {
        if (!isValidCardanoAddress(persisted.address)) {
          delete persistent[storeId];
        } else {
          const addressBytes = Buffer.from(persisted.address, "utf8");
          const pubKeyRaw = persisted.pubKey || "";
          const looksHex =
            /^[0-9a-fA-F]+$/.test(pubKeyRaw) && pubKeyRaw.length % 2 === 0;
          const pubKeyBytes = pubKeyRaw
            ? Buffer.from(pubKeyRaw, looksHex ? "hex" : "utf8")
            : new Uint8Array(0);
          if (isWalletCurrent(storeId)) {
            this.cardanoKeyCache.set(keyId, {
              address: addressBytes,
              pubKey: pubKeyBytes,
            });
          }
          keys.push({
            name: walletName,
            algo: "cardano_address_only",
            pubKey: pubKeyBytes,
            address: addressBytes,
            isKeystone: false,
            isNanoLedger: false,
          });
          continue;
        }
      }

      // 2) Not cached: decide support without decryption when possible
      let shouldTryCardano = false;
      if (keyStore.meta?.["cardano"] === "true") {
        shouldTryCardano = true;
      } else if (keyStore.type === "mnemonic") {
        const lenMeta = keyStore.meta?.["mnemonicLength"];
        if (lenMeta != null) {
          shouldTryCardano = `${lenMeta}` === "24";
        } else {
          // As a last resort, decrypt to check word length
          try {
            const mnemonic = await this.decryptKeyStoreText(
              keyStore,
              session.password,
              { priority: options?.scryptPriority ?? "interactive" }
            );
            const words = mnemonic.trim().split(/\s+/);
            shouldTryCardano = words.length === 24;
          } catch (e) {
            shouldTryCardano = false;
          }
        }
      } else {
        // Unsupported for Cardano
      }

      let fallbackAlgo: "cardano_unsupported" | "cardano_derivation_failed" =
        "cardano_unsupported";
      if (shouldTryCardano) {
        try {
          // Offline KeyContext only — never spin up NetworkRuntime / Blockfrost.
          const key = await this.getCardanoKeyForKeyStore(chainId, keyStore, {
            scryptPriority: options?.scryptPriority ?? "interactive",
          });
          if (isWalletCurrent(storeId)) {
            this.cardanoKeyCache.set(keyId, {
              address: key.address,
              pubKey: key.pubKey,
            });
            persistent[storeId] = {
              address: Buffer.from(key.address).toString("utf8"),
              pubKey: Buffer.from(key.pubKey).toString("hex"),
            };
          }
          keys.push({ ...key, name: walletName });
          continue;
        } catch (error) {
          fallbackAlgo = "cardano_derivation_failed";
          console.error(
            `[KeyRing] Cardano key derivation failed for ${walletName}:`,
            error
          );
          // Fall through to typed unsupported state.
        }
      }

      // 3) Typed placeholder for unsupported or failed restoration
      keys.push({
        name: walletName,
        algo: fallbackAlgo,
        pubKey: new Uint8Array(0),
        address: new Uint8Array(0),
        isKeystone: false,
        isNanoLedger: false,
      });
    }

    if (isBulkContextCurrent()) {
      const currentWalletIds = new Set(
        this.multiKeyStore.map((keyStore) => KeyRing.getKeyStoreId(keyStore))
      );
      const persistentSnapshot: Record<
        string,
        { address: string; pubKey: string }
      > = {};
      for (const [walletId, entry] of Object.entries(persistent)) {
        if (currentWalletIds.has(walletId)) {
          persistentSnapshot[walletId] = entry;
        }
      }

      this.trackDetachedBackgroundWork(
        this.saveCardanoChainCache(chainId, persistentSnapshot, {
          scryptPriority: options?.scryptPriority ?? "interactive",
        }),
        `[KeyRing] Failed to save rebuilt Cardano cache for ${chainId}:`
      );
    }

    return keys;
  }

  checkPassword(password: string): boolean {
    if (!this.password) {
      throw new Error("Keyring is locked");
    }

    return this.password === password;
  }

  async updatePassword(oldPassword: string, newPassword: string) {
    const session = this.captureUnlockSession();
    if (session.password !== oldPassword) {
      throw new Error("Invalid password");
    }

    if (oldPassword === newPassword) {
      throw new Error("New password must be different");
    }

    const transitionGeneration = this.invalidateUnlockSession();
    this.clearSessionKeyStoreMaterial();
    const selectedWalletId = this.selectedKeyStoreId ?? undefined;
    let durableCommitted = false;
    const assertPasswordTransitionCurrent = () => {
      if (
        this.lifecycleGeneration !== transitionGeneration ||
        this.password !== oldPassword ||
        this.unlockSessionId !== ""
      ) {
        throw new Error("Key ring session changed while password was updating");
      }
    };

    try {
      const newMultiKeyStore: KeyStore[] = [];

      for (const keyStore of this.multiKeyStore) {
        if (keyStore.type) {
          assertPasswordTransitionCurrent();
          const decrypted = await Crypto.decrypt(
            this.crypto,
            keyStore,
            oldPassword
          );
          try {
            assertPasswordTransitionCurrent();
            const reEncrypted = await Crypto.encrypt(
              this.crypto,
              keyStore.crypto.kdf,
              keyStore.type,
              keyStore.curve,
              decrypted,
              newPassword,
              keyStore.meta as Record<string, string>,
              keyStore.bip44HDPath
            );

            assertPasswordTransitionCurrent();
            reEncrypted.coinTypeForChain = KeyRing.clonePersistedValue(
              keyStore.coinTypeForChain
            );
            newMultiKeyStore.push(reEncrypted);
          } finally {
            decrypted.fill(0);
          }
        }
      }

      if (
        selectedWalletId &&
        !newMultiKeyStore.some(
          (keyStore) => KeyRing.getKeyStoreId(keyStore) === selectedWalletId
        )
      ) {
        throw new Error(
          "Selected key store disappeared while updating password"
        );
      }

      // Existing address caches are encrypted with the old password. Clear
      // them before committing the new session so no caller can observe a
      // mixed old/new password state.
      assertPasswordTransitionCurrent();
      await this.cacheManager.clearAllCaches();

      assertPasswordTransitionCurrent();

      // Persist the complete new generation before publishing it in memory.
      // A failed write therefore leaves both disk and the live session on the
      // old password instead of exposing a partially committed transition.
      await this.runKeyRingMutation(async () => {
        await this.persistKeyRingState(
          newMultiKeyStore,
          selectedWalletId ?? null,
          assertPasswordTransitionCurrent
        );
        durableCommitted = true;

        // From this point on, durable storage accepts the new password. Memory
        // publication is synchronous and cannot turn that successful commit
        // into a caller-visible error. A concurrent lock remains authoritative
        // for session state, but not for the committed password generation.
        this.multiKeyStore = newMultiKeyStore;
        this.selectKeyStore(
          selectedWalletId
            ? newMultiKeyStore.find(
                (keyStore) =>
                  KeyRing.getKeyStoreId(keyStore) === selectedWalletId
              ) ?? null
            : null
        );
        if (
          this.lifecycleGeneration === transitionGeneration &&
          this.password === oldPassword &&
          this.unlockSessionId === ""
        ) {
          this.activateUnlockSession(newPassword);
          this.cacheMigrationDoneThisSession = true;
        }
      });

      try {
        this.interactionService.dispatchEvent(
          WEBPAGE_PORT,
          "status-changed",
          {}
        );
      } catch (e: unknown) {
        console.warn(
          "[KeyRing] Password change committed but status notification failed:",
          e
        );
      }
    } catch (e: unknown) {
      if (durableCommitted) {
        console.warn(
          "[KeyRing] Password change committed; post-commit memory finalization was incomplete:",
          e
        );
        return;
      }
      if (
        this.lifecycleGeneration === transitionGeneration &&
        this.password === oldPassword &&
        this.unlockSessionId === ""
      ) {
        const restoredSessionId = this.activateUnlockSession(oldPassword);
        this.scheduleUnlockMaintenance(oldPassword, restoredSessionId);
      }
      throw e;
    }
  }

  async exportKeyRingDatas(password: string): Promise<ExportKeyRingData[]> {
    if (!this.password) {
      throw new Error("Keyring is locked");
    }

    if (this.password !== password) {
      throw new Error("Invalid password");
    }

    const result: ExportKeyRingData[] = [];

    for (const keyStore of this.multiKeyStore) {
      const type = keyStore.type ?? "mnemonic";

      switch (type) {
        case "mnemonic": {
          const mnemonic = await this.decryptKeyStoreText(keyStore, password);

          result.push({
            bip44HDPath: keyStore.bip44HDPath ?? {
              account: 0,
              change: 0,
              addressIndex: 0,
            },
            coinTypeForChain: keyStore.coinTypeForChain,
            key: mnemonic,
            meta: keyStore.meta ?? {},
            type: "mnemonic",
            curve: keyStore.curve,
          });

          break;
        }
        case "privateKey": {
          const privateKey = await this.decryptKeyStoreText(keyStore, password);

          result.push({
            bip44HDPath: keyStore.bip44HDPath ?? {
              account: 0,
              change: 0,
              addressIndex: 0,
            },
            coinTypeForChain: keyStore.coinTypeForChain,
            key: privateKey,
            meta: keyStore.meta ?? {},
            type: "privateKey",
            curve: keyStore.curve,
          });

          break;
        }
      }
    }

    return result;
  }

  private static async CreateMnemonicKeyStore(
    crypto: CommonCrypto,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    mnemonic: string,
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    curve: SupportedCurve = KeyCurves.secp256k1
  ): Promise<KeyStore> {
    return await Crypto.encrypt(
      crypto,
      kdf,
      "mnemonic",
      curve,
      mnemonic,
      password,
      meta,
      bip44HDPath
    );
  }

  private static async CreatePrivateKeyStore(
    crypto: CommonCrypto,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    privateKey: Uint8Array,
    password: string,
    meta: Record<string, string>,
    curve: SupportedCurve = KeyCurves.secp256k1
  ): Promise<KeyStore> {
    return await Crypto.encrypt(
      crypto,
      kdf,
      "privateKey",
      curve,
      Buffer.from(privateKey).toString("hex"),
      password,
      meta
    );
  }

  private static async CreateKeystoneKeyStore(
    crypto: CommonCrypto,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    publicKey: KeystoneKeyringData,
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath
  ): Promise<KeyStore> {
    return await Crypto.encrypt(
      crypto,
      kdf,
      "keystone",
      KeyCurves.secp256k1,
      JSON.stringify(publicKey),
      password,
      meta,
      bip44HDPath
    );
  }

  private static async CreateLedgerKeyStore(
    crypto: CommonCrypto,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    publicKeys: Record<string, Uint8Array | undefined>,
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath
  ): Promise<KeyStore> {
    const publicKeyMap: Record<string, string> = {};
    for (const [key, publicKey] of Object.entries(publicKeys)) {
      if (publicKey) {
        publicKeyMap[key] = Buffer.from(publicKey).toString("hex");
      }
    }

    return await Crypto.encrypt(
      crypto,
      kdf,
      "ledger",
      KeyCurves.secp256k1,
      JSON.stringify(publicKeyMap),
      password,
      meta,
      bip44HDPath
    );
  }

  private async assignKeyStoreIdMeta(meta: { [key: string]: string }): Promise<{
    [key: string]: string;
  }> {
    // Monotonic, never-reused `__id__` values are a correctness/security
    // contract for selectedKeyStoreId, signing context, and address caches.
    return Object.assign({}, meta, {
      __id__: (await this.getIncrementalNumber()).toString(),
    });
  }

  private static getKeyStoreId(keyStore: KeyStore): string {
    const id = keyStore.meta?.["__id__"];
    if (!id) {
      throw new Error("Key store's id is empty");
    }

    return id;
  }

  private static getKeyStoreBIP44Path(keyStore: KeyStore): BIP44HDPath {
    if (!keyStore.bip44HDPath) {
      return {
        account: 0,
        change: 0,
        addressIndex: 0,
      };
    }
    KeyRing.validateBIP44Path(keyStore.bip44HDPath);
    return keyStore.bip44HDPath;
  }

  public static validateBIP44Path(bip44Path: BIP44HDPath): void {
    if (!Number.isInteger(bip44Path.account) || bip44Path.account < 0) {
      throw new Error("Invalid account in hd path");
    }

    if (
      !Number.isInteger(bip44Path.change) ||
      !(bip44Path.change === 0 || bip44Path.change === 1)
    ) {
      throw new Error("Invalid change in hd path");
    }

    if (
      !Number.isInteger(bip44Path.addressIndex) ||
      bip44Path.addressIndex < 0
    ) {
      throw new Error("Invalid address index in hd path");
    }
  }

  private async getIncrementalNumber(): Promise<number> {
    // The serialized read-modify-write makes successful allocations monotonic
    // and prevents a deleted wallet ID from ever being issued again.
    const allocation = this.idAllocationTail.then(async () => {
      let num = await this.kvStore.get<number>("incrementalNumber");
      if (num === undefined) {
        num = 0;
      }
      num++;

      await this.kvStore.set("incrementalNumber", num);
      return num;
    });
    this.idAllocationTail = allocation.then(
      () => undefined,
      () => undefined
    );
    return await allocation;
  }

  // XXX: There are other way to handle tx with ethermint on ledger.
  //      However, some chains have probably competitive spirit with evmos.
  //      They make unnecessary and silly minor changes to ethermint spec.
  //      Thus, there is a probability that it will potentially not work on other chains and they blame us.
  //      So, block them explicitly for now.
  public throwErrorIfEthermintWithLedgerButNotSupported(chainId: string) {
    if (this.keyStore && this.keyStore.type === "ledger") {
      if (!chainId.startsWith("evmos_") && !chainId.startsWith("injective")) {
        throw new Error("Ledger is unsupported for this chain");
      }
    }
  }

  // Return public key if it has been initialized.
  // Else, try to initialize and return the public key.
  // There is no guarantee that the ledger has been initialized except for cosmos.
  // This method can handle the case of not initialized ledger app.
  // Use this method instead of use `this.ledgerPublicKeyCache`
  private ensureLedgerPublicKey(ledgerApp: LedgerApp): Uint8Array {
    if (!this.keyStore) {
      throw new Error("Keystore is empty");
    }

    if (this.keyStore.type !== "ledger") {
      throw new Error("Keystore is not ledger");
    }

    if (!this.ledgerPublicKeyCache) {
      throw new Error("Ledger not initialized");
    }

    const cached = this.ledgerPublicKeyCache[ledgerApp];
    if (cached) {
      return cached;
    }

    throw new Error(
      `No ${ledgerApp} public key. Initialize ${ledgerApp} app on Ledger by selecting the chain in the extension`
    );
  }

  public async initializeNonDefaultLedgerApp(env: Env, ledgerApp: LedgerApp) {
    const session = this.captureUnlockSession();
    const keyStore = this.keyStore;
    if (!keyStore) {
      throw new Error("Keystore is empty");
    }

    if (keyStore.type !== "ledger") {
      throw new Error("Keystore is not ledger");
    }

    const ledgerPublicKeyCache = this.ledgerPublicKeyCache;
    if (!ledgerPublicKeyCache) {
      throw new Error("Ledger not initialized");
    }

    const cached = ledgerPublicKeyCache[ledgerApp];
    if (cached) {
      throw new Error(`Ledger app (${ledgerApp}) has been initialized`);
    }

    const walletId = KeyRing.getKeyStoreId(keyStore);
    const bip44HDPath = keyStore.bip44HDPath ?? {
      account: 0,
      change: 0,
      addressIndex: 0,
    };

    const pubKey = await this.ledgerKeeper.getPublicKey(
      env,
      ledgerApp,
      KeyRing.getKeyStoreBIP44Path(keyStore)
    );

    this.assertUnlockSessionCurrent(session.password, session.unlockSessionId);
    if (this.keyStore !== keyStore) {
      throw new Error(
        "Active key store changed while Ledger app was initializing"
      );
    }

    const pubKeys = {
      ...ledgerPublicKeyCache,
      [ledgerApp]: pubKey,
    };

    // Create a new keystore that is equivalent in all ways, except for the ciphertext,
    // to persist the new public key.
    const newKeyStore = await KeyRing.CreateLedgerKeyStore(
      this.crypto,
      keyStore.crypto.kdf,
      pubKeys,
      session.password,
      keyStore.meta ?? {},
      bip44HDPath
    );

    this.assertUnlockSessionCurrent(session.password, session.unlockSessionId);
    if (this.keyStore !== keyStore) {
      throw new Error(
        "Active key store changed while Ledger app was initializing"
      );
    }

    // Replace the keystore in the MultiKeyStore
    const index = this.multiKeyStore.findIndex(
      (candidate) => KeyRing.getKeyStoreId(candidate) === walletId
    );

    if (index < 0) {
      throw new Error("Could not find keystore in keyring");
    }

    // Update local cache
    this.ledgerPublicKeyCache = pubKeys;
    this.rememberSessionKeyStoreMaterial(newKeyStore, {
      type: "ledger",
      ledgerPublicKeyCache: pubKeys,
    });

    this.multiKeyStore[index] = newKeyStore;
    this.commitActiveKeyStoreForSession(
      newKeyStore,
      {
        type: "ledger",
        ledgerPublicKeyCache: pubKeys,
      },
      session
    );

    await this.save();

    return pubKey;
  }

  public async getKeys(
    chainId: string,
    useEthereumAddress: boolean,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<(Key & { name: string })[]> {
    const keys: (Key & { name: string })[] = [];

    if (!this.password) {
      throw new Error("Keyring is locked");
    }

    let persistent: Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
      }
    > = {};
    try {
      persistent = await this.loadGenericChainCache(chainId, options);
    } catch (e: unknown) {
      console.warn(
        `[KeyRing] Failed to load generic cache for ${chainId}; rebuilding:`,
        e
      );
    }

    const validIds = new Set(
      this.multiKeyStore.map((s) => KeyRing.getKeyStoreId(s))
    );
    for (const id of Object.keys(persistent)) {
      if (!validIds.has(id)) {
        delete persistent[id];
      }
      if (persistent[id] && !persistent[id].pubKey) {
        delete persistent[id];
      }
    }

    // The final best-effort save below also persists stale-entry pruning.

    for (const keyStore of this.multiKeyStore) {
      const defaultCoinType = useEthereumAddress ? 60 : 118;
      const coinType = keyStore.coinTypeForChain
        ? keyStore.coinTypeForChain[ChainIdHelper.parse(chainId).identifier] ??
          defaultCoinType
        : defaultCoinType;

      let nameByChain;

      try {
        nameByChain = keyStore.meta?.["nameByChain"]
          ? JSON.parse(keyStore.meta["nameByChain"])
          : {};
      } catch {
        nameByChain = {};
      }

      const walletName = keyStore.meta
        ? nameByChain?.[chainId] || keyStore.meta?.["name"]
        : "Unnamed Account";

      const storeId = KeyRing.getKeyStoreId(keyStore);
      const sessionMaterial = this.sessionKeyStoreMaterial.get(storeId);

      const persisted = persistent[storeId];
      if (persisted && persisted.address && persisted.pubKey) {
        const hex = persisted.address.startsWith("0x")
          ? persisted.address.slice(2)
          : persisted.address;
        const addressBytes = Buffer.from(hex, "hex");
        const pubKeyBytes = Buffer.from(persisted.pubKey, "hex");

        // Reject stale cosmos-derived cache entries for eth-address-gen chains.
        if (useEthereumAddress) {
          try {
            const expectedEth = computeAddress(pubKeyBytes)
              .replace("0x", "")
              .toLowerCase();
            if (hex.toLowerCase() !== expectedEth) {
              delete persistent[storeId];
            } else {
              keys.push({
                name: walletName,
                algo: "ethsecp256k1",
                pubKey: pubKeyBytes,
                address: addressBytes,
                isNanoLedger: keyStore.type === "ledger",
                isKeystone: keyStore.type === "keystone",
              });
              continue;
            }
          } catch {
            delete persistent[storeId];
          }
        } else {
          keys.push({
            name: walletName,
            algo: KeyCurves.secp256k1,
            pubKey: pubKeyBytes,
            address: addressBytes,
            isNanoLedger: keyStore.type === "ledger",
            isKeystone: keyStore.type === "keystone",
          });
          continue;
        }
      }

      switch (keyStore.type) {
        case "mnemonic": {
          // const type = keyStore.type ?? "mnemonic";
          const path = `m/44'/${coinType}'/${keyStore.bip44HDPath?.account}'/${keyStore.bip44HDPath?.change}/${keyStore.bip44HDPath?.addressIndex}`;
          const mnemonicMasterSeed =
            sessionMaterial?.type === "mnemonic"
              ? new Uint8Array(sessionMaterial.mnemonicMasterSeed)
              : Mnemonic.generateMasterSeedFromMnemonic(
                  await this.decryptKeyStoreText(keyStore, this.password, {
                    priority: options?.scryptPriority ?? "interactive",
                  })
                );
          const _privKey = Mnemonic.generatePrivateKeyFromMasterSeed(
            mnemonicMasterSeed,
            path
          );
          let privKey;

          switch (keyStore.curve) {
            case KeyCurves.secp256k1:
              privKey = new PrivKeySecp256k1(_privKey);
              break;
            default:
              throw new Error(`Unexpected key curve: "${keyStore.curve}"`);
          }
          const pubKey = privKey.getPubKey();

          if (useEthereumAddress) {
            // For Ethereum Key-Gen Only:
            const wallet = new Wallet(privKey.toBytes());
            const addressBytes = Buffer.from(
              wallet.address.replace("0x", ""),
              "hex"
            );
            const pubKeyBytes = pubKey.toBytes();

            keys.push({
              name: walletName,
              algo: "ethsecp256k1",
              pubKey: pubKeyBytes,
              address: addressBytes,
              isKeystone: false,
              isNanoLedger: false,
            });

            persistent[storeId] = {
              address: Buffer.from(addressBytes).toString("hex"),
              pubKey: Buffer.from(pubKeyBytes).toString("hex"),
              name: walletName,
            };
          } else {
            const addressBytes = pubKey.getAddress();
            const pubKeyBytes = pubKey.toBytes();

            keys.push({
              name: walletName,
              algo: KeyCurves.secp256k1,
              pubKey: pubKeyBytes,
              address: addressBytes,
              isNanoLedger: false,
              isKeystone: false,
            });

            persistent[storeId] = {
              address: Buffer.from(addressBytes).toString("hex"),
              pubKey: Buffer.from(pubKeyBytes).toString("hex"),
              name: walletName,
            };
          }
          break;
        }
        case "privateKey": {
          let privKey;
          const privateKey =
            sessionMaterial?.type === "privateKey"
              ? new Uint8Array(sessionMaterial.privateKey)
              : Buffer.from(
                  await this.decryptKeyStoreText(keyStore, this.password, {
                    priority: options?.scryptPriority ?? "interactive",
                  }),
                  "hex"
                );
          switch (keyStore.curve) {
            case KeyCurves.secp256k1:
              privKey = new PrivKeySecp256k1(privateKey);
              break;
            default:
              throw new Error(`Unexpected key curve: "${keyStore.curve}"`);
          }
          const pubKey = privKey.getPubKey();

          if (useEthereumAddress) {
            // For Ethereum Key-Gen Only:
            const wallet = new Wallet(privKey.toBytes());
            const addressBytes = Buffer.from(
              wallet.address.replace("0x", ""),
              "hex"
            );
            const pubKeyBytes = pubKey.toBytes();

            keys.push({
              name: walletName,
              algo: "ethsecp256k1",
              pubKey: pubKeyBytes,
              address: addressBytes,
              isKeystone: false,
              isNanoLedger: false,
            });

            persistent[storeId] = {
              address: Buffer.from(addressBytes).toString("hex"),
              pubKey: Buffer.from(pubKeyBytes).toString("hex"),
              name: walletName,
            };
          } else {
            const addressBytes = pubKey.getAddress();
            const pubKeyBytes = pubKey.toBytes();

            keys.push({
              name: walletName,
              algo: KeyCurves.secp256k1,
              pubKey: pubKeyBytes,
              address: addressBytes,
              isNanoLedger: false,
              isKeystone: false,
            });

            persistent[storeId] = {
              address: Buffer.from(addressBytes).toString("hex"),
              pubKey: Buffer.from(pubKeyBytes).toString("hex"),
              name: walletName,
            };
          }
          break;
        }
        case "keystone": {
          const key =
            sessionMaterial?.type === "keystone"
              ? JSON.parse(JSON.stringify(sessionMaterial.keystonePublicKey))
              : JSON.parse(
                  await this.decryptKeyStoreText(keyStore, this.password, {
                    priority: options?.scryptPriority ?? "interactive",
                  })
                );

          if (!key) {
            throw new Error("CoinType is not available");
          }
          if (useEthereumAddress) {
            const pubKey = publicKeyConvert(
              Buffer.from(key.pubKey, "hex"),
              true
            );
            const address = computeAddress(pubKey);
            keys.push({
              name: keyStore.meta ? keyStore.meta["name"] : "Unnamed Account",
              algo: "ethsecp256k1",
              pubKey,
              address: Buffer.from(address.replace(/^0x/, ""), "hex"),
              isKeystone: true,
              isNanoLedger: false,
            });
          } else {
            const pubKey = new PubKeySecp256k1(Buffer.from(key.pubKey, "hex"));
            keys.push({
              name: keyStore.meta ? keyStore.meta["name"] : "Unnamed Account",
              algo: KeyCurves.secp256k1,
              pubKey: pubKey.toBytes(),
              address: pubKey.getAddress(),
              isKeystone: true,
              isNanoLedger: false,
            });
          }
          break;
        }
        case "ledger": {
          const pubKeys: Record<string, Uint8Array> = {};

          if (sessionMaterial?.type === "ledger") {
            for (const [app, pubKey] of Object.entries(
              sessionMaterial.ledgerPublicKeyCache
            )) {
              if (pubKey) {
                pubKeys[app] = new Uint8Array(pubKey);
              }
            }
          } else {
            const encodedText = await this.decryptKeyStoreText(
              keyStore,
              this.password,
              { priority: options?.scryptPriority ?? "interactive" }
            );

            try {
              const encodedPubkeys = JSON.parse(encodedText);
              Object.keys(encodedPubkeys).forEach(
                (k) => (pubKeys[k] = Buffer.from(encodedPubkeys[k], "hex"))
              );
            } catch (e) {
              // Decode as bytes (Legacy representation)
              pubKeys[LedgerApp.Cosmos] = Buffer.from(encodedText, "hex");
            }
          }

          if (useEthereumAddress) {
            const pubKey = pubKeys[LedgerApp.Ethereum];
            if (!pubKey) {
              throw new Error(
                `No ${LedgerApp.Ethereum} public key. Initialize ${LedgerApp.Ethereum} app on Ledger by selecting the chain in the extension`
              );
            }
            // Generate the Ethereum address for this public key
            const address = computeAddress(pubKey);

            keys.push({
              name: walletName,
              algo: "ethsecp256k1",
              pubKey: pubKey,
              address: Buffer.from(address.replace("0x", ""), "hex"),
              isKeystone: false,
              isNanoLedger: true,
            });
          } else {
            const pubKey = new PubKeySecp256k1(pubKeys[LedgerApp.Cosmos]);

            keys.push({
              name: walletName,
              algo: KeyCurves.secp256k1,
              pubKey: pubKey.toBytes(),
              address: pubKey.getAddress(),
              isKeystone: false,
              isNanoLedger: true,
            });
          }
          break;
        }
        default:
          throw new Error(`Unexpected keyStore type: "${keyStore.type}"`);
      }
    }

    this.trackDetachedBackgroundWork(
      this.saveGenericChainCache(chainId, persistent, {
        scryptPriority: options?.scryptPriority ?? "interactive",
      }),
      `[KeyRing] Failed to save rebuilt generic cache for ${chainId}:`
    );

    return keys;
  }

  private clearActiveKeyStoreCaches(): void {
    this._privateKey?.fill(0);
    this._mnemonicMasterSeed?.fill(0);
    this._privateKey = undefined;
    this._mnemonicMasterSeed = undefined;
    this._ledgerPublicKeyCache = undefined;
    this._keystonePublicKeyCache = undefined;
    this.cached = new Map();
  }

  private clearCaches(): void {
    this.clearActiveKeyStoreCaches();
    this.clearCardanoMemoryCache();
  }

  get keyRing(): any {
    // cardanoKeyRing removed; CardanoService should be used
    return this;
  }

  // cardanoKeyRing removed; CardanoService should be used
}
