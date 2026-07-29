import { MemoryKVStore } from "@keplr-wallet/common";
import { KeyCurves, PrivKeySecp256k1 } from "@keplr-wallet/crypto";
import { ChainInfo } from "@keplr-wallet/types";
import { Wallet } from "@ethersproject/wallet";
import { KeyRing } from "./keyring";
import { Crypto } from "./crypto";

function evmEmbedChain(chainId: string): ChainInfo[] {
  return [{ chainId, features: ["evm"] } as ChainInfo];
}

describe("KeyRing security hardening", () => {
  const createKeyStore = (meta: Record<string, string>) => ({
    version: "1.2" as const,
    type: "mnemonic" as const,
    curve: KeyCurves.secp256k1,
    meta,
    bip44HDPath: {
      account: 0,
      change: 0,
      addressIndex: 0,
    },
    crypto: {
      kdf: "scrypt",
    },
  });

  const makeKeyRing = (kvStore: MemoryKVStore) =>
    new KeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      {
        dispatchEvent: jest.fn(),
      } as any,
      {} as any,
      {} as any
    );

  it("sanitizes sensitive meta in getMultiKeyStoreInfo", async () => {
    const kvStore = new MemoryKVStore("keyring-meta-sanitize");
    const keyStore = createKeyStore({
      __id__: "1",
      name: "Wallet 1",
      cardano: "true",
      cardanoSerializedAgent: '{"secret":true}',
      unknownField: "should-not-leak",
    });

    await kvStore.set("key-store", keyStore as any);
    await kvStore.set("key-multi-store", [keyStore] as any);

    const keyRing = makeKeyRing(kvStore);
    await keyRing.restore();

    const info = keyRing.getMultiKeyStoreInfo();
    expect(info).toHaveLength(1);
    expect(info[0].meta).toEqual({
      __id__: "1",
      name: "Wallet 1",
      cardano: "true",
    });
    expect(info[0].meta["cardanoSerializedAgent"]).toBeUndefined();
    expect(info[0].meta["unknownField"]).toBeUndefined();
  });

  it("removes legacy cardanoSerializedAgent from persisted keystores on restore", async () => {
    const kvStore = new MemoryKVStore("keyring-meta-migration");
    const keyStore = createKeyStore({
      __id__: "2",
      name: "Wallet 2",
      cardano: "true",
      cardanoSerializedAgent: '{"legacy":true}',
    });

    await kvStore.set("key-store", keyStore as any);
    await kvStore.set("key-multi-store", [keyStore] as any);

    const keyRing = makeKeyRing(kvStore);
    await keyRing.restore();

    const persistedCurrent = await kvStore.get<any>("key-store");
    const persistedMulti = await kvStore.get<any[]>("key-multi-store");

    expect(persistedCurrent?.meta?.cardanoSerializedAgent).toBeUndefined();
    expect(persistedMulti?.[0]?.meta?.cardanoSerializedAgent).toBeUndefined();
  });

  it("writes Cardano active wallet pubKey in hex format", async () => {
    const kvStore = new MemoryKVStore("keyring-cardano-cache-hex-write");
    const keyRing = makeKeyRing(kvStore);
    const loadSpy = jest
      .spyOn(keyRing, "loadCardanoChainCache")
      .mockResolvedValue({});
    const saveSpy = jest
      .spyOn(keyRing, "saveCardanoChainCache")
      .mockResolvedValue();

    await (keyRing as any).updateCacheForActiveWallet(
      "cardano-preview",
      [
        {
          algo: "cardano_address_only",
          pubKey: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
          address: Buffer.from("addr_test1qpz", "utf8"),
          isKeystone: false,
          isNanoLedger: false,
        },
      ],
      ["wallet-id-1"],
      ["Wallet 1"],
      "wallet-id-1",
      true
    );

    expect(loadSpy).toHaveBeenCalledWith("cardano-preview");
    expect(saveSpy).toHaveBeenCalledWith("cardano-preview", {
      "wallet-id-1": {
        address: "addr_test1qpz",
        pubKey: "deadbeef",
      },
    });
  });
});

describe("changeKeyStoreFromMultiKeyStore generic cache repair", () => {
  const createKeyStore = (meta: Record<string, string>) => ({
    version: "1.2" as const,
    type: "mnemonic" as const,
    curve: KeyCurves.secp256k1,
    meta,
    bip44HDPath: {
      account: 0,
      change: 0,
      addressIndex: 0,
    },
    crypto: {
      kdf: "scrypt",
    },
  });

  const flushAsyncRepair = () =>
    new Promise<void>((resolve) => {
      setImmediate(() => setImmediate(resolve));
    });

  const mockChainsService = (
    chainId: string,
    features: { address: boolean; signing: boolean } = {
      address: true,
      signing: true,
    }
  ) => ({
    getSelectedChain: jest.fn().mockResolvedValue(chainId),
    getChainEthereumKeyFeatures: jest.fn().mockResolvedValue(features),
  });

  it("does not call getKeys or checkConsistency when partial cache has active wallet address", async () => {
    const kvStore = new MemoryKVStore("keyring-partial-cache-switch");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    const chainsService = mockChainsService(chainId);

    const keyRing = new KeyRing(
      evmEmbedChain(chainId),
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      chainsService
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w1;
    (keyRing as any).password = "pw";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);

    const getKeysSpy = jest.spyOn(keyRing, "getKeys").mockResolvedValue([]);
    const checkConsistencySpy = jest
      .spyOn(keyRing.addressCacheManager, "checkConsistency")
      .mockResolvedValue({ isConsistent: true, issues: [] });
    jest
      .spyOn(keyRing as any, "reloadActiveKeyStoreForSwitch")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w2: { address: "aa".repeat(20), pubKey: "11" },
    });

    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    await flushAsyncRepair();

    expect(getKeysSpy).not.toHaveBeenCalled();
    expect(checkConsistencySpy).not.toHaveBeenCalled();
    expect(chainsService.getChainEthereumKeyFeatures).not.toHaveBeenCalled();
  });

  it("calls getKeys when active wallet address is missing from partial cache", async () => {
    const kvStore = new MemoryKVStore("keyring-missing-active-cache-switch");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = new KeyRing(
      evmEmbedChain(chainId),
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      mockChainsService(chainId)
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w1;
    (keyRing as any).password = "pw";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);

    const getKeysSpy = jest.spyOn(keyRing, "getKeys").mockResolvedValue([
      {
        name: "Wallet 2",
        algo: "ethsecp256k1",
        pubKey: Buffer.from("aa", "hex"),
        address: Buffer.from("bb".repeat(20), "hex"),
        isNanoLedger: false,
        isKeystone: false,
      },
    ] as any);
    jest.spyOn(keyRing.addressCacheManager, "checkConsistency");
    jest
      .spyOn(keyRing as any, "reloadActiveKeyStoreForSwitch")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest
      .spyOn(keyRing as any, "updateCacheForActiveWallet")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w1: { address: "cc".repeat(20), pubKey: "11" },
    });

    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    await flushAsyncRepair();

    expect(getKeysSpy).toHaveBeenCalledWith(chainId, true);
  });

  it("uses ethereum address derivation for eth-address-gen chains without evm feature", async () => {
    const kvStore = new MemoryKVStore("keyring-eth-address-gen-switch");
    const chainId = "injective-1";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    const chainsService = mockChainsService(chainId, {
      address: true,
      signing: true,
    });

    const keyRing = new KeyRing(
      [
        {
          chainId,
          features: ["eth-address-gen", "eth-key-sign"],
        } as ChainInfo,
      ],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      chainsService
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w1;
    (keyRing as any).password = "pw";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);

    const getKeysSpy = jest.spyOn(keyRing, "getKeys").mockResolvedValue([
      {
        name: "Wallet 2",
        algo: "ethsecp256k1",
        pubKey: Buffer.from("aa", "hex"),
        address: Buffer.from("bb".repeat(20), "hex"),
        isNanoLedger: false,
        isKeystone: false,
      },
    ] as any);
    jest
      .spyOn(keyRing as any, "reloadActiveKeyStoreForSwitch")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest
      .spyOn(keyRing as any, "updateCacheForActiveWallet")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w1: { address: "cc".repeat(20), pubKey: "11" },
    });

    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    await flushAsyncRepair();

    expect(chainsService.getChainEthereumKeyFeatures).toHaveBeenCalledWith(
      chainId
    );
    expect(getKeysSpy).toHaveBeenCalledWith(chainId, true);
  });

  it("rejects stale cosmos-derived cache entries when ethereum address derivation is required", async () => {
    const kvStore = new MemoryKVStore("keyring-stale-eth-cache");
    const chainId = "injective-1";
    const wallet = Wallet.createRandom();
    const mnemonic = wallet.mnemonic.phrase;
    const privKey = new PrivKeySecp256k1(
      Buffer.from(wallet.privateKey.slice(2), "hex")
    );
    const pubKeyBytes = Buffer.from(privKey.getPubKey().toBytes());
    const cosmosAddressHex = Buffer.from(
      privKey.getPubKey().getAddress()
    ).toString("hex");
    const ethAddressHex = wallet.address.slice(2).toLowerCase();

    const keyStore = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const keyRing = new KeyRing(
      [
        {
          chainId,
          features: ["eth-address-gen", "eth-key-sign"],
        } as ChainInfo,
      ],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      mockChainsService(chainId)
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [keyStore];
    (keyRing as any).keyStore = keyStore;
    (keyRing as any).password = "pw";

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from(mnemonic));
    const saveCacheSpy = jest
      .spyOn(keyRing, "saveGenericChainCache")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w1: {
        address: cosmosAddressHex,
        pubKey: Buffer.from(pubKeyBytes).toString("hex"),
      },
    });

    const keys = await keyRing.getKeys(chainId, true);

    expect(Buffer.from(keys[0].address).toString("hex")).toBe(ethAddressHex);
    expect(saveCacheSpy).toHaveBeenCalled();
    const saved = saveCacheSpy.mock.calls[0][1] as Record<
      string,
      { address: string }
    >;
    expect(saved["w1"].address.toLowerCase()).toBe(ethAddressHex);
  });
});

describe("reloadActiveKeyStoreForSwitch session material cache", () => {
  const createKeyStore = (meta: Record<string, string>) => ({
    version: "1.2" as const,
    type: "mnemonic" as const,
    curve: KeyCurves.secp256k1,
    meta,
    bip44HDPath: {
      account: 0,
      change: 0,
      addressIndex: 0,
    },
    crypto: {
      kdf: "scrypt",
    },
  });

  const mockChainsService = (chainId: string) => ({
    getSelectedChain: jest.fn().mockResolvedValue(chainId),
    getChainEthereumKeyFeatures: jest
      .fn()
      .mockResolvedValue({ address: true, signing: true }),
  });

  it("reuses session material without decrypt on repeat switch to same wallet", async () => {
    const kvStore = new MemoryKVStore("keyring-session-cache-hit");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = new KeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w1;
    (keyRing as any).password = "pw";

    const decryptSpy = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockResolvedValue({
        type: "mnemonic",
        mnemonicMasterSeed: new Uint8Array([9, 9, 9]),
      });

    await (keyRing as any).reloadActiveKeyStoreForSwitch("pw");
    await (keyRing as any).reloadActiveKeyStoreForSwitch("pw");

    expect(decryptSpy).toHaveBeenCalledTimes(1);
  });

  it("changeKeyStoreFromMultiKeyStore uses reloadActiveKeyStoreForSwitch not unlock", async () => {
    const kvStore = new MemoryKVStore("keyring-switch-reload-path");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = new KeyRing(
      evmEmbedChain(chainId),
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      mockChainsService(chainId)
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w1;
    (keyRing as any).password = "pw";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);

    const reloadSpy = jest
      .spyOn(keyRing as any, "reloadActiveKeyStoreForSwitch")
      .mockResolvedValue(undefined);
    const unlockSpy = jest
      .spyOn(keyRing, "unlock")
      .mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w2: { address: "aa".repeat(20), pubKey: "11" },
    });

    await keyRing.changeKeyStoreFromMultiKeyStore(1);

    expect(reloadSpy).toHaveBeenCalledWith("pw");
    expect(unlockSpy).not.toHaveBeenCalled();
  });

  it("clears session material on lock", async () => {
    const kvStore = new MemoryKVStore("keyring-session-cache-lock");
    const keyRing = makeKeyRing(kvStore);

    (keyRing as any).loaded = true;
    (keyRing as any).keyStore = createKeyStore({
      __id__: "w1",
      name: "Wallet 1",
    });
    (keyRing as any).password = "pw";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1, 2, 3]),
    });

    keyRing.lock();

    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(0);
  });

  it("caches active wallet material on unlock so switching back does not decrypt again", async () => {
    const kvStore = new MemoryKVStore("keyring-unlock-session-cache");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = new KeyRing(
      evmEmbedChain(chainId),
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      mockChainsService(chainId)
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w1;

    const decryptSpy = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockResolvedValue({
        type: "mnemonic",
        mnemonicMasterSeed: new Uint8Array([1]),
      });

    jest
      .spyOn(keyRing as any, "calculateMnemonicLengthInBackground")
      .mockResolvedValue(undefined);
    jest
      .spyOn(keyRing as any, "migrateCacheToEncrypted")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w1: { address: "aa".repeat(20), pubKey: "11" },
      w2: { address: "bb".repeat(20), pubKey: "22" },
    });

    await keyRing.unlock("pw");
    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    await keyRing.changeKeyStoreFromMultiKeyStore(0);

    expect(decryptSpy).toHaveBeenCalledTimes(2);
  });

  it("clears session material on password change", async () => {
    const kvStore = new MemoryKVStore("keyring-session-cache-password");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const keyRing = makeKeyRing(kvStore);

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1];
    (keyRing as any).keyStore = w1;
    (keyRing as any).password = "old";
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("payload"));
    jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(
        async (
          _crypto,
          _kdf,
          type,
          curve,
          _payload,
          _password,
          meta,
          bip44HDPath
        ) => ({
          version: "1.2" as const,
          type,
          curve,
          meta: meta as Record<string, string>,
          bip44HDPath,
          crypto: { kdf: "scrypt" },
        })
      );
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);

    await keyRing.updatePassword("old", "new");

    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(0);
  });

  it("does not reuse pre-password session material after password change and switch", async () => {
    const kvStore = new MemoryKVStore("keyring-session-cache-after-password");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = new KeyRing(
      evmEmbedChain(chainId),
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      mockChainsService(chainId)
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w1;

    const decryptSpy = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockResolvedValue({
        type: "mnemonic",
        mnemonicMasterSeed: new Uint8Array([1]),
      });

    jest
      .spyOn(keyRing as any, "calculateMnemonicLengthInBackground")
      .mockResolvedValue(undefined);
    jest
      .spyOn(keyRing as any, "migrateCacheToEncrypted")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w1: { address: "aa".repeat(20), pubKey: "11" },
      w2: { address: "bb".repeat(20), pubKey: "22" },
    });

    await keyRing.unlock("pw");
    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(2);

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("payload"));
    jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(
        async (
          _crypto,
          _kdf,
          type,
          curve,
          _payload,
          _password,
          meta,
          bip44HDPath
        ) => ({
          version: "1.2" as const,
          type,
          curve,
          meta: meta as Record<string, string>,
          bip44HDPath,
          crypto: { kdf: "scrypt" },
        })
      );

    await keyRing.updatePassword("pw", "new");
    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(0);

    decryptSpy.mockClear();

    await keyRing.changeKeyStoreFromMultiKeyStore(0);

    expect(decryptSpy).toHaveBeenCalledTimes(1);
  });
});

describe("getKeysForCardano cold-cache offline path", () => {
  const mnemonic = Array(23).fill("abandon").concat("about").join(" ");
  const createKeyStore = (meta: Record<string, string>) => ({
    version: "1.2" as const,
    type: "mnemonic" as const,
    // Plaintext key path: deriveKeyFromKeyStore uses store.key when present.
    key: mnemonic,
    curve: KeyCurves.secp256k1,
    meta,
    bip44HDPath: {
      account: 0,
      change: 0,
      addressIndex: 0,
    },
    crypto: {
      kdf: "scrypt",
    },
  });

  it("cache miss derives via KeyContext without NetworkRuntime restore or WM create", async () => {
    const kvStore = new MemoryKVStore("keyring-getkeys-cardano-cold");
    const chainId = "cardano-preprod";
    const keyStore = createKeyStore({
      __id__: "w-cardano-1",
      name: "Cardano Wallet",
      cardano: "true",
      mnemonicLength: "24",
    });

    const keyRing = new KeyRing(
      [{ chainId, features: ["cardano"] } as ChainInfo],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [keyStore];
    (keyRing as any).keyStore = keyStore;
    (keyRing as any).password = "pw";
    (keyRing as any).cardanoKeyCache = new Map();
    jest.spyOn(keyRing as any, "loadCardanoChainCache").mockResolvedValue({});
    const saveCache = jest
      .spyOn(keyRing as any, "saveCardanoChainCache")
      .mockResolvedValue(undefined);

    const { CardanoService } = await import("../cardano/service");
    const { CardanoWalletManager } = await import("@keplr-wallet/cardano");

    const addressBytes = Buffer.from("addr_test1qz_getkeys_cold_cache", "utf8");
    const pubKeyBytes = Uint8Array.from([0xab, 0xcd]);

    const deriveSpy = jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockResolvedValue({
        algo: "cardano_address_only",
        pubKey: pubKeyBytes,
        address: addressBytes,
        isKeystone: false,
        isNanoLedger: false,
      } as any);
    const restoreSpy = jest
      .spyOn(CardanoService.prototype, "restoreFromKeyStore")
      .mockImplementation(async () => {
        throw new Error(
          "restoreFromKeyStore must not run for getKeysForCardano"
        );
      });
    const createSpy = jest
      .spyOn(CardanoWalletManager, "create")
      .mockImplementation(async () => {
        throw new Error(
          "CardanoWalletManager.create must not run for getKeysForCardano"
        );
      });

    try {
      const keys = await keyRing.getKeysForCardano(chainId);

      expect(deriveSpy).toHaveBeenCalledTimes(1);
      expect(deriveSpy).toHaveBeenCalledWith(
        keyStore,
        "pw",
        expect.anything(),
        chainId
      );
      expect(restoreSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();

      expect(keys).toHaveLength(1);
      expect(keys[0].name).toBe("Cardano Wallet");
      expect(Buffer.from(keys[0].address).toString("utf8")).toBe(
        "addr_test1qz_getkeys_cold_cache"
      );

      // Memory + persistent chain-specific cache filled for subsequent hits.
      expect(
        (keyRing as any).cardanoKeyCache.get(`cardano:${chainId}:w-cardano-1`)
      ).toEqual({
        address: addressBytes,
        pubKey: pubKeyBytes,
      });
      expect(saveCache).toHaveBeenCalledWith(
        chainId,
        expect.objectContaining({
          "w-cardano-1": {
            address: "addr_test1qz_getkeys_cold_cache",
            pubKey: "abcd",
          },
        })
      );
    } finally {
      deriveSpy.mockRestore();
      restoreSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});

describe("getCardanoKeyForKeyStore", () => {
  const chainId = "cardano-preprod";
  const derivedKey = {
    algo: "cardano_address_only",
    pubKey: new Uint8Array(),
    address: Buffer.from("addr_test1qz_single_flight", "utf8"),
    isKeystone: false,
    isNanoLedger: false,
  };

  const createSubject = () => {
    const keyStore = {
      version: "1.2" as const,
      type: "mnemonic" as const,
      curve: KeyCurves.secp256k1,
      meta: {
        __id__: "w-cardano-single-flight",
        mnemonicLength: "24",
      },
      bip44HDPath: {
        account: 0,
        change: 0,
        addressIndex: 0,
      },
      crypto: {
        kdf: "scrypt",
      },
    };
    const keyRing = makeKeyRing(
      new MemoryKVStore("keyring-cardano-single-flight")
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [keyStore];
    (keyRing as any).keyStore = keyStore;
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-1";

    return {
      keyRing,
      keyStore,
      keyId: `cardano:${chainId}:${keyStore.meta.__id__}`,
    };
  };

  const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };

  const flushAsyncStart = () =>
    new Promise<void>((resolve) => setImmediate(resolve));

  it("shares one derivation between concurrent calls", async () => {
    const { keyRing, keyStore } = createSubject();
    const pending = deferred<any>();
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockReturnValue(pending.promise);

    try {
      const first = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);
      const second = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);

      expect(second).toBe(first);
      await flushAsyncStart();
      expect(deriveSpy).toHaveBeenCalledTimes(1);

      pending.resolve(derivedKey);

      await expect(Promise.all([first, second])).resolves.toEqual([
        derivedKey,
        derivedKey,
      ]);
    } finally {
      deriveSpy.mockRestore();
    }
  });

  it("returns a cached address with the get-key response shape", async () => {
    const { keyRing, keyStore, keyId } = createSubject();
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest.spyOn(
      CardanoService.prototype,
      "deriveKeyFromKeyStore"
    );
    const address = Buffer.from("addr_test1qz_cached", "utf8");

    (keyRing as any).cardanoKeyCache.set(keyId, {
      address,
      pubKey: Uint8Array.from([0xab, 0xcd]),
    });

    try {
      await expect(
        keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any)
      ).resolves.toEqual({
        algo: "cardano_address_only",
        pubKey: new Uint8Array(),
        address,
        isKeystone: false,
        isNanoLedger: false,
      });
      expect(deriveSpy).not.toHaveBeenCalled();
    } finally {
      deriveSpy.mockRestore();
    }
  });

  it("retries after a derivation rejects", async () => {
    const { keyRing, keyStore } = createSubject();
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockRejectedValueOnce(new Error("derive failed"))
      .mockResolvedValueOnce(derivedKey as any);

    try {
      await expect(
        keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any)
      ).rejects.toThrow("derive failed");
      await expect(
        keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any)
      ).resolves.toEqual(derivedKey);
      expect(deriveSpy).toHaveBeenCalledTimes(2);
    } finally {
      deriveSpy.mockRestore();
    }
  });

  it("does not cache a derivation from an expired unlock session", async () => {
    const { keyRing, keyStore, keyId } = createSubject();
    const pending = deferred<any>();
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockReturnValue(pending.promise);

    try {
      const flight = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);
      await flushAsyncStart();

      (keyRing as any).unlockSessionId = "session-2";
      keyRing.clearCardanoMemoryCache();
      pending.resolve(derivedKey);

      await expect(flight).resolves.toEqual(derivedKey);
      expect((keyRing as any).cardanoKeyCache.has(keyId)).toBe(false);
    } finally {
      deriveSpy.mockRestore();
    }
  });

  it("does not let an older flight remove its replacement", async () => {
    const { keyRing, keyStore, keyId } = createSubject();
    const firstPending = deferred<any>();
    const secondPending = deferred<any>();
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockReturnValueOnce(firstPending.promise)
      .mockReturnValueOnce(secondPending.promise);

    try {
      const first = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);
      await flushAsyncStart();

      keyRing.clearCardanoMemoryCache();
      const second = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);
      await flushAsyncStart();
      expect(deriveSpy).toHaveBeenCalledTimes(2);

      firstPending.resolve(derivedKey);
      await expect(first).resolves.toEqual(derivedKey);
      expect((keyRing as any).cardanoKeyFlights.get(keyId)).toBe(second);

      secondPending.resolve(derivedKey);
      await expect(second).resolves.toEqual(derivedKey);
      expect((keyRing as any).cardanoKeyFlights.has(keyId)).toBe(false);
    } finally {
      deriveSpy.mockRestore();
    }
  });

  it("does not let an invalidated flight overwrite the replacement cache", async () => {
    const { keyRing, keyStore, keyId } = createSubject();
    const firstPending = deferred<any>();
    const secondPending = deferred<any>();
    const firstKey = {
      ...derivedKey,
      address: Buffer.from("addr_test1qz_first", "utf8"),
    };
    const secondKey = {
      ...derivedKey,
      address: Buffer.from("addr_test1qz_second", "utf8"),
    };
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockReturnValueOnce(firstPending.promise)
      .mockReturnValueOnce(secondPending.promise);

    try {
      const first = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);
      await flushAsyncStart();

      keyRing.clearCardanoMemoryCache();
      const second = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);
      await flushAsyncStart();

      secondPending.resolve(secondKey);
      await expect(second).resolves.toEqual(secondKey);

      firstPending.resolve(firstKey);
      await expect(first).resolves.toEqual(firstKey);
      expect((keyRing as any).cardanoKeyCache.get(keyId)).toEqual({
        address: secondKey.address,
        pubKey: secondKey.pubKey,
      });
    } finally {
      deriveSpy.mockRestore();
    }
  });
});

function makeKeyRing(kvStore: MemoryKVStore) {
  return new KeyRing(
    [],
    kvStore,
    {} as any,
    {} as any,
    { dispatchEvent: jest.fn() } as any,
    {} as any,
    {} as any
  );
}
