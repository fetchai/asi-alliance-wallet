import { Crypto, KeyStore } from "./crypto";
// import { App, AppCoinType } from "@keplr-wallet/ledger-cosmos";
import {
  KeyCurve,
  KeyCurves,
  Hash,
  Mnemonic,
  PrivKeySecp256k1,
  PubKeySecp256k1,
  SecretKey,
} from "@keplr-wallet/crypto";
import { KVStore } from "@keplr-wallet/common";
import { LedgerApp, LedgerService } from "../ledger";
import {
  BIP44HDPath,
  CommonCrypto,
  ExportKeyRingData,
  SignMode,
} from "./types";
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

export enum KeyRingStatus {
  NOTLOADED,
  EMPTY,
  LOCKED,
  UNLOCKED,
}

export interface Key {
  algo: string;
  pubKey: Uint8Array;
  address: Uint8Array;
  isKeystone: boolean;
  isNanoLedger: boolean;
}

export type MultiKeyStoreInfoElem = Pick<
  KeyStore,
  "version" | "type" | "meta" | "bip44HDPath" | "coinTypeForChain" | "curve"
>;
export type MultiKeyStoreInfo = MultiKeyStoreInfoElem[];
export type MultiKeyStoreInfoWithSelectedElem = MultiKeyStoreInfoElem & {
  selected: boolean;
};
export type MultiKeyStoreInfoWithSelected = MultiKeyStoreInfoWithSelectedElem[];

const KeyStoreKey = "key-store";
const KeyMultiStoreKey = "key-multi-store";
const ErrUndefinedLedgerKeeper = new Error("Ledger keeper is not defined");

/*
 Keyring stores keys in persistent backround.
 And, this manages the state, crypto, address, signing and so on...
 */
export class KeyRing {
  private cached: Map<string, Uint8Array> = new Map();

  private loaded: boolean;

  /**
   * Keyring can have either private key or mnemonic.
   * If keyring has private key, it can't set the BIP 44 path.
   */
  private _privateKey?: Uint8Array;
  private _mnemonicMasterSeed?: Uint8Array;
  private _ledgerPublicKeyCache?: Record<string, Uint8Array | undefined>;
  private _keystonePublicKeyCache?: KeystoneKeyringData;

  private keyStore: KeyStore | null;

  private multiKeyStore: KeyStore[];

  private password: string = "";

  constructor(
    private readonly embedChainInfos: ChainInfo[],
    private readonly kvStore: KVStore,
    // TODO: use an interface instead of `LedgerService` class for easier testing.
    private readonly ledgerKeeper: LedgerService,
    private readonly keystoneService: KeystoneService,
    private readonly interactionService: InteractionService,
    private readonly crypto: CommonCrypto
  ) {
    this.loaded = false;
    this.keyStore = null;
    this.multiKeyStore = [];
  }

  public static getTypeOfKeyStore(
    keyStore: Omit<KeyStore, "crypto">
  ): "mnemonic" | "privateKey" | "ledger" | "keystone" {
    const type = keyStore.type;
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
    return (
      this.privateKey == null &&
      this.mnemonicMasterSeed == null &&
      this.ledgerPublicKeyCache == null &&
      this.keystonePublicKey == null
    );
  }

  private get privateKey(): Uint8Array | undefined {
    return this._privateKey;
  }

  private set privateKey(privateKey: Uint8Array | undefined) {
    this._privateKey = privateKey;
    this._mnemonicMasterSeed = undefined;
    this._ledgerPublicKeyCache = undefined;
    this._keystonePublicKeyCache = undefined;
    this.cached = new Map();
  }

  private get mnemonicMasterSeed(): Uint8Array | undefined {
    return this._mnemonicMasterSeed;
  }

  private set mnemonicMasterSeed(masterSeed: Uint8Array | undefined) {
    this._mnemonicMasterSeed = masterSeed;
    this._privateKey = undefined;
    this._ledgerPublicKeyCache = undefined;
    this._keystonePublicKeyCache = undefined;
    this.cached = new Map();
  }

  private get keystonePublicKey(): KeystoneKeyringData | undefined {
    return this._keystonePublicKeyCache;
  }

  private set keystonePublicKey(publicKey: KeystoneKeyringData | undefined) {
    this._keystonePublicKeyCache = publicKey;
    this._mnemonicMasterSeed = undefined;
    this._privateKey = undefined;
    this._ledgerPublicKeyCache = undefined;
    this.cached = new Map();
  }

  private get ledgerPublicKeyCache():
    | Record<string, Uint8Array | undefined>
    | undefined {
    return this._ledgerPublicKeyCache;
  }

  private set ledgerPublicKeyCache(
    publicKeys: Record<string, Uint8Array | undefined> | undefined
  ) {
    this._mnemonicMasterSeed = undefined;
    this._privateKey = undefined;
    this._ledgerPublicKeyCache = publicKeys;
    this.cached = new Map();
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

  public getKey(
    chainId: string,
    defaultCoinType: number,
    useEthereumAddress: boolean
  ): Key {
    return this.loadKey(
      this.computeKeyStoreCoinType(chainId, defaultCoinType),
      useEthereumAddress
    );
  }

  public getKeyStoreMeta(key: string): string {
    if (!this.keyStore || this.keyStore.meta == null) {
      return "";
    }

    return this.keyStore.meta[key] ?? "";
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

  public async createMnemonicKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    mnemonic: string,
    password: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    curve: KeyCurve
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    if (this.status === KeyRingStatus.NOTLOADED) {
      await this.restore();
    }

    if (this.status !== KeyRingStatus.EMPTY) {
      throw new Error("Key ring is not loaded or not empty");
    }

    this.mnemonicMasterSeed = Mnemonic.generateMasterSeedFromMnemonic(mnemonic);
    this.keyStore = await KeyRing.CreateMnemonicKeyStore(
      this.crypto,
      kdf,
      mnemonic,
      password,
      await this.assignKeyStoreIdMeta(meta),
      bip44HDPath,
      curve
    );
    this.password = password;
    this.multiKeyStore.push(this.keyStore);

    await this.save();
    this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});

    return {
      status: this.status,
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
  }

  public async createPrivateKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    privateKey: Uint8Array,
    password: string,
    meta: Record<string, string>,
    curve: KeyCurve
  ): Promise<{
    status: KeyRingStatus;
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    if (this.status === KeyRingStatus.NOTLOADED) {
      await this.restore();
    }

    if (this.status !== KeyRingStatus.EMPTY) {
      throw new Error("Key ring is not loaded or not empty");
    }

    this.privateKey = privateKey;
    this.keyStore = await KeyRing.CreatePrivateKeyStore(
      this.crypto,
      kdf,
      privateKey,
      password,
      await this.assignKeyStoreIdMeta(meta),
      curve
    );
    this.password = password;
    this.multiKeyStore.push(this.keyStore);

    await this.save();
    this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});

    return {
      status: this.status,
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
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
    if (this.status === KeyRingStatus.NOTLOADED) {
      await this.restore();
    }

    if (this.status !== KeyRingStatus.EMPTY) {
      throw new Error("Key ring is not loaded or not empty");
    }
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

    this.password = password;
    this.keyStore = keyStore;
    this.multiKeyStore.push(this.keyStore);
    this.keystonePublicKey = publicKey;

    await this.save();
    this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});

    return {
      status: this.status,
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
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
    if (this.status === KeyRingStatus.NOTLOADED) {
      await this.restore();
    }

    if (this.status !== KeyRingStatus.EMPTY) {
      throw new Error("Key ring is not loaded or not empty");
    }

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

    this.password = password;
    this.keyStore = keyStore;
    this.multiKeyStore.push(this.keyStore);

    this.ledgerPublicKeyCache = pubKeys;

    await this.save();
    this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});
    return {
      status: this.status,
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
  }

  public lock() {
    if (this.status !== KeyRingStatus.UNLOCKED) {
      throw new Error("Key ring is not unlocked");
    }

    this.mnemonicMasterSeed = undefined;
    this.privateKey = undefined;
    this.ledgerPublicKeyCache = undefined;
    this.keystonePublicKey = undefined;
    this.password = "";

    this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});
  }

  public async unlock(password: string) {
    if (!this.keyStore || this.type === "none") {
      throw new Error("Key ring not initialized");
    }

    if (this.type === "mnemonic") {
      // If password is invalid, error will be thrown.
      this.mnemonicMasterSeed = Mnemonic.generateMasterSeedFromMnemonic(
        Buffer.from(
          await Crypto.decrypt(this.crypto, this.keyStore, password)
        ).toString()
      );
    } else if (this.type === "privateKey") {
      // If password is invalid, error will be thrown.
      this.privateKey = Buffer.from(
        Buffer.from(
          await Crypto.decrypt(this.crypto, this.keyStore, password)
        ).toString(),
        "hex"
      );
    } else if (this.type === "ledger") {
      // Attempt to decode the ciphertext as a JSON public key map. If that fails,
      // try decoding as a single public key hex.
      const pubKeys: Record<string, Uint8Array> = {};
      const cipherText = await Crypto.decrypt(
        this.crypto,
        this.keyStore,
        password
      );

      try {
        const encodedPubkeys = JSON.parse(Buffer.from(cipherText).toString());
        Object.keys(encodedPubkeys).forEach(
          (k) => (pubKeys[k] = Buffer.from(encodedPubkeys[k], "hex"))
        );
      } catch (e) {
        // Decode as bytes (Legacy representation)
        pubKeys[LedgerApp.Cosmos] = Buffer.from(
          Buffer.from(cipherText).toString(),
          "hex"
        );
      }

      this.ledgerPublicKeyCache = pubKeys;
    } else if (this.type === "keystone") {
      const cipherText = await Crypto.decrypt(
        this.crypto,
        this.keyStore,
        password
      );
      try {
        this.keystonePublicKey = JSON.parse(Buffer.from(cipherText).toString());
      } catch (e: any) {
        throw new Error("Unexpected content of Keystone public keys");
      }
    } else {
      throw new Error("Unexpected type of keyring");
    }

    this.password = password;
    this.interactionService.dispatchEvent(WEBPAGE_PORT, "status-changed", {});
  }

  public async save() {
    await this.kvStore.set<KeyStore>(KeyStoreKey, this.keyStore);
    await this.kvStore.set<KeyStore[]>(KeyMultiStoreKey, this.multiKeyStore);
  }

  public async restore() {
    const keyStore = await this.kvStore.get<KeyStore>(KeyStoreKey);
    if (!keyStore) {
      this.keyStore = null;
    } else {
      this.keyStore = keyStore;
    }
    const multiKeyStore = await this.kvStore.get<KeyStore[]>(KeyMultiStoreKey);
    if (!multiKeyStore) {
      // Restore the multi keystore if key store exist 13t multi Key store is empty.
      // This case will occur if extension is updated from the prior version that doesn't support the multi key store.
      // This line ensures the backward compatibility.
      if (keyStore) {
        keyStore.meta = await this.assignKeyStoreIdMeta({});
        this.multiKeyStore = [keyStore];
      } else {
        this.multiKeyStore = [];
      }
      await this.save();
    } else {
      this.multiKeyStore = multiKeyStore;
    }

    let hasLegacyKeyStore = false;
    // In prior of version 1.2, bip44 path didn't tie with the keystore, and bip44 exists on the chain info.
    // But, after some chain matures, they decided the bip44 path's coin type.
    // So, some chain can have the multiple bip44 coin type (one is the standard coin type and other is the legacy coin type).
    // We should support the legacy coin type, so we determined that the coin type ties with the keystore.
    // To decrease the barrier of existing users, set the alternative coin type by force if the keystore version is prior than 1.2.
    if (this.keyStore) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (this.keyStore.version === "1" || this.keyStore.version === "1.1") {
        hasLegacyKeyStore = true;
        this.updateLegacyKeyStore(this.keyStore);
      }
    }
    for (const keyStore of this.multiKeyStore) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (keyStore.version === "1" || keyStore.version === "1.1") {
        hasLegacyKeyStore = true;
        this.updateLegacyKeyStore(keyStore);
      }
    }
    if (hasLegacyKeyStore) {
      await this.save();
    }

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
      this.keyStore.coinTypeForChain &&
      this.keyStore.coinTypeForChain[
        ChainIdHelper.parse(chainId).identifier
      ] !== undefined
    );
  }

  public async setKeyStoreCoinType(chainId: string, coinType: number) {
    if (!this.keyStore) {
      throw new Error("Key store is empty");
    }

    if (
      this.keyStore.coinTypeForChain &&
      this.keyStore.coinTypeForChain[
        ChainIdHelper.parse(chainId).identifier
      ] !== undefined
    ) {
      throw new Error("Coin type already set");
    }

    this.keyStore.coinTypeForChain = {
      ...this.keyStore.coinTypeForChain,
      [ChainIdHelper.parse(chainId).identifier]: coinType,
    };

    const keyStoreInMulti = this.multiKeyStore.find((keyStore) => {
      return (
        KeyRing.getKeyStoreId(keyStore) ===
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        KeyRing.getKeyStoreId(this.keyStore!)
      );
    });

    if (keyStoreInMulti) {
      keyStoreInMulti.coinTypeForChain = {
        ...this.keyStore.coinTypeForChain,
      };
    }

    await this.save();
  }

  public removeAllKeyStoreCoinType(chainId: string) {
    const identifier = ChainIdHelper.parse(chainId).identifier;

    if (this.keyStore) {
      const coinTypeForChain = this.keyStore.coinTypeForChain ?? {};
      delete coinTypeForChain[identifier];
      this.keyStore.coinTypeForChain = coinTypeForChain;
    }

    for (const keyStore of this.multiKeyStore) {
      const coinTypeForChain = keyStore.coinTypeForChain ?? {};
      delete coinTypeForChain[identifier];
      keyStore.coinTypeForChain = coinTypeForChain;
    }

    this.save();
  }

  public async deleteKeyRing(
    index: number,
    password: string
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
    keyStoreChanged: boolean;
  }> {
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

    const multiKeyStore = this.multiKeyStore
      .slice(0, index)
      .concat(this.multiKeyStore.slice(index + 1));

    // Make sure that password is valid.
    await Crypto.decrypt(this.crypto, keyStore, password);

    let keyStoreChanged = false;
    if (this.keyStore) {
      // If key store is currently selected key store
      if (
        KeyRing.getKeyStoreId(keyStore) === KeyRing.getKeyStoreId(this.keyStore)
      ) {
        // If there is a key store left
        if (multiKeyStore.length > 0) {
          // Lock key store at first
          await this.lock();
          // Select first key store
          this.keyStore = multiKeyStore[0];
          // And unlock it
          await this.unlock(password);
        } else {
          // Else clear keyring.
          this.keyStore = null;
          this.mnemonicMasterSeed = undefined;
          this.privateKey = undefined;
          this.ledgerPublicKeyCache = undefined;
        }

        keyStoreChanged = true;
      }
    }

    this.multiKeyStore = multiKeyStore;
    await this.save();
    return {
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
      keyStoreChanged,
    };
  }

  public async updateNameKeyRing(
    index: number,
    name: string
  ): Promise<MultiKeyStoreInfoWithSelected> {
    if (this.status !== KeyRingStatus.UNLOCKED) {
      throw new Error("Key ring is not unlocked");
    }

    const keyStore = this.multiKeyStore[index];

    if (!keyStore) {
      throw new Error("Key store is empty");
    }

    keyStore.meta = { ...keyStore.meta, name: name };

    // If select key store and changed store are same, sync keystore
    if (
      this.keyStore &&
      KeyRing.getKeyStoreId(this.keyStore) === KeyRing.getKeyStoreId(keyStore)
    ) {
      this.keyStore = keyStore;
    }
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
        algo: "secp256k1",
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
        chainId,
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

    if (keyStore.type === "mnemonic") {
      // If password is invalid, error will be thrown.
      return Buffer.from(
        await Crypto.decrypt(this.crypto, keyStore, password)
      ).toString();
    } else {
      // If password is invalid, error will be thrown.
      return Buffer.from(
        await Crypto.decrypt(this.crypto, keyStore, password)
      ).toString();
    }
  }

  public get canSetPath(): boolean {
    return this.type === "mnemonic" || this.type === "ledger";
  }

  public async addMnemonicKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    mnemonic: string,
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath,
    curve: KeyCurve = KeyCurves.secp256k1
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    if (this.status !== KeyRingStatus.UNLOCKED || this.password == "") {
      throw new Error("Key ring is locked or not initialized");
    }

    const keyStore = await KeyRing.CreateMnemonicKeyStore(
      this.crypto,
      kdf,
      mnemonic,
      this.password,
      await this.assignKeyStoreIdMeta(meta),
      bip44HDPath,
      curve
    );
    this.multiKeyStore.push(keyStore);

    await this.save();
    return {
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
  }

  public async addPrivateKey(
    kdf: "scrypt" | "sha256" | "pbkdf2",
    privateKey: Uint8Array,
    meta: Record<string, string>,
    curve: KeyCurve = KeyCurves.secp256k1
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    if (this.status !== KeyRingStatus.UNLOCKED || this.password == "") {
      throw new Error("Key ring is locked or not initialized");
    }

    const keyStore = await KeyRing.CreatePrivateKeyStore(
      this.crypto,
      kdf,
      privateKey,
      this.password,
      await this.assignKeyStoreIdMeta(meta),
      curve
    );
    this.multiKeyStore.push(keyStore);

    await this.save();
    return {
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
  }

  public async addKeystoneKey(
    env: Env,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    meta: Record<string, string>,
    bip44HDPath: BIP44HDPath
  ): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    if (this.status !== KeyRingStatus.UNLOCKED || this.password == "") {
      throw new Error("Key ring is locked or not initialized");
    }

    if (!this.ledgerKeeper) {
      throw ErrUndefinedLedgerKeeper;
    }

    // Get public key first
    const publicKey = await this.keystoneService.getPubkey(env, bip44HDPath);

    const keyStore = await KeyRing.CreateKeystoneKeyStore(
      this.crypto,
      kdf,
      publicKey,
      this.password,
      await this.assignKeyStoreIdMeta(meta),
      bip44HDPath
    );

    this.multiKeyStore.push(keyStore);

    await this.save();
    return {
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
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
    if (this.status !== KeyRingStatus.UNLOCKED || this.password == "") {
      throw new Error("Key ring is locked or not initialized");
    }

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
      this.password,
      await this.assignKeyStoreIdMeta(meta),
      bip44HDPath
    );

    this.multiKeyStore.push(keyStore);

    await this.save();
    return {
      multiKeyStoreInfo: this.getMultiKeyStoreInfo(),
    };
  }

  public async changeKeyStoreFromMultiKeyStore(index: number): Promise<{
    multiKeyStoreInfo: MultiKeyStoreInfoWithSelected;
  }> {
    if (this.status !== KeyRingStatus.UNLOCKED || this.password == "") {
      throw new Error("Key ring is locked or not initialized");
    }

    const keyStore = this.multiKeyStore[index];
    if (!keyStore) {
      throw new Error("Invalid keystore");
    }

    this.keyStore = keyStore;

    await this.unlock(this.password);

    await this.save();
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
        meta: keyStore.meta,
        coinTypeForChain: keyStore.coinTypeForChain,
        bip44HDPath: keyStore.bip44HDPath,
        selected: this.keyStore
          ? KeyRing.getKeyStoreId(keyStore) ===
            KeyRing.getKeyStoreId(this.keyStore)
          : false,
      });
    }

    return result;
  }

  checkPassword(password: string): boolean {
    if (!this.password) {
      throw new Error("Keyring is locked");
    }

    return this.password === password;
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
          const mnemonic = Buffer.from(
            await Crypto.decrypt(this.crypto, keyStore, password)
          ).toString();

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
          });

          break;
        }
        case "privateKey": {
          const privateKey = Buffer.from(
            await Crypto.decrypt(this.crypto, keyStore, password)
          ).toString();

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
    curve: KeyCurve = KeyCurves.secp256k1
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
    curve: KeyCurve = KeyCurves.secp256k1
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
    Object.keys(publicKeys)
      .filter((k) => publicKeys[k] != null)
      .forEach(
        (k) => (publicKeyMap[k] = Buffer.from(publicKeys[k]!).toString("hex"))
      );

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
    // `__id__` is used to distinguish the key store.
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
    let num = await this.kvStore.get<number>("incrementalNumber");
    if (num === undefined) {
      num = 0;
    }
    num++;

    await this.kvStore.set("incrementalNumber", num);
    return num;
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
      throw new Error(`Ledger app (${ledgerApp}) has been initialized`);
    }

    const pubKey = await this.ledgerKeeper.getPublicKey(
      env,
      ledgerApp,
      KeyRing.getKeyStoreBIP44Path(this.keyStore)
    );

    const pubKeys = {
      ...this.ledgerPublicKeyCache,
      [ledgerApp]: pubKey,
    };

    // Create a new keystore that is equivalent in all ways, except for the ciphertext,
    // to persist the new public key.
    const newKeyStore = await KeyRing.CreateLedgerKeyStore(
      this.crypto,
      this.keyStore.crypto.kdf,
      pubKeys,
      this.password,
      this.keyStore.meta ?? {},
      this.keyStore.bip44HDPath ?? {
        account: 0,
        change: 0,
        addressIndex: 0,
      }
    );

    // Replace the keystore in the MultiKeyStore
    let index: number | undefined;
    this.multiKeyStore.forEach((k, i) => {
      if (
        this.keyStore &&
        KeyRing.getKeyStoreId(this.keyStore) === KeyRing.getKeyStoreId(k)
      ) {
        index = i;
      }
    });

    if (index === undefined) {
      throw new Error("Could not find keystore in keyring");
    }

    // Update local cache
    this.ledgerPublicKeyCache = pubKeys;

    // Persist keystore changes
    this.keyStore = newKeyStore;
    this.multiKeyStore[index] = newKeyStore;

    // No need to wait.
    this.save();

    return pubKey;
  }

  public async getKeys(
    chainId: string,
    useEthereumAddress: boolean
  ): Promise<(Key & { name: string })[]> {
    const keys: (Key & { name: string })[] = [];

    if (!this.password) {
      throw new Error("Keyring is locked");
    }

    for (const keyStore of this.multiKeyStore) {
      // const type = keyStore.type ?? "mnemonic";
      const defaultCoinType = useEthereumAddress ? 60 : 118;
      const coinType = keyStore.coinTypeForChain
        ? keyStore.coinTypeForChain[ChainIdHelper.parse(chainId).identifier] ??
          defaultCoinType
        : defaultCoinType;

      switch (keyStore.type) {
        case "mnemonic": {
          const mnemonic = Buffer.from(
            await Crypto.decrypt(this.crypto, keyStore, this.password)
          ).toString();

          const path = `m/44'/${coinType}'/${keyStore.bip44HDPath?.account}'/${keyStore.bip44HDPath?.change}/${keyStore.bip44HDPath?.addressIndex}`;
          const mnemonicMasterSeed =
            Mnemonic.generateMasterSeedFromMnemonic(mnemonic);
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
            keys.push({
              name: keyStore.meta ? keyStore.meta["name"] : "Unnamed Account",
              algo: "ethsecp256k1",
              pubKey: pubKey.toBytes(),
              address: Buffer.from(wallet.address.replace("0x", ""), "hex"),
              isKeystone: false,
              isNanoLedger: false,
            });
          } else {
            keys.push({
              name: keyStore.meta ? keyStore.meta["name"] : "Unnamed Account",
              algo: "secp256k1",
              pubKey: pubKey.toBytes(),
              address: pubKey.getAddress(),
              isNanoLedger: false,
              isKeystone: false,
            });
          }
          break;
        }
        case "privateKey": {
          let privKey;
          const privateKey = Buffer.from(
            Buffer.from(
              await Crypto.decrypt(this.crypto, keyStore, this.password)
            ).toString(),
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

            keys.push({
              name: keyStore.meta ? keyStore.meta["name"] : "Unnamed Account",
              algo: "ethsecp256k1",
              pubKey: pubKey.toBytes(),
              address: Buffer.from(wallet.address.replace("0x", ""), "hex"),
              isKeystone: false,
              isNanoLedger: false,
            });
          } else {
            keys.push({
              name: keyStore.meta ? keyStore.meta["name"] : "Unnamed Account",
              algo: "secp256k1",
              pubKey: pubKey.toBytes(),
              address: pubKey.getAddress(),
              isNanoLedger: false,
              isKeystone: false,
            });
          }
          break;
        }
        case "keystone": {
          const cipherText = await Crypto.decrypt(
            this.crypto,
            keyStore,
            this.password
          );
          const key = JSON.parse(Buffer.from(cipherText).toString());

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
              algo: "secp256k1",
              pubKey: pubKey.toBytes(),
              address: pubKey.getAddress(),
              isKeystone: true,
              isNanoLedger: false,
            });
          }
          break;
        }
        case "ledger": {
          const cipherText = await Crypto.decrypt(
            this.crypto,
            keyStore,
            this.password
          );

          const pubKeys: Record<string, Uint8Array> = {};

          try {
            const encodedPubkeys = JSON.parse(
              Buffer.from(cipherText).toString()
            );
            Object.keys(encodedPubkeys).forEach(
              (k) => (pubKeys[k] = Buffer.from(encodedPubkeys[k], "hex"))
            );
          } catch (e) {
            // Decode as bytes (Legacy representation)
            pubKeys[LedgerApp.Cosmos] = Buffer.from(
              Buffer.from(cipherText).toString(),
              "hex"
            );
          }

          if (useEthereumAddress) {
            const pubKey = pubKeys[LedgerApp.Ethereum];
            // Generate the Ethereum address for this public key
            const address = computeAddress(pubKey);

            keys.push({
              name: keyStore.meta ? keyStore.meta["name"] : "Unnamed Account",
              algo: "ethsecp256k1",
              pubKey: pubKey,
              address: Buffer.from(address.replace("0x", ""), "hex"),
              isKeystone: false,
              isNanoLedger: true,
            });
          } else {
            const pubKey = new PubKeySecp256k1(pubKeys[LedgerApp.Cosmos]);

            keys.push({
              name: keyStore.meta ? keyStore.meta["name"] : "Unnamed Account",
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
    return keys;
  }
}
