import { MemoryKVStore } from "@keplr-wallet/common";
import { KeyCurves } from "@keplr-wallet/crypto";
import { KeyRing } from "./keyring";

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

  it("does not call getKeys or checkConsistency when partial cache has active wallet address", async () => {
    const kvStore = new MemoryKVStore("keyring-partial-cache-switch");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = new KeyRing(
      [{ chainId, features: ["evm"] }],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {
        getSelectedChain: jest.fn().mockResolvedValue(chainId),
      }
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w2;
    (keyRing as any).password = "pw";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);

    const getKeysSpy = jest.spyOn(keyRing, "getKeys").mockResolvedValue([]);
    const checkConsistencySpy = jest
      .spyOn(keyRing.cacheManager, "checkConsistency")
      .mockResolvedValue({ isConsistent: true, issues: [] });
    jest.spyOn(keyRing, "unlock").mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w2: { address: "aa".repeat(20), pubKey: "11" },
    });

    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    await flushAsyncRepair();

    expect(getKeysSpy).not.toHaveBeenCalled();
    expect(checkConsistencySpy).not.toHaveBeenCalled();
  });

  it("calls getKeys when active wallet address is missing from partial cache", async () => {
    const kvStore = new MemoryKVStore("keyring-missing-active-cache-switch");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = new KeyRing(
      [{ chainId, features: ["evm"] }],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {
        getSelectedChain: jest.fn().mockResolvedValue(chainId),
      }
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    (keyRing as any).keyStore = w2;
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
    jest.spyOn(keyRing.cacheManager, "checkConsistency");
    jest.spyOn(keyRing, "unlock").mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest
      .spyOn(keyRing, "updateCacheForActiveWallet")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w1: { address: "cc".repeat(20), pubKey: "11" },
    });

    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    await flushAsyncRepair();

    expect(getKeysSpy).toHaveBeenCalledWith(chainId, true);
  });
});
