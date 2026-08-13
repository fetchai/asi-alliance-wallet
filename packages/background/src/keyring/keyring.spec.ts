import { MemoryKVStore } from "@keplr-wallet/common";
import { KeyCurves, Mnemonic, PrivKeySecp256k1 } from "@keplr-wallet/crypto";
import { ChainInfo } from "@keplr-wallet/types";
import { Wallet } from "@ethersproject/wallet";
import { LedgerApp } from "../ledger";
import { KeyRing, KeyRingStatus } from "./keyring";
import { Crypto } from "./crypto";
import { readFileSync } from "fs";

const keyRingsToDispose = new Set<KeyRing>();

function createTrackedKeyRing(
  ...args: ConstructorParameters<typeof KeyRing>
): KeyRing {
  const keyRing = new KeyRing(...args);
  keyRingsToDispose.add(keyRing);
  return keyRing;
}

afterEach(async () => {
  await Promise.all([...keyRingsToDispose].map((keyRing) => keyRing.dispose()));
  keyRingsToDispose.clear();
  jest.restoreAllMocks();
});

function evmEmbedChain(chainId: string): ChainInfo[] {
  return [{ chainId, features: ["evm"] } as ChainInfo];
}

function selectKeyStore(
  keyRing: KeyRing,
  keyStore: { meta?: Record<string, string> } | null
): void {
  (keyRing as any).selectedKeyStoreId = keyStore?.meta?.["__id__"] ?? null;
}

function createTrackedDeadlinePromise<T>(
  completion: Promise<T>,
  timeoutMs: number
): Promise<T> & { readonly completion: Promise<T> } {
  const result = new Promise<T>((resolve, reject) => {
    let callerSettled = false;
    const timer = setTimeout(() => {
      if (!callerSettled) {
        callerSettled = true;
        reject(
          Object.assign(new Error("Cardano key context timed out"), {
            name: "CardanoKeyContextTimeoutError",
            code: "cardano_key_context_timeout",
            timeoutMs,
          })
        );
      }
    }, timeoutMs);

    completion.then(
      (value) => {
        if (!callerSettled) {
          callerSettled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      (error) => {
        if (!callerSettled) {
          callerSettled = true;
          clearTimeout(timer);
          reject(error);
        }
      }
    );
  }) as Promise<T> & { readonly completion: Promise<T> };
  Object.defineProperty(result, "completion", { value: completion });
  return result;
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
      cipher: "aes-128-ctr",
      cipherparams: { iv: "11".repeat(16) },
      ciphertext: Buffer.from(meta["__id__"] ?? "wallet").toString("hex"),
      kdf: "scrypt",
      kdfparams: {
        salt: "22".repeat(32),
        dklen: 32,
        n: 131072,
        r: 8,
        p: 1,
      },
      mac: "33".repeat(32),
    },
  });

  const makeKeyRing = (kvStore: MemoryKVStore) =>
    createTrackedKeyRing(
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

  it("does not allow a separately assigned active keystore copy", () => {
    const source = readFileSync(require.resolve("./keyring"), "utf8");
    expect(source).not.toMatch(/this\.keyStore\s*=/);
    expect(source.match(/this\.selectedKeyStoreId\s*=(?!=)/g)).toHaveLength(2);
  });

  it("serializes concurrent wallet ID allocations without lost updates", async () => {
    const kvStore = new MemoryKVStore("keyring-concurrent-id-allocation");
    const keyRing = makeKeyRing(kvStore);
    const realSet = kvStore.set.bind(kvStore);
    let releaseFirstWrite!: () => void;
    let markFirstWriteStarted!: () => void;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    let incrementalWrites = 0;

    jest.spyOn(kvStore, "set").mockImplementation(async (key, value) => {
      if (key === "incrementalNumber") {
        incrementalWrites += 1;
        if (incrementalWrites === 1) {
          markFirstWriteStarted();
          await firstWriteGate;
        }
      }
      await realSet(key, value);
    });

    const first = (keyRing as any).getIncrementalNumber();
    await firstWriteStarted;
    const allocations = [
      first,
      (keyRing as any).getIncrementalNumber(),
      (keyRing as any).getIncrementalNumber(),
      (keyRing as any).getIncrementalNumber(),
    ];

    await Promise.resolve();
    expect(incrementalWrites).toBe(1);
    releaseFirstWrite();

    const ids = await Promise.all(allocations);
    expect(ids).toEqual([1, 2, 3, 4]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(await kvStore.get("incrementalNumber")).toBe(4);
  });

  it("continues wallet ID allocation after a failed write", async () => {
    const kvStore = new MemoryKVStore("keyring-id-allocation-recovery");
    const keyRing = makeKeyRing(kvStore);
    const realSet = kvStore.set.bind(kvStore);
    let shouldFail = true;

    jest.spyOn(kvStore, "set").mockImplementation(async (key, value) => {
      if (key === "incrementalNumber" && shouldFail) {
        shouldFail = false;
        throw new Error("incremental write failed");
      }
      await realSet(key, value);
    });

    await expect((keyRing as any).getIncrementalNumber()).rejects.toThrow(
      "incremental write failed"
    );
    await expect((keyRing as any).getIncrementalNumber()).resolves.toBe(1);
    expect(await kvStore.get("incrementalNumber")).toBe(1);
  });

  it("keeps IDs monotonic across deletion, tombstones, and KeyRing instances", async () => {
    const kvStore = new MemoryKVStore("keyring-id-tombstone-monotonicity");
    const keyRing = makeKeyRing(kvStore);
    const deletedId = String(await (keyRing as any).getIncrementalNumber());
    const retained = createKeyStore({
      __id__: "retained",
      name: "Retained",
    });
    const deleted = createKeyStore({ __id__: deletedId, name: "Deleted" });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [retained, deleted];
    selectKeyStore(keyRing, retained);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-delete-id";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("mnemonic"));
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    await keyRing.deleteKeyRing(1, "pw");

    const nextId = String(await (keyRing as any).getIncrementalNumber());
    expect(Number(nextId)).toBeGreaterThan(Number(deletedId));
    expect(
      (keyRing.addressCacheManager as any).filterDeletedWallets({
        [deletedId]: { address: "deleted" },
        [nextId]: { address: "new" },
      })
    ).toEqual({ [nextId]: { address: "new" } });

    const restoredKeyRing = makeKeyRing(kvStore);
    await expect((restoredKeyRing as any).getIncrementalNumber()).resolves.toBe(
      Number(nextId) + 1
    );
  });

  it("assigns distinct canonical wallets during concurrent add operations", async () => {
    const kvStore = new MemoryKVStore("keyring-concurrent-add-id");
    await kvStore.set("incrementalNumber", 40);
    const chainId = "evmos_9001-2";
    const crypto = {
      rng: async (array: Uint8Array) => {
        array.fill(3);
        return array;
      },
      scrypt: async () => new Uint8Array(32).fill(4),
    };
    const chainsService = {
      getSelectedChain: jest.fn().mockResolvedValue(chainId),
      getChainEthereumKeyFeatures: jest
        .fn()
        .mockResolvedValue({ address: true, signing: true }),
    };
    const keyRing = createTrackedKeyRing(
      evmEmbedChain(chainId),
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      crypto as any,
      chainsService
    );
    const original = createKeyStore({ __id__: "original", name: "Original" });
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [original];
    selectKeyStore(keyRing, original);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-concurrent-add";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    keyRing.addressCacheManager.setPassword("pw");

    jest
      .spyOn(KeyRing as any, "CreatePrivateKeyStore")
      .mockImplementation(async (...args: unknown[]) => {
        const privateKey = args[2] as Uint8Array;
        const meta = args[4] as Record<string, string>;
        const curve = args[5] as string;
        return {
          version: "1.2",
          type: "privateKey",
          curve,
          meta,
          crypto: { kdf: "scrypt" },
          encryptedMaterial: Buffer.from(privateKey).toString("hex"),
        };
      });

    const realSet = kvStore.set.bind(kvStore);
    let releaseFirstIdWrite!: () => void;
    let markFirstIdWriteStarted!: () => void;
    const firstIdWriteGate = new Promise<void>((resolve) => {
      releaseFirstIdWrite = resolve;
    });
    const firstIdWriteStarted = new Promise<void>((resolve) => {
      markFirstIdWriteStarted = resolve;
    });
    let idWrites = 0;
    jest.spyOn(kvStore, "set").mockImplementation(async (key, value) => {
      if (key === "incrementalNumber") {
        idWrites += 1;
        if (idWrites === 1) {
          markFirstIdWriteStarted();
          await firstIdWriteGate;
        }
      }
      await realSet(key, value);
    });

    const firstKey = new Uint8Array(32).fill(1);
    const secondKey = new Uint8Array(32).fill(2);
    const firstAdd = keyRing.addPrivateKey("scrypt", firstKey, {
      name: "First added",
    });
    await firstIdWriteStarted;
    const secondAdd = keyRing.addPrivateKey("scrypt", secondKey, {
      name: "Second added",
    });
    releaseFirstIdWrite();
    await Promise.all([firstAdd, secondAdd]);

    const canonical = (keyRing as any).multiKeyStore as any[];
    const first = canonical.find(
      (wallet) => wallet.meta.name === "First added"
    );
    const second = canonical.find(
      (wallet) => wallet.meta.name === "Second added"
    );
    const firstId = first.meta.__id__;
    const secondId = second.meta.__id__;
    expect(firstId).not.toBe(secondId);
    expect(Number(firstId)).toBeLessThan(Number(secondId));
    expect(
      canonical.filter((wallet) => wallet.meta.__id__ === firstId)
    ).toHaveLength(1);
    expect(
      canonical.filter((wallet) => wallet.meta.__id__ === secondId)
    ).toHaveLength(1);
    expect(await kvStore.get("incrementalNumber")).toBe(42);
    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      keyStores: [
        expect.objectContaining({
          meta: { __id__: "original", name: "Original" },
        }),
        expect.objectContaining({
          meta: { __id__: firstId, name: "First added" },
        }),
        expect.objectContaining({
          meta: { __id__: secondId, name: "Second added" },
        }),
      ],
    });

    await keyRing.saveGenericChainCache(chainId, {
      [firstId]: { address: "11".repeat(20) },
      [secondId]: { address: "22".repeat(20) },
    });
    expect(await keyRing.loadGenericChainCache(chainId)).toEqual({
      [firstId]: { address: "11".repeat(20) },
      [secondId]: { address: "22".repeat(20) },
    });

    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      original: { address: "00".repeat(20) },
      [firstId]: { address: "11".repeat(20) },
      [secondId]: { address: "22".repeat(20) },
    });
    await keyRing.changeKeyStoreFromMultiKeyStore(canonical.indexOf(first));
    expect(keyRing.getCurrentKeyStore()).toBe(first);
    expect((keyRing as any)._privateKey).toEqual(firstKey);
    await keyRing.changeKeyStoreFromMultiKeyStore(canonical.indexOf(second));
    expect(keyRing.getCurrentKeyStore()).toBe(second);
    expect((keyRing as any)._privateKey).toEqual(secondKey);
  });

  it("persists one canonical state and legacy rollback mirrors", async () => {
    const kvStore = new MemoryKVStore("keyring-single-state-write");
    const keyRing = makeKeyRing(kvStore);
    const keyStore = createKeyStore({ __id__: "1", name: "Wallet 1" });
    (keyRing as any).multiKeyStore = [keyStore];
    selectKeyStore(keyRing, keyStore);
    const setSpy = jest.spyOn(kvStore, "set");

    await keyRing.save();

    expect(setSpy).toHaveBeenCalledTimes(4);
    expect(setSpy).toHaveBeenNthCalledWith(1, "keyring-state:v2", {
      selectedId: "1",
      keyStores: [keyStore],
      revision: 1,
      legacyMirror: {
        status: "pending",
        previous: {
          selected: expect.stringMatching(/^sha256:/),
          multi: expect.stringMatching(/^sha256:/),
        },
        target: {
          selected: expect.stringMatching(/^sha256:/),
          multi: expect.stringMatching(/^sha256:/),
        },
      },
    });
    expect(setSpy).toHaveBeenCalledWith("key-store", keyStore);
    expect(setSpy).toHaveBeenCalledWith("key-multi-store", [keyStore]);
    expect(setSpy).toHaveBeenNthCalledWith(4, "keyring-state:v2", {
      selectedId: "1",
      keyStores: [keyStore],
      revision: 1,
      legacyMirror: {
        status: "synced",
        fingerprint: {
          selected: expect.stringMatching(/^sha256:/),
          multi: expect.stringMatching(/^sha256:/),
        },
      },
    });
  });

  it("derives the active keystore from the canonical list entry", () => {
    const keyRing = makeKeyRing(
      new MemoryKVStore("keyring-active-store-derived")
    );
    const original = createKeyStore({ __id__: "1", name: "Original" });
    const replacement = createKeyStore({
      __id__: "1",
      name: "Replacement",
    });
    (keyRing as any).multiKeyStore = [original];
    selectKeyStore(keyRing, original);

    expect(keyRing.getCurrentKeyStore()).toBe(original);

    (keyRing as any).multiKeyStore[0] = replacement;

    expect(keyRing.getCurrentKeyStore()).toBe(replacement);
  });

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
    const persistedLegacyMulti = await kvStore.get<any>("key-multi-store");
    const persistedState = await kvStore.get<any>("keyring-state:v2");

    expect(persistedCurrent).toMatchObject({ meta: { __id__: "2" } });
    expect(persistedLegacyMulti).toEqual([
      expect.objectContaining({
        meta: expect.objectContaining({ __id__: "2", name: "Wallet 2" }),
      }),
    ]);
    expect(persistedState).toMatchObject({
      selectedId: "2",
      keyStores: [
        expect.objectContaining({
          meta: expect.not.objectContaining({
            cardanoSerializedAgent: expect.anything(),
          }),
        }),
      ],
    });
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

    expect(loadSpy).toHaveBeenCalledWith("cardano-preview", {
      scryptPriority: "background",
    });
    expect(saveSpy).toHaveBeenCalledWith("cardano-preview", {
      "wallet-id-1": {
        address: "addr_test1qpz",
        pubKey: "deadbeef",
      },
    });
  });

  it("does not take ownership of the caller's private-key buffer", async () => {
    const kvStore = new MemoryKVStore("keyring-private-key-buffer-ownership");
    const keyRing = makeKeyRing(kvStore);
    const privateKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const originalPrivateKey = new Uint8Array(privateKey);
    const keyStore = {
      version: "1.2" as const,
      type: "privateKey" as const,
      curve: KeyCurves.secp256k1,
      meta: { __id__: "private-1", name: "Private key" },
      crypto: { kdf: "scrypt" },
    };
    (keyRing as any).loaded = true;
    const createSpy = jest
      .spyOn(KeyRing as any, "CreatePrivateKeyStore")
      .mockResolvedValue(keyStore);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    try {
      await keyRing.createPrivateKey(
        "scrypt",
        privateKey,
        "pw",
        { name: "Private key" },
        KeyCurves.secp256k1
      );

      expect((keyRing as any)._privateKey).not.toBe(privateKey);
      expect((keyRing as any)._privateKey).toEqual(originalPrivateKey);
      expect(keyRing.getCurrentUnlockSessionId()).not.toBe("");
      expect(keyRing.addressCacheManager.hasPassword()).toBe(true);

      keyRing.lock();
      expect(privateKey).toEqual(originalPrivateKey);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("allows only one initial key creation across create methods", async () => {
    const kvStore = new MemoryKVStore("keyring-single-initial-creation");
    const keyRing = makeKeyRing(kvStore);
    const createdKeyStore = createKeyStore({
      __id__: "mnemonic-1",
      name: "Mnemonic",
    });
    let finishCreation!: (keyStore: typeof createdKeyStore) => void;
    const creationGate = new Promise<typeof createdKeyStore>((resolve) => {
      finishCreation = resolve;
    });
    (keyRing as any).loaded = true;
    const createSpy = jest
      .spyOn(KeyRing as any, "CreateMnemonicKeyStore")
      .mockReturnValue(creationGate);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    try {
      const firstCreation = keyRing.createMnemonicKey(
        "scrypt",
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        "first-password",
        { name: "Mnemonic" },
        { account: 0, change: 0, addressIndex: 0 },
        KeyCurves.secp256k1
      );

      await expect(
        keyRing.createPrivateKey(
          "scrypt",
          new Uint8Array(32).fill(1),
          "second-password",
          { name: "Private" },
          KeyCurves.secp256k1
        )
      ).rejects.toThrow("Key ring initialization is already in progress");

      finishCreation(createdKeyStore);
      await firstCreation;

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect((keyRing as any).multiKeyStore).toEqual([createdKeyStore]);
      expect(keyRing.currentPassword).toBe("first-password");
    } finally {
      if (keyRing.currentPassword) {
        keyRing.lock();
      }
      createSpy.mockRestore();
    }
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
      cipher: "aes-128-ctr",
      cipherparams: { iv: "11".repeat(16) },
      ciphertext: Buffer.from(meta["__id__"] ?? "wallet").toString("hex"),
      kdf: "scrypt",
      kdfparams: {
        salt: "22".repeat(32),
        dklen: 32,
        n: 131072,
        r: 8,
        p: 1,
      },
      mac: "33".repeat(32),
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

    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-partial-cache";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });

    const getKeysSpy = jest.spyOn(keyRing, "getKeys").mockResolvedValue([]);
    const checkConsistencySpy = jest
      .spyOn(keyRing.addressCacheManager, "checkConsistency")
      .mockResolvedValue({ isConsistent: true, issues: [] });
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

    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-missing-cache";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });

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
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest
      .spyOn(keyRing as any, "updateCacheForActiveWallet")
      .mockResolvedValue(undefined);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w1: { address: "cc".repeat(20), pubKey: "11" },
    });

    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    await flushAsyncRepair();

    expect(getKeysSpy).toHaveBeenCalledWith(chainId, true, {
      scryptPriority: "background",
    });
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

    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-eth-cache";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });

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
    expect(getKeysSpy).toHaveBeenCalledWith(chainId, true, {
      scryptPriority: "background",
    });
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
    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, keyStore);
    (keyRing as any).password = "pw";

    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockResolvedValue(Buffer.from(mnemonic));
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
    expect(decryptSpy).toHaveBeenCalledWith(expect.anything(), keyStore, "pw", {
      priority: "interactive",
    });
    expect(saveCacheSpy).toHaveBeenCalled();
    const saved = saveCacheSpy.mock.calls[0][1] as Record<
      string,
      { address: string }
    >;
    expect(saved["w1"].address.toLowerCase()).toBe(ethAddressHex);
  });

  it("returns cold-derived keys without waiting for the trailing cache save", async () => {
    const kvStore = new MemoryKVStore("keyring-cache-lock-timeout-fallback");
    const chainId = "cosmoshub-4";
    const wallet = Wallet.createRandom();
    const keyStore = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const keyRing = createTrackedKeyRing(
      [{ chainId, features: [] } as any],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      mockChainsService(chainId)
    );
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [keyStore];
    selectKeyStore(keyRing, keyStore);
    (keyRing as any).password = "pw";

    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const saveSpy = jest
      .spyOn(keyRing, "saveGenericChainCache")
      .mockReturnValue(saveGate);

    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockResolvedValue(Buffer.from(wallet.mnemonic.phrase));
    decryptSpy.mockClear();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const outcome = await Promise.race([
        keyRing.getKeys(chainId, false),
        new Promise<"blocked">((resolve) => {
          timeout = setTimeout(() => resolve("blocked"), 100);
        }),
      ]);

      expect(outcome).not.toBe("blocked");
      const keys = outcome as Awaited<ReturnType<KeyRing["getKeys"]>>;
      expect(keys).toHaveLength(1);
      expect(keys[0].name).toBe("Wallet 1");
      expect(decryptSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith(
        chainId,
        expect.objectContaining({ w1: expect.any(Object) }),
        { scryptPriority: "interactive" }
      );
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      releaseSave();
      await saveGate;
      decryptSpy.mockRestore();
    }
  });

  it("uses mnemonic session material for a generic cache miss", async () => {
    const kvStore = new MemoryKVStore("keyring-generic-session-material");
    const chainId = "cosmoshub-4";
    const wallet = Wallet.createRandom();
    const keyStore = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const keyRing = createTrackedKeyRing(
      [{ chainId, features: [] } as any],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      mockChainsService(chainId)
    );
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [keyStore];
    selectKeyStore(keyRing, keyStore);
    (keyRing as any).password = "pw";
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: Mnemonic.generateMasterSeedFromMnemonic(
        wallet.mnemonic.phrase
      ),
    });
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({});
    jest.spyOn(keyRing, "saveGenericChainCache").mockResolvedValue(undefined);
    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockRejectedValue(new Error("generic listing must not decrypt"));

    const keys = await keyRing.getKeys(chainId, false);

    expect(keys).toHaveLength(1);
    expect(keys[0].name).toBe("Wallet 1");
    expect(decryptSpy).not.toHaveBeenCalled();
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
      cipher: "aes-128-ctr",
      cipherparams: { iv: "11".repeat(16) },
      ciphertext: Buffer.from(meta["__id__"] ?? "wallet").toString("hex"),
      kdf: "scrypt",
      kdfparams: {
        salt: "22".repeat(32),
        dklen: 32,
        n: 131072,
        r: 8,
        p: 1,
      },
      mac: "33".repeat(32),
    },
  });

  const mockChainsService = (chainId: string) => ({
    getSelectedChain: jest.fn().mockResolvedValue(chainId),
    getChainEthereumKeyFeatures: jest
      .fn()
      .mockResolvedValue({ address: true, signing: true }),
  });

  it("renames a wallet without invalidating address caches", async () => {
    const kvStore = new MemoryKVStore("keyring-rename-preserves-caches");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Old name" });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-rename";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    const saveSpy = jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    const clearSpy = jest.spyOn(keyRing.addressCacheManager, "clearAllCaches");

    await keyRing.updateNameKeyRing(0, "New name");

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).not.toHaveBeenCalled();
    expect((keyRing as any).keyStore.meta.name).toBe("New name");
  });

  it("does not rename a wallet during a password transition", async () => {
    const kvStore = new MemoryKVStore("keyring-rename-password-race");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Old name" });
    let finishDecrypt!: (value: Uint8Array) => void;
    const decryptGate = new Promise<Uint8Array>((resolve) => {
      finishDecrypt = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    (keyRing as any).password = "old";
    (keyRing as any).unlockSessionId = "session-rename-password";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    jest.spyOn(Crypto, "decrypt").mockReturnValue(decryptGate);
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
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    const passwordUpdate = keyRing.updatePassword("old", "new");
    await Promise.resolve();

    await expect(keyRing.updateNameKeyRing(0, "Lost name")).rejects.toThrow(
      "Key ring is locked or changing state"
    );
    expect(wallet.meta["name"]).toBe("Old name");

    finishDecrypt(Buffer.from("payload"));
    await passwordUpdate;
    expect((keyRing as any).keyStore.meta["name"]).toBe("Old name");
    keyRing.lock();
  });

  it("does not set a coin type outside an active unlock session", async () => {
    const kvStore = new MemoryKVStore("keyring-coin-type-locked");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    const saveSpy = jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    await expect(
      keyRing.setKeyStoreCoinType("cosmoshub-4", 118)
    ).rejects.toThrow("Key ring is locked or changing state");
    expect((wallet as any).coinTypeForChain).toBeUndefined();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("rejects concurrent and repeated unlock attempts", async () => {
    const kvStore = new MemoryKVStore("keyring-single-unlock");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    let finishDecrypt!: (material: {
      type: "mnemonic";
      mnemonicMasterSeed: Uint8Array;
    }) => void;
    const decryptGate = new Promise<{
      type: "mnemonic";
      mnemonicMasterSeed: Uint8Array;
    }>((resolve) => {
      finishDecrypt = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockReturnValue(decryptGate);

    const firstUnlock = keyRing.unlock("pw");
    try {
      await expect(keyRing.unlock("pw")).rejects.toThrow(
        "Key ring unlock is already in progress"
      );

      finishDecrypt({
        type: "mnemonic",
        mnemonicMasterSeed: new Uint8Array([1]),
      });
      await firstUnlock;

      await expect(keyRing.unlock("pw")).rejects.toThrow(
        "Key ring is not locked"
      );
    } finally {
      if (!keyRing.isLocked()) {
        keyRing.lock();
      }
    }
  });

  it("returns from unlock without waiting for background maintenance", async () => {
    const kvStore = new MemoryKVStore("keyring-unlock-non-blocking");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    let releaseMaintenance!: () => void;
    const maintenanceGate = new Promise<void>((resolve) => {
      releaseMaintenance = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);

    jest.spyOn(keyRing as any, "decryptKeyStoreToMaterial").mockResolvedValue({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    const calculateSpy = jest
      .spyOn(keyRing as any, "calculateMnemonicLengthInBackground")
      .mockReturnValue(maintenanceGate);
    const migrateSpy = jest
      .spyOn(keyRing as any, "migrateCacheToEncrypted")
      .mockResolvedValue(undefined);

    jest.useFakeTimers();
    try {
      await expect(keyRing.unlock("pw")).resolves.toBeUndefined();

      expect(calculateSpy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(4_999);
      expect(calculateSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await Promise.resolve();
      expect(calculateSpy).toHaveBeenCalledWith("pw", expect.any(String));
      expect(migrateSpy).not.toHaveBeenCalled();

      keyRing.lock();
      releaseMaintenance();
      await Promise.resolve();
      await Promise.resolve();

      expect(migrateSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("runs shared cache key warm-up only after the unlock grace period", async () => {
    const kvStore = new MemoryKVStore("keyring-unlock-cache-warmup");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const order: string[] = [];
    let releaseWarm!: () => void;
    const warmGate = new Promise<void>((resolve) => {
      releaseWarm = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    jest.spyOn(keyRing as any, "decryptKeyStoreToMaterial").mockResolvedValue({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    const warmSpy = jest
      .spyOn(keyRing.addressCacheManager, "warmSharedDerivedKey")
      .mockImplementation(async () => {
        order.push("warm-start");
        await warmGate;
        order.push("warm-end");
      });
    jest
      .spyOn(keyRing as any, "calculateMnemonicLengthInBackground")
      .mockResolvedValue(undefined);
    jest
      .spyOn(keyRing as any, "migrateCacheToEncrypted")
      .mockResolvedValue(undefined);
    jest
      .spyOn((keyRing as any).interactionService, "dispatchEvent")
      .mockImplementation(() => {
        order.push("event");
      });

    jest.useFakeTimers();
    try {
      await expect(keyRing.unlock("pw")).resolves.toBeUndefined();
      expect(warmSpy).not.toHaveBeenCalled();
      expect(order).toEqual(["event"]);

      jest.advanceTimersByTime(4_999);
      expect(warmSpy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      await Promise.resolve();

      expect(warmSpy).toHaveBeenCalledTimes(1);
      expect(order).toEqual(["event", "warm-start"]);
    } finally {
      releaseWarm();
      await warmGate;
      await Promise.resolve();
      if (!keyRing.isLocked()) {
        keyRing.lock();
      }
      jest.useRealTimers();
    }
  });

  it("prioritizes an immediate non-Cardano switch over cache warm-up", async () => {
    const kvStore = new MemoryKVStore("keyring-post-unlock-switch-priority");
    const chainId = "evmos_9001-2";
    const wallet1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const wallet2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    const keyRing = createTrackedKeyRing(
      evmEmbedChain(chainId),
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {
        getSelectedChain: jest.fn().mockResolvedValue(chainId),
        getChainEthereumKeyFeatures: jest
          .fn()
          .mockResolvedValue({ address: true, signing: true }),
      }
    );
    const order: string[] = [];
    let decryptCalls = 0;
    let releaseRepair!: () => void;
    const repairGate = new Promise<void>((resolve) => {
      releaseRepair = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet1, wallet2];
    selectKeyStore(keyRing, wallet1);
    const decryptSpy = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockImplementation(async () => {
        decryptCalls += 1;
        order.push(decryptCalls === 1 ? "unlock-decrypt" : "switch-decrypt");
        return {
          type: "mnemonic",
          mnemonicMasterSeed: new Uint8Array([decryptCalls]),
        };
      });
    const warmSpy = jest
      .spyOn(keyRing.addressCacheManager, "warmSharedDerivedKey")
      .mockImplementation(async () => {
        order.push("warm-up");
      });
    jest
      .spyOn(keyRing as any, "calculateMnemonicLengthInBackground")
      .mockResolvedValue(undefined);
    jest
      .spyOn(keyRing as any, "migrateCacheToEncrypted")
      .mockResolvedValue(undefined);
    const saveSpy = jest.spyOn(keyRing, "save").mockImplementation(async () => {
      order.push("save");
    });
    const genericRepairSpy = jest
      .spyOn(keyRing, "loadGenericChainCache")
      .mockImplementation(async () => {
        order.push("generic-repair");
        await repairGate;
        return {
          w1: { address: "11".repeat(20) },
          w2: { address: "22".repeat(20) },
        };
      });
    const cardanoKeysSpy = jest.spyOn(keyRing, "getKeysForCardano");

    jest.useFakeTimers();
    try {
      await keyRing.unlock("pw");
      expect(warmSpy).not.toHaveBeenCalled();

      await expect(
        keyRing.changeKeyStoreFromMultiKeyStore(1)
      ).resolves.toBeDefined();

      expect(decryptSpy).toHaveBeenCalledTimes(2);
      expect(order).toEqual([
        "unlock-decrypt",
        "switch-decrypt",
        "generic-repair",
        "save",
      ]);
      expect(warmSpy).not.toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(genericRepairSpy).toHaveBeenCalledWith(chainId, {
        scryptPriority: "background",
      });
      expect(cardanoKeysSpy).not.toHaveBeenCalled();

      releaseRepair();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();

      expect(warmSpy).toHaveBeenCalledTimes(1);
      expect(order.indexOf("switch-decrypt")).toBeLessThan(
        order.indexOf("warm-up")
      );
    } finally {
      releaseRepair?.();
      if (!keyRing.isLocked()) {
        keyRing.lock();
      }
      jest.useRealTimers();
    }
  });

  it("cancels pending cache warm-up when the unlock session is invalidated", async () => {
    const kvStore = new MemoryKVStore("keyring-stale-cache-warmup");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    jest.spyOn(keyRing as any, "decryptKeyStoreToMaterial").mockResolvedValue({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    const warmSpy = jest
      .spyOn(keyRing.addressCacheManager, "warmSharedDerivedKey")
      .mockResolvedValue(undefined);

    jest.useFakeTimers();
    try {
      await keyRing.unlock("pw");
      keyRing.lock();
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
      expect(warmSpy).not.toHaveBeenCalled();

      await keyRing.unlock("pw");
      await keyRing.dispose();
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
      expect(warmSpy).not.toHaveBeenCalled();
    } finally {
      await keyRing.dispose();
      jest.useRealTimers();
    }
  });

  it("joins an already running unlock maintenance flight", async () => {
    const kvStore = new MemoryKVStore("keyring-maintenance-single-flight");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    let releaseMaintenance!: () => void;
    const maintenanceGate = new Promise<void>((resolve) => {
      releaseMaintenance = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    jest.spyOn(keyRing as any, "decryptKeyStoreToMaterial").mockResolvedValue({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    const calculateSpy = jest
      .spyOn(keyRing as any, "calculateMnemonicLengthInBackground")
      .mockReturnValue(maintenanceGate);
    const migrateSpy = jest
      .spyOn(keyRing as any, "migrateCacheToEncrypted")
      .mockResolvedValue(undefined);
    const runSpy = jest.spyOn(keyRing as any, "runUnlockMaintenance");

    jest.useFakeTimers();
    try {
      await keyRing.unlock("pw");
      const session = {
        password: "pw",
        unlockSessionId: keyRing.getCurrentUnlockSessionId(),
      };

      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(calculateSpy).toHaveBeenCalledTimes(1);

      (keyRing as any).rescheduleUnlockMaintenanceIfCurrent(session);
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(calculateSpy).toHaveBeenCalledTimes(1);

      releaseMaintenance();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(migrateSpy).toHaveBeenCalledTimes(1);
      expect((keyRing as any).unlockMaintenanceFlight).toBeUndefined();
      keyRing.lock();
    } finally {
      jest.useRealTimers();
    }
  });

  it("dispose cancels timers and waits for owned background work", async () => {
    const kvStore = new MemoryKVStore("keyring-dispose-background-work");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    let releaseMaintenance!: () => void;
    let releaseDetached!: () => void;
    const maintenanceGate = new Promise<void>((resolve) => {
      releaseMaintenance = resolve;
    });
    const detachedGate = new Promise<void>((resolve) => {
      releaseDetached = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    jest.spyOn(keyRing as any, "decryptKeyStoreToMaterial").mockResolvedValue({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    const calculateSpy = jest
      .spyOn(keyRing as any, "calculateMnemonicLengthInBackground")
      .mockReturnValue(maintenanceGate);
    const migrateSpy = jest
      .spyOn(keyRing as any, "migrateCacheToEncrypted")
      .mockResolvedValue(undefined);

    jest.useFakeTimers();
    try {
      await keyRing.unlock("pw");
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
      expect(calculateSpy).toHaveBeenCalledTimes(1);

      (keyRing as any).trackDetachedBackgroundWork(
        detachedGate,
        "detached work failed"
      );

      let disposed = false;
      const disposal = keyRing.dispose().then(() => {
        disposed = true;
      });
      await Promise.resolve();
      expect(disposed).toBe(false);

      releaseMaintenance();
      await Promise.resolve();
      await Promise.resolve();
      expect(migrateSpy).not.toHaveBeenCalled();
      expect(disposed).toBe(false);

      releaseDetached();
      await disposal;
      expect(disposed).toBe(true);

      jest.advanceTimersByTime(10_000);
      expect(calculateSpy).toHaveBeenCalledTimes(1);
    } finally {
      releaseMaintenance?.();
      releaseDetached?.();
      await keyRing.dispose();
      jest.useRealTimers();
    }
  });

  it("does not persist mnemonic metadata after the unlock session expires", async () => {
    const kvStore = new MemoryKVStore("keyring-stale-maintenance");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    let releaseDecrypt!: (value: Uint8Array) => void;
    const decryptGate = new Promise<Uint8Array>((resolve) => {
      releaseDecrypt = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-1";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockReturnValue(decryptGate);
    decryptSpy.mockClear();
    const saveSpy = jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    try {
      const calculation = (keyRing as any).calculateMnemonicLengthInBackground(
        "pw",
        "session-1"
      );
      expect(decryptSpy).toHaveBeenCalledTimes(1);

      keyRing.lock();
      releaseDecrypt(
        Buffer.from(
          "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        )
      );
      await calculation;

      expect(wallet.meta["mnemonicLength"]).toBeUndefined();
      expect(saveSpy).not.toHaveBeenCalled();
    } finally {
      decryptSpy.mockRestore();
    }
  });

  it("notifies UI after mnemonic length metadata becomes available", async () => {
    const kvStore = new MemoryKVStore("keyring-mnemonic-length-refresh");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-1";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    jest
      .spyOn(Crypto, "decrypt")
      .mockResolvedValue(
        Buffer.from(Array(23).fill("abandon").concat("about").join(" "))
      );
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    const dispatchSpy = (keyRing as any).interactionService
      .dispatchEvent as jest.Mock;
    dispatchSpy.mockClear();

    await (keyRing as any).calculateMnemonicLengthInBackground(
      "pw",
      "session-1"
    );

    expect(wallet.meta["mnemonicLength"]).toBe("24");
    expect(dispatchSpy).toHaveBeenCalledWith("webpage", "status-changed", {});
  });

  it("does not mark a failed cache migration as completed", async () => {
    const kvStore = new MemoryKVStore("keyring-failed-cache-migration");
    const keyRing = makeKeyRing(kvStore);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-1";

    jest
      .spyOn(keyRing as any, "calculateMnemonicLengthInBackground")
      .mockResolvedValue(undefined);
    jest
      .spyOn(keyRing as any, "migrateCacheToEncrypted")
      .mockRejectedValue(new Error("migration-failed"));
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await (keyRing as any).runUnlockMaintenance("pw", "session-1");
      expect((keyRing as any).cacheMigrationDoneThisSession).toBe(false);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("does not wait for persistent cache cleanup before completing wallet deletion", async () => {
    const kvStore = new MemoryKVStore("keyring-delete-cache-cleanup");
    const keyRing = makeKeyRing(kvStore);
    const current = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const deleted = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [current, deleted];
    selectKeyStore(keyRing, current);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-delete-inactive";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockResolvedValue(Buffer.from("payload"));
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    let releaseCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const cleanupSpy = jest
      .spyOn(keyRing.addressCacheManager, "removeWalletFromAllCaches")
      .mockReturnValue(cleanupGate);

    try {
      const deletion = keyRing.deleteKeyRing(1, "pw");
      await expect(deletion).resolves.toMatchObject({
        keyStoreChanged: false,
      });
      expect(cleanupSpy).toHaveBeenCalledWith("w2");
      releaseCleanup();
    } finally {
      decryptSpy.mockRestore();
    }
  });

  it.each([
    {
      label: "generic",
      chains: [
        { chainId: "cosmoshub-4", features: [] } as unknown as ChainInfo,
      ],
      cacheKeys: ["addr_cache:cosmoshub-4"],
    },
    {
      label: "Cardano",
      chains: [
        {
          chainId: "cardano-preview",
          features: ["cardano"],
        } as ChainInfo,
      ],
      cacheKeys: ["cardano_addr_cache:cardano-preview"],
    },
    {
      label: "mixed generic/Cardano",
      chains: [
        {
          chainId: "cosmoshub-4",
          features: [],
        } as unknown as ChainInfo,
        {
          chainId: "cardano-preview",
          features: ["cardano"],
        } as ChainInfo,
      ],
      cacheKeys: [
        "addr_cache:cosmoshub-4",
        "cardano_addr_cache:cardano-preview",
      ],
    },
  ])(
    "detaches password-independent full clear for the last wallet ($label)",
    async ({ label, chains, cacheKeys }) => {
      const kvStore = new MemoryKVStore(
        `keyring-last-wallet-${label.replace(/\W+/g, "-")}`
      );
      const crypto = {
        rng: jest.fn(async (array: Uint8Array) => array),
        scrypt: jest.fn(async () => new Uint8Array(32)),
      };
      const keyRing = createTrackedKeyRing(
        chains,
        kvStore,
        {} as any,
        {} as any,
        { dispatchEvent: jest.fn() } as any,
        crypto as any,
        {} as any
      );
      const deleted = createKeyStore({ __id__: "w1", name: "Wallet 1" });

      (keyRing as any).loaded = true;
      (keyRing as any).multiKeyStore = [deleted];
      selectKeyStore(keyRing, deleted);
      (keyRing as any).password = "pw";
      (keyRing as any).unlockSessionId = "session-delete-last";
      (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
      keyRing.addressCacheManager.setPassword("pw");

      for (const cacheKey of cacheKeys) {
        await kvStore.set(
          cacheKey,
          cacheKey.startsWith("cardano_")
            ? ({
                w1: { address: "addr-deleted", pubKey: "pub-deleted" },
              } as any)
            : ({
                w1: { address: "cosmos-deleted", name: "Deleted" },
              } as any)
        );
      }
      for (const chain of chains) {
        if (chain.features?.includes("cardano")) {
          (keyRing as any).cardanoKeyCache.set(`cardano:${chain.chainId}:w1`, {
            address: Buffer.from("addr-deleted"),
            pubKey: Uint8Array.from([1]),
          });
        }
      }

      const realSet = kvStore.set.bind(kvStore);
      let releaseCleanup!: () => void;
      let markCleanupStarted!: () => void;
      const cleanupGate = new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      const cleanupStarted = new Promise<void>((resolve) => {
        markCleanupStarted = resolve;
      });
      jest.spyOn(kvStore, "set").mockImplementation(async (key, value) => {
        if (value === null && cacheKeys.includes(key)) {
          markCleanupStarted();
          await cleanupGate;
        }
        await realSet(key, value);
      });
      jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("payload"));
      const decryptBlobSpy = jest.spyOn(Crypto, "decryptBlob");

      let deletionSettled = false;
      const deletion = keyRing.deleteKeyRing(0, "pw").then((result) => {
        deletionSettled = true;
        return result;
      });

      try {
        await cleanupStarted;
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(deletionSettled).toBe(true);
        await expect(deletion).resolves.toMatchObject({
          keyStoreChanged: true,
        });
        expect(
          (keyRing.addressCacheManager as any).deletedWalletIds.has("w1")
        ).toBe(true);
        for (const chain of chains) {
          if (chain.features?.includes("cardano")) {
            expect(
              (keyRing as any).cardanoKeyCache.has(
                `cardano:${chain.chainId}:w1`
              )
            ).toBe(false);
          }
        }
        expect(decryptBlobSpy).not.toHaveBeenCalled();
        expect(crypto.scrypt).not.toHaveBeenCalled();
      } finally {
        releaseCleanup();
      }

      await keyRing.dispose();

      for (const cacheKey of cacheKeys) {
        await expect(kvStore.get(cacheKey)).resolves.toBeNull();
      }
      expect(decryptBlobSpy).not.toHaveBeenCalled();
      expect(crypto.scrypt).not.toHaveBeenCalled();
    }
  );

  it("preserves the remaining wallet session material when deleting the active wallet", async () => {
    const kvStore = new MemoryKVStore("keyring-delete-active-session-cache");
    const keyRing = makeKeyRing(kvStore);
    const deleted = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const remaining = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [deleted, remaining];
    selectKeyStore(keyRing, deleted);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-delete-active";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });

    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockResolvedValue(Buffer.from("payload"));
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    const dispatchSpy = (keyRing as any).interactionService
      .dispatchEvent as jest.Mock;
    dispatchSpy.mockClear();
    let releaseCleanup!: () => void;
    let markCleanupStarted!: () => void;
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const cleanupStarted = new Promise<void>((resolve) => {
      markCleanupStarted = resolve;
    });
    jest
      .spyOn(keyRing.addressCacheManager, "removeWalletFromAllCaches")
      .mockImplementation(() => {
        markCleanupStarted();
        return cleanupGate;
      });

    const deletion = keyRing.deleteKeyRing(0, "pw");
    await cleanupStarted;

    expect(dispatchSpy).toHaveBeenCalledWith("webpage", "status-changed", {});
    await expect(deletion).resolves.toMatchObject({
      keyStoreChanged: true,
    });
    releaseCleanup();

    expect((keyRing as any).keyStore).toBe(remaining);
    expect((keyRing as any).sessionKeyStoreMaterial.has("w1")).toBe(false);
    expect((keyRing as any).sessionKeyStoreMaterial.has("w2")).toBe(true);
    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(1);
    expect(decryptSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the original active wallet when the replacement cannot be loaded", async () => {
    const kvStore = new MemoryKVStore("keyring-delete-active-rollback");
    const keyRing = makeKeyRing(kvStore);
    const deleted = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const remaining = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [deleted, remaining];
    selectKeyStore(keyRing, deleted);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-delete-rollback";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("payload"));
    jest
      .spyOn(keyRing as any, "resolveSessionKeyStoreMaterial")
      .mockRejectedValue(new Error("corrupt replacement"));
    const saveSpy = jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    await expect(keyRing.deleteKeyRing(0, "pw")).rejects.toThrow(
      "corrupt replacement"
    );

    expect((keyRing as any).keyStore).toBe(deleted);
    expect((keyRing as any).multiKeyStore).toEqual([deleted, remaining]);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("keeps an add that commits while delete is awaiting password validation", async () => {
    const kvStore = new MemoryKVStore("keyring-delete-snapshot-then-add");
    const keyRing = makeKeyRing(kvStore);
    const selected = createKeyStore({ __id__: "w1", name: "Selected" });
    const deleted = createKeyStore({ __id__: "w2", name: "Deleted" });
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [selected, deleted];
    selectKeyStore(keyRing, selected);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-delete-add";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    await keyRing.save();

    let releaseDelete!: (value: Uint8Array) => void;
    const deleteGate = new Promise<Uint8Array>((resolve) => {
      releaseDelete = resolve;
    });
    jest.spyOn(Crypto, "decrypt").mockReturnValue(deleteGate);
    jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(
        async (_crypto, _kdf, type, curve, _text, _password, meta) => ({
          ...createKeyStore(meta),
          type,
          curve,
        })
      );

    const deletion = keyRing.deleteKeyRing(1, "pw");
    await Promise.resolve();
    const addition = keyRing.addPrivateKey(
      "scrypt",
      new Uint8Array(32).fill(7),
      { name: "Added" }
    );
    await addition;
    releaseDelete(Buffer.from("validated"));
    await deletion;

    const liveIds = (keyRing as any).multiKeyStore.map(
      (wallet: any) => wallet.meta.__id__
    );
    expect(liveIds).toEqual(["w1", "1"]);
    const persistedBeforeRestart = await kvStore.get<any>("keyring-state:v2");
    expect(
      persistedBeforeRestart.keyStores.map((wallet: any) =>
        (KeyRing as any).isPersistedKeyStore(wallet)
      )
    ).toEqual([true, true]);
    const restarted = makeKeyRing(kvStore);
    await restarted.restore();
    expect(
      (restarted as any).multiKeyStore.map((wallet: any) => wallet.meta.__id__)
    ).toEqual(liveIds);
    const ciphertexts = (restarted as any).multiKeyStore.map(
      (wallet: any) => wallet.crypto.ciphertext
    );
    expect(new Set(ciphertexts).size).toBe(ciphertexts.length);
  });

  it("lets an add finish after deleting the previously last wallet", async () => {
    const kvStore = new MemoryKVStore("keyring-add-kdf-then-delete-last");
    const keyRing = makeKeyRing(kvStore);
    const deleted = createKeyStore({ __id__: "w1", name: "Deleted" });
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [deleted];
    selectKeyStore(keyRing, deleted);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-add-delete-last";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    await keyRing.save();

    let finishEncryption!: (keyStore: any) => void;
    let markEncryptionStarted!: () => void;
    let pendingMeta!: Record<string, string>;
    const encryptionStarted = new Promise<void>((resolve) => {
      markEncryptionStarted = resolve;
    });
    const encryptionGate = new Promise<any>((resolve) => {
      finishEncryption = resolve;
    });
    jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(
        async (_crypto, _kdf, _type, _curve, _text, _password, meta) => {
          pendingMeta = meta;
          markEncryptionStarted();
          return await encryptionGate;
        }
      );
    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("validated"));

    const addition = keyRing.addPrivateKey(
      "scrypt",
      new Uint8Array(32).fill(8),
      { name: "Added after delete" }
    );
    await encryptionStarted;
    await keyRing.deleteKeyRing(0, "pw");
    expect((keyRing as any).password).toBe("pw");

    finishEncryption({
      ...createKeyStore(pendingMeta),
      type: "privateKey" as const,
    });
    await addition;

    expect(keyRing.status).toBe(KeyRingStatus.UNLOCKED);
    expect(keyRing.getCurrentKeyStore()?.meta["name"]).toBe(
      "Added after delete"
    );
    const restarted = makeKeyRing(kvStore);
    await restarted.restore();
    expect(restarted.getMultiKeyStoreInfo()).toHaveLength(1);
    expect(restarted.getCurrentKeyStore()?.meta["name"]).toBe(
      "Added after delete"
    );
  });

  it("holds an add outside the wallet array until the delete commit stage settles", async () => {
    const kvStore = new MemoryKVStore("keyring-mutation-tail-serialization");
    const keyRing = makeKeyRing(kvStore);
    const deleted = createKeyStore({ __id__: "w1", name: "Only wallet" });
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [deleted];
    selectKeyStore(keyRing, deleted);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-mutation-tail";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    await keyRing.save();

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("validated"));
    let releaseAddEncryption!: () => void;
    let markAddEncryptionStarted!: () => void;
    const addEncryptionGate = new Promise<void>((resolve) => {
      releaseAddEncryption = resolve;
    });
    const addEncryptionStarted = new Promise<void>((resolve) => {
      markAddEncryptionStarted = resolve;
    });
    jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(
        async (_crypto, _kdf, type, curve, _text, _password, meta) => {
          markAddEncryptionStarted();
          await addEncryptionGate;
          return { ...createKeyStore(meta), type, curve };
        }
      );

    // Hold the delete inside its commit stage: the wallet array is already
    // emptied in memory, but the persist has not resolved yet.
    const realSave = keyRing.save.bind(keyRing);
    let saveCalls = 0;
    let releaseDeleteSave!: () => void;
    let markDeleteSaveStarted!: () => void;
    const deleteSaveGate = new Promise<void>((resolve) => {
      releaseDeleteSave = resolve;
    });
    const deleteSaveStarted = new Promise<void>((resolve) => {
      markDeleteSaveStarted = resolve;
    });
    jest.spyOn(keyRing, "save").mockImplementation(async () => {
      saveCalls += 1;
      if (saveCalls === 1) {
        markDeleteSaveStarted();
        await deleteSaveGate;
      }
      await realSave();
    });

    // The add has to be in flight before the delete empties the array, because
    // an add cannot capture an unlock session once no wallet is selected.
    const addition = keyRing.addPrivateKey(
      "scrypt",
      new Uint8Array(32).fill(5),
      { name: "Added" }
    );
    await addEncryptionStarted;

    const deletion = keyRing.deleteKeyRing(0, "pw");
    await deleteSaveStarted;
    expect((keyRing as any).multiKeyStore).toHaveLength(0);

    releaseAddEncryption();
    // The add has finished every heavy step and is now waiting on the mutation
    // tail alone; give it several turns to prove it cannot get past it.
    for (let round = 0; round < 5; round += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    // Serialization invariant: the logical commit of the add may not interleave
    // with the delete commit that is still running. Without the mutation tail
    // the add publishes its wallet and persists it here, and the delete then
    // resumes with a stale "no wallets left" conclusion.
    expect((keyRing as any).pendingAddOperations).toBe(1);
    expect(saveCalls).toBe(1);
    expect((keyRing as any).multiKeyStore).toHaveLength(0);

    releaseDeleteSave();
    await Promise.all([deletion, addition]);

    // The delete must not tear down the unlock session of the wallet the add
    // published, and the added wallet must survive both in memory and on disk.
    expect((keyRing as any).password).toBe("pw");
    expect((keyRing as any).unlockSessionId).not.toBe("");
    expect(keyRing.status).toBe(KeyRingStatus.UNLOCKED);
    expect(
      (keyRing as any).multiKeyStore.map((wallet: any) => wallet.meta["name"])
    ).toEqual(["Added"]);
    expect(keyRing.getCurrentKeyStore()?.meta["name"]).toBe("Added");

    const restarted = makeKeyRing(kvStore);
    await restarted.restore();
    expect(restarted.getMultiKeyStoreInfo()).toHaveLength(1);
    expect(restarted.getCurrentKeyStore()?.meta["name"]).toBe("Added");
  });

  it("selects the retained wallet when selected deletion races with add", async () => {
    const kvStore = new MemoryKVStore("keyring-selected-delete-with-add");
    const keyRing = makeKeyRing(kvStore);
    const deleted = createKeyStore({ __id__: "w1", name: "Deleted" });
    const retained = createKeyStore({ __id__: "w2", name: "Retained" });
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [deleted, retained];
    selectKeyStore(keyRing, deleted);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-selected-delete-add";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });
    await keyRing.save();

    let releaseDelete!: (value: Uint8Array) => void;
    const deleteGate = new Promise<Uint8Array>((resolve) => {
      releaseDelete = resolve;
    });
    jest.spyOn(Crypto, "decrypt").mockReturnValue(deleteGate);
    jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(
        async (_crypto, _kdf, type, curve, _text, _password, meta) => ({
          ...createKeyStore(meta),
          type,
          curve,
        })
      );

    const deletion = keyRing.deleteKeyRing(0, "pw");
    await Promise.resolve();
    await keyRing.addPrivateKey("scrypt", new Uint8Array(32).fill(9), {
      name: "Added",
    });
    releaseDelete(Buffer.from("validated"));
    await deletion;

    expect(keyRing.getCurrentKeyStore()).toBe(retained);
    expect(
      (keyRing as any).multiKeyStore.map((wallet: any) => wallet.meta["name"])
    ).toEqual(["Retained", "Added"]);
    const restarted = makeKeyRing(kvStore);
    await restarted.restore();
    expect(restarted.getCurrentKeyStore()?.meta["name"]).toBe("Retained");
    expect(restarted.getMultiKeyStoreInfo()).toHaveLength(2);
  });

  it("serializes two add commits with delete and persists each ciphertext once", async () => {
    const kvStore = new MemoryKVStore("keyring-two-adds-with-delete");
    const keyRing = makeKeyRing(kvStore);
    const deleted = createKeyStore({ __id__: "w1", name: "Deleted" });
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [deleted];
    selectKeyStore(keyRing, deleted);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-two-adds-delete";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    await keyRing.save();

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("validated"));
    jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(
        async (_crypto, _kdf, type, curve, _text, _password, meta) => ({
          ...createKeyStore(meta),
          type,
          curve,
        })
      );

    const firstAdd = keyRing.addPrivateKey(
      "scrypt",
      new Uint8Array(32).fill(3),
      { name: "Added 1" }
    );
    const secondAdd = keyRing.addPrivateKey(
      "scrypt",
      new Uint8Array(32).fill(4),
      { name: "Added 2" }
    );
    const deletion = keyRing.deleteKeyRing(0, "pw");
    await Promise.all([firstAdd, secondAdd, deletion]);

    const restarted = makeKeyRing(kvStore);
    await restarted.restore();
    const state = await kvStore.get<any>("keyring-state:v2");
    expect(
      state.keyStores.map((wallet: any) => wallet.meta["name"]).sort()
    ).toEqual(["Added 1", "Added 2"]);
    const ciphertexts = state.keyStores.map(
      (wallet: any) => wallet.crypto.ciphertext
    );
    expect(new Set(ciphertexts).size).toBe(2);
    expect(restarted.getMultiKeyStoreInfo()).toHaveLength(2);
  });

  it("does not publish a delete replacement after the session changes", async () => {
    const kvStore = new MemoryKVStore("keyring-delete-password-race");
    const deleted = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const remaining = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    const keyRing = makeKeyRing(kvStore);
    let finishReplacementDecrypt!: (material: {
      type: "mnemonic";
      mnemonicMasterSeed: Uint8Array;
    }) => void;
    const replacementDecryptGate = new Promise<{
      type: "mnemonic";
      mnemonicMasterSeed: Uint8Array;
    }>((resolve) => {
      finishReplacementDecrypt = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [deleted, remaining];
    selectKeyStore(keyRing, deleted);
    (keyRing as any).password = "old-pw";
    (keyRing as any).unlockSessionId = "session-delete-password";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 1, 1]);
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1, 1, 1]),
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
    const replacementDecryptSpy = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockReturnValue(replacementDecryptGate);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    const cleanupSpy = jest.spyOn(
      keyRing.addressCacheManager,
      "removeWalletFromAllCaches"
    );

    const deletion = keyRing.deleteKeyRing(0, "old-pw");
    await Promise.resolve();
    await Promise.resolve();
    expect(replacementDecryptSpy).toHaveBeenCalledWith(remaining, "old-pw");

    await keyRing.updatePassword("old-pw", "new-pw");
    const reEncryptedSelected = (keyRing as any).keyStore;
    const reEncryptedStores = (keyRing as any).multiKeyStore;

    finishReplacementDecrypt({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2, 2, 2]),
    });
    await expect(deletion).rejects.toThrow(
      "Key ring session changed while operation was running"
    );

    expect((keyRing as any).keyStore).toBe(reEncryptedSelected);
    expect(reEncryptedSelected.meta.__id__).toBe("w1");
    expect((keyRing as any).keyStore).not.toBe(deleted);
    expect((keyRing as any).multiKeyStore).toBe(reEncryptedStores);
    expect(
      (keyRing as any).multiKeyStore.map((ks: any) => ks.meta.__id__)
    ).toEqual(["w1", "w2"]);
    expect((keyRing as any).password).toBe("new-pw");
    expect(cleanupSpy).not.toHaveBeenCalled();
    keyRing.lock();
  });

  it("keeps existing address caches and reuses mnemonic material after add", async () => {
    const kvStore = new MemoryKVStore("keyring-add-preserves-caches");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const crypto = {
      rng: async (array: Uint8Array) => {
        array.fill(1);
        return array;
      },
      scrypt: async () => new Uint8Array(32),
    };
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      crypto as any,
      {} as any
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1];
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-add";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);

    const clearAllCaches = jest
      .spyOn(keyRing.addressCacheManager, "clearAllCaches")
      .mockImplementation(() => new Promise<void>(() => undefined));
    const mnemonic = Array(11).fill("abandon").concat("about").join(" ");

    await keyRing.addMnemonicKey(
      "scrypt",
      mnemonic,
      { name: "Wallet 2" },
      { account: 0, change: 0, addressIndex: 0 }
    );

    expect(clearAllCaches).not.toHaveBeenCalled();

    const added = (keyRing as any).multiKeyStore[1];
    expect(added).toBeDefined();
    expect(
      (keyRing as any).sessionKeyStoreMaterial.has(added.meta.__id__)
    ).toBe(true);

    const decryptSpy = jest.spyOn(keyRing as any, "decryptKeyStoreToMaterial");
    await (keyRing as any).reloadActiveKeyStoreForSwitch(added, {
      password: "pw",
      unlockSessionId: "session-add",
    });

    expect(decryptSpy).not.toHaveBeenCalled();
  });

  it("reuses session material without decrypt on repeat switch to same wallet", async () => {
    const kvStore = new MemoryKVStore("keyring-session-cache-hit");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-reload";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    const decryptSpy = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockResolvedValue({
        type: "mnemonic",
        mnemonicMasterSeed: new Uint8Array([9, 9, 9]),
      });

    const session = {
      password: "pw",
      unlockSessionId: "session-reload",
    };
    await (keyRing as any).reloadActiveKeyStoreForSwitch(w1, session);
    await (keyRing as any).reloadActiveKeyStoreForSwitch(w1, session);

    expect(decryptSpy).toHaveBeenCalledTimes(1);
  });

  it("does not apply a wallet switch that finishes after lock", async () => {
    const kvStore = new MemoryKVStore("keyring-switch-after-lock");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    const keyRing = makeKeyRing(kvStore);
    let finishDecrypt!: (material: {
      type: "mnemonic";
      mnemonicMasterSeed: Uint8Array;
    }) => void;
    const decryptGate = new Promise<{
      type: "mnemonic";
      mnemonicMasterSeed: Uint8Array;
    }>((resolve) => {
      finishDecrypt = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-switch-race";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    const decryptSpy = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockReturnValue(decryptGate);

    const switching = keyRing.changeKeyStoreFromMultiKeyStore(1);
    await Promise.resolve();
    expect(decryptSpy).toHaveBeenCalledWith(w2, "pw");

    keyRing.lock();
    finishDecrypt({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });

    await expect(switching).rejects.toThrow(
      "Key ring session changed while operation was running"
    );
    expect((keyRing as any).keyStore).toBe(w1);
    expect((keyRing as any)._mnemonicMasterSeed).toBeUndefined();
    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(0);
  });

  it("does not roll back a switch across a completed password change", async () => {
    const kvStore = new MemoryKVStore("keyring-switch-password-race");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    let releaseSelectedChain!: () => void;
    let markSelectedChainStarted!: () => void;
    const selectedChainGate = new Promise<void>((resolve) => {
      releaseSelectedChain = resolve;
    });
    const selectedChainStarted = new Promise<void>((resolve) => {
      markSelectedChainStarted = resolve;
    });
    const chainsService = {
      getSelectedChain: jest.fn(async () => {
        markSelectedChainStarted();
        await selectedChainGate;
        return "cosmoshub-4";
      }),
    };
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      chainsService
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "old-pw";
    (keyRing as any).unlockSessionId = "session-before-password-change";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w2: { address: "aa".repeat(20), pubKey: "11" },
    });
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
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

    const switching = keyRing.changeKeyStoreFromMultiKeyStore(1);
    await selectedChainStarted;
    await keyRing.updatePassword("old-pw", "new-pw");
    const reEncryptedSelected = (keyRing as any).keyStore;
    expect(reEncryptedSelected).not.toBe(w2);
    expect(reEncryptedSelected.meta.__id__).toBe("w2");

    releaseSelectedChain();
    await expect(switching).rejects.toThrow(
      "Key ring session changed while operation was running"
    );

    expect((keyRing as any).keyStore).toBe(reEncryptedSelected);
    expect((keyRing as any).keyStore).not.toBe(w1);
    expect((keyRing as any).password).toBe("new-pw");
    keyRing.lock();
  });

  it("does not publish a cache-miss switch after the session changes", async () => {
    const kvStore = new MemoryKVStore("keyring-switch-cache-miss-race");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    const keyRing = makeKeyRing(kvStore);
    let finishTargetDecrypt!: (material: {
      type: "mnemonic";
      mnemonicMasterSeed: Uint8Array;
    }) => void;
    const targetDecryptGate = new Promise<{
      type: "mnemonic";
      mnemonicMasterSeed: Uint8Array;
    }>((resolve) => {
      finishTargetDecrypt = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "old-pw";
    (keyRing as any).unlockSessionId = "session-cache-miss";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 1, 1]);
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1, 1, 1]),
    });
    const targetDecryptSpy = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockReturnValue(targetDecryptGate);
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
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    const switching = keyRing.changeKeyStoreFromMultiKeyStore(1);
    await Promise.resolve();
    expect(targetDecryptSpy).toHaveBeenCalledWith(w2, "old-pw");

    await keyRing.updatePassword("old-pw", "new-pw");
    const reEncryptedSelected = (keyRing as any).keyStore;
    expect(reEncryptedSelected.meta.__id__).toBe("w1");

    finishTargetDecrypt({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2, 2, 2]),
    });
    await expect(switching).rejects.toThrow(
      "Key ring session changed while operation was running"
    );

    expect((keyRing as any).keyStore).toBe(reEncryptedSelected);
    expect((keyRing as any)._mnemonicMasterSeed).toEqual(
      new Uint8Array([1, 1, 1])
    );
    expect((keyRing as any).sessionKeyStoreMaterial.has("w2")).toBe(false);
    expect((keyRing as any).password).toBe("new-pw");
    keyRing.lock();
  });

  it("keeps the target wallet and material consistent when switch persistence fails", async () => {
    const kvStore = new MemoryKVStore("keyring-switch-save-rollback");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    const keyRing = makeKeyRing(kvStore);

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1, w2];
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-switch-save";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });
    jest.spyOn(keyRing, "save").mockRejectedValue(new Error("save failed"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(keyRing.changeKeyStoreFromMultiKeyStore(1)).rejects.toThrow(
      "save failed"
    );

    expect((keyRing as any).keyStore).toBe(w2);
    expect((keyRing as any)._mnemonicMasterSeed).toEqual(new Uint8Array([2]));
    keyRing.lock();
  });

  it("changeKeyStoreFromMultiKeyStore uses reloadActiveKeyStoreForSwitch not unlock", async () => {
    const kvStore = new MemoryKVStore("keyring-switch-reload-path");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-switch";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1, 2, 3]);
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });

    const reloadSpy = jest.spyOn(
      keyRing as any,
      "reloadActiveKeyStoreForSwitch"
    );
    const unlockSpy = jest
      .spyOn(keyRing, "unlock")
      .mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined as any);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      w2: { address: "aa".repeat(20), pubKey: "11" },
    });

    await keyRing.changeKeyStoreFromMultiKeyStore(1);

    expect(reloadSpy).toHaveBeenCalledWith(w2, {
      password: "pw",
      unlockSessionId: "session-switch",
    });
    expect(unlockSpy).not.toHaveBeenCalled();
  });

  it("clears session material on lock", async () => {
    const kvStore = new MemoryKVStore("keyring-session-cache-lock");
    const keyRing = makeKeyRing(kvStore);
    const keyStore = createKeyStore({
      __id__: "w1",
      name: "Wallet 1",
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [keyStore];
    selectKeyStore(keyRing, keyStore);
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

    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, w1);

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
    try {
      await keyRing.changeKeyStoreFromMultiKeyStore(1);
      await keyRing.changeKeyStoreFromMultiKeyStore(0);

      expect(decryptSpy).toHaveBeenCalledTimes(2);
    } finally {
      if (!keyRing.isLocked()) {
        keyRing.lock();
      }
    }
  });

  it("clears session material on password change", async () => {
    const kvStore = new MemoryKVStore("keyring-session-cache-password");
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const keyRing = makeKeyRing(kvStore);

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [w1];
    selectKeyStore(keyRing, w1);
    (keyRing as any).password = "old";
    (keyRing as any).unlockSessionId = "session-old-password";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
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
    const clearAddressCachesSpy = jest
      .spyOn(keyRing.addressCacheManager, "clearAllCaches")
      .mockResolvedValue(undefined);
    const setCachePasswordSpy = jest.spyOn(
      keyRing.addressCacheManager,
      "setPassword"
    );

    await keyRing.updatePassword("old", "new");

    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(0);
    expect(clearAddressCachesSpy).toHaveBeenCalledTimes(1);
    expect(setCachePasswordSpy).toHaveBeenCalledWith("new");
    expect((keyRing as any).unlockSessionId).not.toBe("session-old-password");
  });

  it("stops password update after lock following the first re-encryption", async () => {
    const kvStore = new MemoryKVStore("keyring-password-lock-after-encrypt");
    const keyRing = makeKeyRing(kvStore);
    const wallets = [
      createKeyStore({ __id__: "w1", name: "Wallet 1" }),
      createKeyStore({ __id__: "w2", name: "Wallet 2" }),
      createKeyStore({ __id__: "w3", name: "Wallet 3" }),
    ];
    const decryptedBuffer = Buffer.from("first-secret");
    let finishFirstEncryption!: (keyStore: any) => void;
    let markFirstEncryptionStarted!: () => void;
    const firstEncryptionGate = new Promise<any>((resolve) => {
      finishFirstEncryption = resolve;
    });
    const firstEncryptionStarted = new Promise<void>((resolve) => {
      markFirstEncryptionStarted = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = wallets;
    selectKeyStore(keyRing, wallets[0]);
    (keyRing as any).password = "old";
    (keyRing as any).unlockSessionId = "session-password-lock";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockImplementation(async (_crypto, keyStore) => {
        expect(keyStore).toBe(wallets[0]);
        return decryptedBuffer;
      });
    const encryptSpy = jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(async () => {
        markFirstEncryptionStarted();
        return await firstEncryptionGate;
      });
    const clearCachesSpy = jest.spyOn(
      keyRing.addressCacheManager,
      "clearAllCaches"
    );
    const persistSpy = jest.spyOn(keyRing as any, "persistKeyRingState");
    const dispatchSpy = (keyRing as any).interactionService
      .dispatchEvent as jest.Mock;
    dispatchSpy.mockClear();

    const passwordUpdate = keyRing.updatePassword("old", "new");
    await firstEncryptionStarted;
    finishFirstEncryption({
      ...wallets[0],
      meta: { ...wallets[0].meta },
    });
    keyRing.lock();

    await expect(passwordUpdate).rejects.toThrow(
      "Key ring session changed while password was updating"
    );
    expect(decryptSpy).toHaveBeenCalledTimes(1);
    expect(encryptSpy).toHaveBeenCalledTimes(1);
    expect([...decryptedBuffer]).toEqual(Array(decryptedBuffer.length).fill(0));
    expect(clearCachesSpy).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect((keyRing as any).multiKeyStore).toEqual(wallets);
    expect((keyRing as any).password).toBe("");
    expect(keyRing.isLocked()).toBe(true);
  });

  it("stops password update after lock during the first decrypt", async () => {
    const kvStore = new MemoryKVStore("keyring-password-lock-during-decrypt");
    const keyRing = makeKeyRing(kvStore);
    const wallets = [
      createKeyStore({ __id__: "w1", name: "Wallet 1" }),
      createKeyStore({ __id__: "w2", name: "Wallet 2" }),
      createKeyStore({ __id__: "w3", name: "Wallet 3" }),
    ];
    const decryptedBuffer = Buffer.from("first-secret");
    let finishFirstDecrypt!: (value: Uint8Array) => void;
    const firstDecryptGate = new Promise<Uint8Array>((resolve) => {
      finishFirstDecrypt = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = wallets;
    selectKeyStore(keyRing, wallets[0]);
    (keyRing as any).password = "old";
    (keyRing as any).unlockSessionId = "session-password-decrypt-lock";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockReturnValue(firstDecryptGate);
    const encryptSpy = jest.spyOn(Crypto, "encrypt");
    const clearCachesSpy = jest.spyOn(
      keyRing.addressCacheManager,
      "clearAllCaches"
    );
    const persistSpy = jest.spyOn(keyRing as any, "persistKeyRingState");
    const dispatchSpy = (keyRing as any).interactionService
      .dispatchEvent as jest.Mock;
    dispatchSpy.mockClear();

    const passwordUpdate = keyRing.updatePassword("old", "new");
    expect(decryptSpy).toHaveBeenCalledTimes(1);
    keyRing.lock();
    finishFirstDecrypt(decryptedBuffer);

    await expect(passwordUpdate).rejects.toThrow(
      "Key ring session changed while password was updating"
    );
    expect(decryptSpy).toHaveBeenCalledTimes(1);
    expect(encryptSpy).not.toHaveBeenCalled();
    expect([...decryptedBuffer]).toEqual(Array(decryptedBuffer.length).fill(0));
    expect(clearCachesSpy).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect((keyRing as any).password).toBe("");
    expect(keyRing.isLocked()).toBe(true);
  });

  it("keeps normal password re-encryption sequential and activates after persist", async () => {
    const kvStore = new MemoryKVStore("keyring-password-sequential-success");
    const keyRing = makeKeyRing(kvStore);
    const wallets = [
      createKeyStore({ __id__: "w1", name: "Wallet 1" }),
      createKeyStore({ __id__: "w2", name: "Wallet 2" }),
      createKeyStore({ __id__: "w3", name: "Wallet 3" }),
    ];
    const sequence: string[] = [];

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = wallets;
    selectKeyStore(keyRing, wallets[0]);
    (keyRing as any).password = "old";
    (keyRing as any).unlockSessionId = "session-password-success";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    jest
      .spyOn(Crypto, "decrypt")
      .mockImplementation(async (_crypto, keyStore) => {
        sequence.push(`decrypt:${keyStore.meta["__id__"]}`);
        return Buffer.from(`secret:${keyStore.meta["__id__"]}`);
      });
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
        ) => {
          sequence.push(`encrypt:${meta["__id__"]}`);
          return {
            version: "1.2" as const,
            type,
            curve,
            meta,
            bip44HDPath,
            crypto: { kdf: "scrypt" },
          };
        }
      );
    const clearCachesSpy = jest
      .spyOn(keyRing.addressCacheManager, "clearAllCaches")
      .mockResolvedValue(undefined);
    const persistSpy = jest
      .spyOn(keyRing as any, "persistKeyRingState")
      .mockResolvedValue(undefined);
    const activateSpy = jest.spyOn(keyRing as any, "activateUnlockSession");

    await keyRing.updatePassword("old", "new");

    expect(sequence).toEqual([
      "decrypt:w1",
      "encrypt:w1",
      "decrypt:w2",
      "encrypt:w2",
      "decrypt:w3",
      "encrypt:w3",
    ]);
    expect(clearCachesSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(activateSpy).toHaveBeenCalledTimes(1);
    expect(activateSpy).toHaveBeenCalledWith("new");
    expect(persistSpy.mock.invocationCallOrder[0]).toBeLessThan(
      activateSpy.mock.invocationCallOrder[0]
    );
    expect((keyRing as any).password).toBe("new");
    expect((keyRing as any).unlockSessionId).not.toBe("");
    keyRing.lock();
  });

  it("restores one old session after an internal password-update failure", async () => {
    const kvStore = new MemoryKVStore("keyring-password-internal-failure");
    const keyRing = makeKeyRing(kvStore);
    const wallet = createKeyStore({ __id__: "w1", name: "Wallet 1" });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    (keyRing as any).password = "old";
    (keyRing as any).unlockSessionId = "session-password-failure";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("secret"));
    jest
      .spyOn(Crypto, "encrypt")
      .mockRejectedValue(new Error("encryption failed"));
    const activateSpy = jest.spyOn(keyRing as any, "activateUnlockSession");
    const warmupSpy = jest.spyOn(keyRing as any, "scheduleUnlockCacheWarmup");
    const maintenanceSpy = jest.spyOn(
      keyRing as any,
      "scheduleUnlockMaintenance"
    );

    await expect(keyRing.updatePassword("old", "new")).rejects.toThrow(
      "encryption failed"
    );

    expect(activateSpy).toHaveBeenCalledTimes(1);
    expect(activateSpy).toHaveBeenCalledWith("old");
    expect(warmupSpy).toHaveBeenCalledTimes(1);
    expect(maintenanceSpy).toHaveBeenCalledTimes(1);
    expect((keyRing as any).password).toBe("old");
    expect((keyRing as any).unlockSessionId).not.toBe("");
    keyRing.lock();
  });

  it("fails password update if the selected keystore disappears", async () => {
    const kvStore = new MemoryKVStore("keyring-password-selected-missing");
    const legacy = {
      ...createKeyStore({ __id__: "legacy", name: "Legacy wallet" }),
      type: undefined,
    } as any;
    const keyRing = makeKeyRing(kvStore);

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [legacy];
    selectKeyStore(keyRing, legacy);
    (keyRing as any).password = "old";
    (keyRing as any).unlockSessionId = "session-legacy-password";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    const saveSpy = jest.spyOn(keyRing, "save");

    await expect(keyRing.updatePassword("old", "new")).rejects.toThrow(
      "Selected key store disappeared while updating password"
    );

    expect((keyRing as any).keyStore).toBe(legacy);
    expect((keyRing as any).multiKeyStore).toEqual([legacy]);
    expect((keyRing as any).password).toBe("old");
    expect(keyRing.getCurrentUnlockSessionId()).not.toBe("");
    expect(saveSpy).not.toHaveBeenCalled();
    keyRing.lock();
  });

  it("does not add a wallet after the unlock session expires", async () => {
    const kvStore = new MemoryKVStore("keyring-add-after-lock");
    const current = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const added = createKeyStore({ __id__: "w2", name: "Wallet 2" });
    const keyRing = makeKeyRing(kvStore);
    let finishEncryption!: (keyStore: typeof added) => void;
    const encryptionGate = new Promise<typeof added>((resolve) => {
      finishEncryption = resolve;
    });

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [current];
    selectKeyStore(keyRing, current);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-add-race";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    jest
      .spyOn(KeyRing as any, "CreateMnemonicKeyStore")
      .mockReturnValue(encryptionGate);
    const saveSpy = jest.spyOn(keyRing, "save");

    const addition = keyRing.addMnemonicKey(
      "scrypt",
      Array(11).fill("abandon").concat("about").join(" "),
      { name: "Wallet 2" },
      { account: 0, change: 0, addressIndex: 0 }
    );
    await Promise.resolve();
    keyRing.lock();
    finishEncryption(added);

    await expect(addition).rejects.toThrow(
      "Key ring session changed while operation was running"
    );
    expect((keyRing as any).multiKeyStore).toEqual([current]);
    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(0);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("does not reuse pre-password session material after password change and switch", async () => {
    const kvStore = new MemoryKVStore("keyring-session-cache-after-password");
    const chainId = "evmos_9001-2";
    const w1 = createKeyStore({ __id__: "w1", name: "Wallet 1" });
    const w2 = createKeyStore({ __id__: "w2", name: "Wallet 2" });

    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, w1);

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
    try {
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
    } finally {
      if (!keyRing.isLocked()) {
        keyRing.lock();
      }
    }
  });
});

describe("initializeNonDefaultLedgerApp session material", () => {
  it("keeps a newly initialized Ethereum public key available to getKeys", async () => {
    const kvStore = new MemoryKVStore("keyring-ledger-evm-session-material");
    const chainId = "evmos_9001-2";
    const cosmosPubKey = new PrivKeySecp256k1(
      Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 1 : 0))
    )
      .getPubKey()
      .toBytes();
    const ethereumPubKey = new PrivKeySecp256k1(
      Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 2 : 0))
    )
      .getPubKey()
      .toBytes();
    const initialKeyStore = {
      version: "1.2" as const,
      type: "ledger" as const,
      curve: KeyCurves.secp256k1,
      meta: { __id__: "ledger-1", name: "Ledger" },
      bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
      crypto: { kdf: "scrypt" },
    };
    const updatedKeyStore = {
      ...initialKeyStore,
      crypto: { kdf: "scrypt", ciphertext: "updated" },
    };
    const ledgerKeeper = {
      getPublicKey: jest.fn().mockResolvedValue(ethereumPubKey),
    };
    const keyRing = createTrackedKeyRing(
      [{ chainId, features: ["evm"] } as any],
      kvStore,
      ledgerKeeper as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [initialKeyStore];
    selectKeyStore(keyRing, initialKeyStore);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-ledger-app";
    (keyRing as any)._ledgerPublicKeyCache = {
      [LedgerApp.Cosmos]: cosmosPubKey,
    };
    (keyRing as any).sessionKeyStoreMaterial.set("ledger-1", {
      type: "ledger",
      ledgerPublicKeyCache: { [LedgerApp.Cosmos]: cosmosPubKey },
    });

    jest
      .spyOn(KeyRing as any, "CreateLedgerKeyStore")
      .mockResolvedValue(updatedKeyStore);
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({});
    jest.spyOn(keyRing, "saveGenericChainCache").mockResolvedValue(undefined);
    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockRejectedValue(new Error("updated Ledger material must be reused"));
    decryptSpy.mockClear();

    await keyRing.initializeNonDefaultLedgerApp({} as any, LedgerApp.Ethereum);
    const keys = await keyRing.getKeys(chainId, true);

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      name: "Ledger",
      algo: "ethsecp256k1",
      isNanoLedger: true,
    });
    expect(Buffer.from(keys[0].pubKey)).toEqual(Buffer.from(ethereumPubKey));
    expect(decryptSpy).not.toHaveBeenCalled();
    expect(
      (keyRing as any).sessionKeyStoreMaterial.get("ledger-1")
        .ledgerPublicKeyCache[LedgerApp.Ethereum]
    ).toEqual(ethereumPubKey);
    expect((KeyRing as any).CreateLedgerKeyStore).toHaveBeenCalledWith(
      expect.anything(),
      "scrypt",
      expect.objectContaining({ [LedgerApp.Ethereum]: ethereumPubKey }),
      "pw",
      initialKeyStore.meta,
      initialKeyStore.bip44HDPath
    );
  });

  it("does not publish a Ledger app initialized after auto-lock", async () => {
    const kvStore = new MemoryKVStore("keyring-ledger-app-auto-lock");
    const cosmosPubKey = new PrivKeySecp256k1(
      Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 1 : 0))
    )
      .getPubKey()
      .toBytes();
    const ethereumPubKey = new PrivKeySecp256k1(
      Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 2 : 0))
    )
      .getPubKey()
      .toBytes();
    const initialKeyStore = {
      version: "1.2" as const,
      type: "ledger" as const,
      curve: KeyCurves.secp256k1,
      meta: { __id__: "ledger-1", name: "Ledger" },
      bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
      crypto: { kdf: "scrypt" },
    };
    let finishPublicKey!: (value: Uint8Array) => void;
    const publicKeyGate = new Promise<Uint8Array>((resolve) => {
      finishPublicKey = resolve;
    });
    const ledgerKeeper = {
      getPublicKey: jest.fn().mockReturnValue(publicKeyGate),
    };
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      ledgerKeeper as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [initialKeyStore];
    selectKeyStore(keyRing, initialKeyStore);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-ledger-auto-lock";
    (keyRing as any)._ledgerPublicKeyCache = {
      [LedgerApp.Cosmos]: cosmosPubKey,
    };
    (keyRing as any).sessionKeyStoreMaterial.set("ledger-1", {
      type: "ledger",
      ledgerPublicKeyCache: { [LedgerApp.Cosmos]: cosmosPubKey },
    });
    const createSpy = jest.spyOn(KeyRing as any, "CreateLedgerKeyStore");
    const saveSpy = jest.spyOn(keyRing, "save").mockResolvedValue(undefined);

    const initialization = keyRing.initializeNonDefaultLedgerApp(
      {} as any,
      LedgerApp.Ethereum
    );
    expect(ledgerKeeper.getPublicKey).toHaveBeenCalledTimes(1);
    const rejection = expect(initialization).rejects.toThrow(
      "Key ring session changed while operation was running"
    );

    keyRing.lock();
    finishPublicKey(ethereumPubKey);
    await rejection;

    expect(createSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect((keyRing as any).keyStore).toBe(initialKeyStore);
    expect((keyRing as any).multiKeyStore).toEqual([initialKeyStore]);
    expect((keyRing as any).sessionKeyStoreMaterial.size).toBe(0);
    expect(keyRing.isLocked()).toBe(true);
  });

  it("reports how to initialize Ledger when an Ethereum public key is missing", async () => {
    const kvStore = new MemoryKVStore("keyring-ledger-evm-key-missing");
    const chainId = "evmos_9001-2";
    const cosmosPubKey = new PrivKeySecp256k1(
      Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 1 : 0))
    )
      .getPubKey()
      .toBytes();
    const keyStore = {
      version: "1.2" as const,
      type: "ledger" as const,
      curve: KeyCurves.secp256k1,
      meta: { __id__: "ledger-1", name: "Ledger" },
      bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
      crypto: { kdf: "scrypt" },
    };
    const keyRing = createTrackedKeyRing(
      [{ chainId, features: ["evm"] } as any],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [keyStore];
    selectKeyStore(keyRing, keyStore);
    (keyRing as any).password = "pw";
    (keyRing as any)._ledgerPublicKeyCache = {
      [LedgerApp.Cosmos]: cosmosPubKey,
    };
    (keyRing as any).sessionKeyStoreMaterial.set("ledger-1", {
      type: "ledger",
      ledgerPublicKeyCache: { [LedgerApp.Cosmos]: cosmosPubKey },
    });
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({});
    jest.spyOn(keyRing, "saveGenericChainCache").mockResolvedValue(undefined);

    await expect(keyRing.getKeys(chainId, true)).rejects.toThrow(
      "No ethereum public key. Initialize ethereum app on Ledger by selecting the chain in the extension"
    );
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

    const keyRing = createTrackedKeyRing(
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
    selectKeyStore(keyRing, keyStore);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-getkeys-cardano-cold";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    (keyRing as any).cardanoKeyCache = new Map();
    jest
      .spyOn(keyRing as any, "loadCardanoChainCache")
      .mockRejectedValue(new Error("Lock timeout waiting for cardano cache"));
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const saveCache = jest
      .spyOn(keyRing as any, "saveCardanoChainCache")
      .mockReturnValue(saveGate);

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
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        keyRing.getKeysForCardano(chainId),
        new Promise<"blocked">((resolve) => {
          timeout = setTimeout(() => resolve("blocked"), 100);
        }),
      ]);

      expect(outcome).not.toBe("blocked");
      const keys = outcome as Awaited<ReturnType<KeyRing["getKeysForCardano"]>>;

      expect(deriveSpy).toHaveBeenCalledTimes(1);
      expect(deriveSpy).toHaveBeenCalledWith(
        keyStore,
        "pw",
        expect.anything(),
        chainId,
        { scryptPriority: "interactive" }
      );
      expect(restoreSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load Cardano cache"),
        expect.any(Error)
      );

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
        }),
        { scryptPriority: "interactive" }
      );
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      releaseSave();
      await saveGate;
      deriveSpy.mockRestore();
      restoreSpy.mockRestore();
      createSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe("getKeysForCardano concurrency guards", () => {
  const chainId = "cardano-preprod";
  const createKeyStore = (id: string, name: string) => ({
    version: "1.2" as const,
    type: "mnemonic" as const,
    curve: KeyCurves.secp256k1,
    meta: {
      __id__: id,
      name,
      cardano: "true",
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
  });

  const makeSubject = () => {
    const first = createKeyStore("w1", "Wallet 1");
    const second = createKeyStore("w2", "Wallet 2");
    const keyRing = createTrackedKeyRing(
      [{ chainId, features: ["cardano"] } as ChainInfo],
      new MemoryKVStore("keyring-cardano-bulk-concurrency"),
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [first, second];
    selectKeyStore(keyRing, first);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-cardano-bulk";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    return { keyRing, first, second };
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

  const derivedKey = (walletId: string) => ({
    algo: "cardano_address_only",
    pubKey: Uint8Array.from([walletId === "w1" ? 1 : 2]),
    address: Buffer.from(`addr_test1_${walletId}`, "utf8"),
    isKeystone: false,
    isNanoLedger: false,
  });

  const mockDeletionDependencies = (keyRing: KeyRing) => {
    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("payload"));
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    jest
      .spyOn(keyRing.addressCacheManager, "removeWalletFromAllCaches")
      .mockImplementation(async (walletId) => {
        (keyRing.addressCacheManager as any).deletedWalletIds.add(walletId);
      });
  };

  it("blocks a deleted wallet's late bulk derivation without evicting retained entries", async () => {
    const { keyRing, second } = makeSubject();
    const retainedKeyId = `cardano:${chainId}:w1`;
    const deletedKeyId = `cardano:${chainId}:w2`;
    const retainedEntry = {
      address: Buffer.from("addr_test1_retained_bulk", "utf8"),
      pubKey: Uint8Array.from([1]),
    };
    (keyRing as any).cardanoKeyCache.set(retainedKeyId, retainedEntry);
    jest.spyOn(keyRing, "loadCardanoChainCache").mockResolvedValue({});
    const saveCache = jest
      .spyOn(keyRing, "saveCardanoChainCache")
      .mockResolvedValue(undefined);
    const pendingDerivation = deferred<any>();
    const derivationStarted = deferred<void>();
    const { CardanoService } = await import("../cardano/service");
    jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockImplementation(async (keyStore: any) => {
        expect(keyStore).toBe(second);
        derivationStarted.resolve();
        return await pendingDerivation.promise;
      });

    const bulkKeys = keyRing.getKeysForCardano(chainId);
    await derivationStarted.promise;
    mockDeletionDependencies(keyRing);
    await keyRing.deleteKeyRing(1, "pw");

    expect((keyRing as any).cardanoKeyCache.get(retainedKeyId)).toEqual(
      retainedEntry
    );
    expect((keyRing as any).cardanoKeyCache.has(deletedKeyId)).toBe(false);

    pendingDerivation.resolve(derivedKey("w2"));
    await bulkKeys;

    expect((keyRing as any).cardanoKeyCache.has(deletedKeyId)).toBe(false);
    expect((keyRing as any).cardanoKeyCache.get(retainedKeyId)).toEqual(
      retainedEntry
    );
    expect(saveCache).not.toHaveBeenCalled();
    expect(
      (keyRing.addressCacheManager as any).filterDeletedWallets({
        w1: { address: "addr-retained" },
        w2: { address: "addr-deleted" },
      })
    ).toEqual({ w1: { address: "addr-retained" } });
  });

  it("blocks a persisted-cache memory write reached after the wallet is deleted", async () => {
    const { keyRing, first } = makeSubject();
    jest.spyOn(keyRing, "loadCardanoChainCache").mockResolvedValue({
      w2: { address: "addr_test1_persisted_deleted", pubKey: "02" },
    });
    const saveCache = jest
      .spyOn(keyRing, "saveCardanoChainCache")
      .mockResolvedValue(undefined);
    const pendingDerivation = deferred<any>();
    const derivationStarted = deferred<void>();
    const { CardanoService } = await import("../cardano/service");
    jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockImplementation(async (keyStore: any) => {
        expect(keyStore).toBe(first);
        derivationStarted.resolve();
        return await pendingDerivation.promise;
      });

    const bulkKeys = keyRing.getKeysForCardano(chainId);
    await derivationStarted.promise;
    mockDeletionDependencies(keyRing);
    await keyRing.deleteKeyRing(1, "pw");
    pendingDerivation.resolve(derivedKey("w1"));
    await bulkKeys;

    expect((keyRing as any).cardanoKeyCache.has(`cardano:${chainId}:w1`)).toBe(
      false
    );
    expect((keyRing as any).cardanoKeyCache.has(`cardano:${chainId}:w2`)).toBe(
      false
    );
    expect(saveCache).not.toHaveBeenCalled();
  });

  it("keeps retained entries and caches current derivations with a detached save", async () => {
    const { keyRing, second } = makeSubject();
    const retainedKeyId = `cardano:${chainId}:w1`;
    const derivedKeyId = `cardano:${chainId}:w2`;
    const retainedEntry = {
      address: Buffer.from("addr_test1_retained_current", "utf8"),
      pubKey: Uint8Array.from([1]),
    };
    const currentKey = derivedKey("w2");
    (keyRing as any).cardanoKeyCache.set(retainedKeyId, retainedEntry);
    jest.spyOn(keyRing, "loadCardanoChainCache").mockResolvedValue({});
    const pendingSave = deferred<void>();
    const saveCache = jest
      .spyOn(keyRing, "saveCardanoChainCache")
      .mockReturnValue(pendingSave.promise);
    const { CardanoService } = await import("../cardano/service");
    jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockImplementation(async (keyStore: any) => {
        expect(keyStore).toBe(second);
        return currentKey as any;
      });

    try {
      await expect(keyRing.getKeysForCardano(chainId)).resolves.toHaveLength(2);
      expect((keyRing as any).cardanoKeyCache.get(retainedKeyId)).toEqual(
        retainedEntry
      );
      expect((keyRing as any).cardanoKeyCache.get(derivedKeyId)).toEqual({
        address: currentKey.address,
        pubKey: currentKey.pubKey,
      });
      expect(saveCache).toHaveBeenCalledWith(
        chainId,
        {
          w2: {
            address: "addr_test1_w2",
            pubKey: "02",
          },
        },
        { scryptPriority: "interactive" }
      );
    } finally {
      pendingSave.resolve();
      await pendingSave.promise;
    }
  });

  it("returns a failed marker at deadline and reuses the timed-out wallet flight until actual settle", async () => {
    jest.useFakeTimers();
    const { keyRing } = makeSubject();
    const retainedKeyId = `cardano:${chainId}:w1`;
    const pendingKeyId = `cardano:${chainId}:w2`;
    const retainedEntry = {
      address: Buffer.from("addr_test1_cached_bulk_deadline", "utf8"),
      pubKey: Uint8Array.from([1]),
    };
    (keyRing as any).cardanoKeyCache.set(retainedKeyId, retainedEntry);
    jest.spyOn(keyRing, "loadCardanoChainCache").mockResolvedValue({});
    jest.spyOn(keyRing, "saveCardanoChainCache").mockResolvedValue(undefined);
    const completion = deferred<any>();
    const bounded = createTrackedDeadlinePromise(completion.promise, 1_000);
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockReturnValue(bounded as any);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const firstBulk = keyRing.getKeysForCardano(chainId);
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
      expect(deriveSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1_000);
      const firstKeys = await firstBulk;
      expect(firstKeys).toHaveLength(2);
      expect(firstKeys[0]).toMatchObject({
        algo: "cardano_address_only",
        address: retainedEntry.address,
      });
      expect(firstKeys[1]).toMatchObject({
        algo: "cardano_derivation_failed",
        address: new Uint8Array(0),
        pubKey: new Uint8Array(0),
      });
      expect((keyRing as any).cardanoKeyFlights.has(pendingKeyId)).toBe(true);

      const secondKeys = await keyRing.getKeysForCardano(chainId);
      expect(secondKeys[1]).toMatchObject({
        algo: "cardano_derivation_failed",
      });
      expect(deriveSpy).toHaveBeenCalledTimes(1);

      completion.resolve(derivedKey("w2"));
      await completion.promise;
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      expect((keyRing as any).cardanoKeyFlights.has(pendingKeyId)).toBe(false);
      expect((keyRing as any).cardanoKeyCache.get(pendingKeyId)).toEqual({
        address: derivedKey("w2").address,
        pubKey: derivedKey("w2").pubKey,
      });
      expect(deriveSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it.each(["lock", "new unlock session", "password change"])(
    "blocks late bulk writes after %s",
    async (invalidation) => {
      const { keyRing, second } = makeSubject();
      const retainedKeyId = `cardano:${chainId}:w1`;
      const derivedKeyId = `cardano:${chainId}:w2`;
      (keyRing as any).cardanoKeyCache.set(retainedKeyId, {
        address: Buffer.from("addr_test1_pre_invalidation", "utf8"),
        pubKey: Uint8Array.from([1]),
      });
      jest.spyOn(keyRing, "loadCardanoChainCache").mockResolvedValue({});
      const saveCache = jest
        .spyOn(keyRing, "saveCardanoChainCache")
        .mockResolvedValue(undefined);
      const pendingDerivation = deferred<any>();
      const derivationStarted = deferred<void>();
      const { CardanoService } = await import("../cardano/service");
      jest
        .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
        .mockImplementation(async (keyStore: any) => {
          expect(keyStore).toBe(second);
          derivationStarted.resolve();
          return await pendingDerivation.promise;
        });

      const bulkKeys = keyRing.getKeysForCardano(chainId);
      await derivationStarted.promise;
      if (invalidation === "lock") {
        keyRing.lock();
      } else if (invalidation === "new unlock session") {
        (keyRing as any).activateUnlockSession("pw");
      } else {
        (keyRing as any).activateUnlockSession("new-pw");
      }
      pendingDerivation.resolve(derivedKey("w2"));
      await bulkKeys;

      expect((keyRing as any).cardanoKeyCache.has(retainedKeyId)).toBe(false);
      expect((keyRing as any).cardanoKeyCache.has(derivedKeyId)).toBe(false);
      expect(saveCache).not.toHaveBeenCalled();
    }
  );
});

describe("Cardano memory cache lifecycle", () => {
  const chainId = "cardano-preprod";
  const secondChainId = "cardano-preview";
  const createKeyStore = (id: string, name: string) => ({
    version: "1.2" as const,
    type: "mnemonic" as const,
    curve: KeyCurves.secp256k1,
    meta: {
      __id__: id,
      name,
      cardano: "true",
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
  });

  const makeSubject = (chainIds = [chainId]) => {
    const first = createKeyStore("w1", "Wallet 1");
    const second = createKeyStore("w2", "Wallet 2");
    const keyRing = createTrackedKeyRing(
      chainIds.map(
        (cardanoChainId) =>
          ({ chainId: cardanoChainId, features: ["cardano"] } as ChainInfo)
      ),
      new MemoryKVStore("keyring-cardano-memory-lifecycle"),
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      { getSelectedChain: jest.fn().mockResolvedValue(chainId) } as any
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [first, second];
    selectKeyStore(keyRing, first);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-cardano-memory";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    (keyRing as any).sessionKeyStoreMaterial.set("w1", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([1]),
    });
    (keyRing as any).sessionKeyStoreMaterial.set("w2", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });

    return { keyRing, first, second };
  };

  const flushDetachedCacheUpdate = () =>
    new Promise<void>((resolve) => setImmediate(resolve));

  it("preserves entries across wallet switches and reuses both memory hits", async () => {
    const { keyRing, first, second } = makeSubject();
    const firstAddress = Buffer.from("addr_test1_cached_first", "utf8");
    const secondAddress = Buffer.from("addr_test1_cached_second", "utf8");
    const firstKeyId = `${chainId}:w1`;
    const secondKeyId = `${chainId}:w2`;

    (keyRing as any).cardanoKeyCache.set(`cardano:${firstKeyId}`, {
      address: firstAddress,
      pubKey: Uint8Array.from([1]),
    });
    (keyRing as any).cardanoKeyCache.set(`cardano:${secondKeyId}`, {
      address: secondAddress,
      pubKey: Uint8Array.from([2]),
    });

    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    jest.spyOn(keyRing, "loadCardanoChainCache").mockResolvedValue({
      w1: { address: firstAddress.toString("utf8"), pubKey: "01" },
      w2: { address: secondAddress.toString("utf8"), pubKey: "02" },
    });
    jest
      .spyOn(keyRing.addressCacheManager, "checkConsistency")
      .mockResolvedValue({ isConsistent: true, issues: [] });
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest.spyOn(
      CardanoService.prototype,
      "deriveKeyFromKeyStore"
    );

    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    await flushDetachedCacheUpdate();
    await keyRing.changeKeyStoreFromMultiKeyStore(0);
    await flushDetachedCacheUpdate();

    expect(
      (keyRing as any).cardanoKeyCache.get(`cardano:${firstKeyId}`)
    ).toEqual({
      address: firstAddress,
      pubKey: Uint8Array.from([1]),
    });
    expect(
      (keyRing as any).cardanoKeyCache.get(`cardano:${secondKeyId}`)
    ).toEqual({
      address: secondAddress,
      pubKey: Uint8Array.from([2]),
    });

    await expect(
      keyRing.getCardanoKeyForKeyStore(chainId, first as any)
    ).resolves.toMatchObject({ address: firstAddress });
    await expect(
      keyRing.getCardanoKeyForKeyStore(chainId, second as any)
    ).resolves.toMatchObject({ address: secondAddress });
    expect(deriveSpy).not.toHaveBeenCalled();
  });

  it("removes only the deleted wallet and blocks its late derivation", async () => {
    const { keyRing, second } = makeSubject([chainId, secondChainId]);
    const retainedKeyId = `cardano:${chainId}:w1`;
    const deletedKeyId = `cardano:${chainId}:w2`;
    const lateKeyId = `cardano:${secondChainId}:w2`;
    const retainedEntry = {
      address: Buffer.from("addr_test1_retained", "utf8"),
      pubKey: Uint8Array.from([1]),
    };
    (keyRing as any).cardanoKeyCache.set(retainedKeyId, retainedEntry);
    (keyRing as any).cardanoKeyCache.set(deletedKeyId, {
      address: Buffer.from("addr_test1_deleted", "utf8"),
      pubKey: Uint8Array.from([2]),
    });

    let finishDerivation!: (value: any) => void;
    const derivationGate = new Promise<any>((resolve) => {
      finishDerivation = resolve;
    });
    const { CardanoService } = await import("../cardano/service");
    jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockReturnValue(derivationGate);
    const lateDerivation = keyRing.getCardanoKeyForKeyStore(
      secondChainId,
      second as any
    );
    await flushDetachedCacheUpdate();

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("payload"));
    jest.spyOn(keyRing, "save").mockResolvedValue(undefined);
    jest
      .spyOn(keyRing.addressCacheManager, "removeWalletFromAllCaches")
      .mockResolvedValue(undefined);

    await keyRing.deleteKeyRing(1, "pw");

    expect((keyRing as any).cardanoKeyCache.get(retainedKeyId)).toEqual(
      retainedEntry
    );
    expect((keyRing as any).cardanoKeyCache.has(deletedKeyId)).toBe(false);

    finishDerivation({
      algo: "cardano_address_only",
      pubKey: Uint8Array.from([9]),
      address: Buffer.from("addr_test1_late", "utf8"),
      isKeystone: false,
      isNanoLedger: false,
    });
    await lateDerivation;

    expect((keyRing as any).cardanoKeyCache.has(lateKeyId)).toBe(false);
    expect((keyRing as any).cardanoKeyCache.get(retainedKeyId)).toEqual(
      retainedEntry
    );
  });

  it("still clears every entry on lock and on a new unlock session", async () => {
    const { keyRing } = makeSubject();
    const staleKeyId = `cardano:${chainId}:w1`;
    const staleEntry = {
      address: Buffer.from("addr_test1_stale", "utf8"),
      pubKey: Uint8Array.from([1]),
    };
    (keyRing as any).cardanoKeyCache.set(staleKeyId, staleEntry);

    keyRing.lock();
    expect((keyRing as any).cardanoKeyCache.size).toBe(0);

    (keyRing as any).cardanoKeyCache.set(staleKeyId, staleEntry);
    jest
      .spyOn(Crypto, "decrypt")
      .mockResolvedValue(
        Buffer.from(Array(23).fill("abandon").concat("about").join(" "))
      );
    jest
      .spyOn(keyRing.addressCacheManager, "warmSharedDerivedKey")
      .mockResolvedValue(undefined);

    await keyRing.unlock("pw");

    expect((keyRing as any).cardanoKeyCache.size).toBe(0);
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
    selectKeyStore(keyRing, keyStore);
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

  it("rejects with the typed deadline while retaining ownership and blocking duplicate work", async () => {
    jest.useFakeTimers();
    const { keyRing, keyStore, keyId } = createSubject();
    const completion = deferred<any>();
    const bounded = createTrackedDeadlinePromise(completion.promise, 1_000);
    const { CardanoService } = await import("../cardano/service");
    const deriveSpy = jest
      .spyOn(CardanoService.prototype, "deriveKeyFromKeyStore")
      .mockReturnValue(bounded as any);

    try {
      const first = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
      expect(deriveSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1_000);
      await expect(first).rejects.toMatchObject({
        name: "CardanoKeyContextTimeoutError",
        code: "cardano_key_context_timeout",
      });

      const second = keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any);
      expect(second).toBe(first);
      await expect(second).rejects.toMatchObject({
        code: "cardano_key_context_timeout",
      });
      expect(deriveSpy).toHaveBeenCalledTimes(1);
      expect((keyRing as any).cardanoKeyFlights.get(keyId)).toBe(first);

      completion.resolve(derivedKey);
      await completion.promise;
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      expect((keyRing as any).cardanoKeyFlights.has(keyId)).toBe(false);
      expect((keyRing as any).cardanoKeyCache.get(keyId)).toEqual({
        address: derivedKey.address,
        pubKey: derivedKey.pubKey,
      });
      expect(deriveSpy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
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
    const pubKey = Uint8Array.from([0xab, 0xcd]);

    (keyRing as any).cardanoKeyCache.set(keyId, { address, pubKey });

    try {
      await expect(
        keyRing.getCardanoKeyForKeyStore(chainId, keyStore as any)
      ).resolves.toEqual({
        algo: "cardano_address_only",
        pubKey,
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

  it("does not persist an empty pubKey when a concurrent derivation warms the cache mid-loop", async () => {
    const keyStore = {
      version: "1.2" as const,
      type: "mnemonic" as const,
      curve: KeyCurves.secp256k1,
      // Neither `cardano` nor `mnemonicLength`: the legacy word-count probe is
      // the only await between the bulk loop's memory-cache check and
      // getCardanoKeyForKeyStore, so it is the window a concurrent getKey wins.
      meta: { __id__: "w-cardano-warm-race", name: "Cardano Wallet" },
      bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
      crypto: { kdf: "scrypt" },
    };
    const keyRing = createTrackedKeyRing(
      [{ chainId, features: ["cardano"] } as ChainInfo],
      new MemoryKVStore("keyring-cardano-warm-race"),
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );

    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [keyStore];
    selectKeyStore(keyRing, keyStore);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "session-cardano-warm-race";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    const keyId = `cardano:${chainId}:${keyStore.meta.__id__}`;
    const derived = {
      address: Buffer.from("addr_test1qz_warm_race", "utf8"),
      pubKey: Uint8Array.from([0x01, 0x02, 0x03]),
    };

    jest.spyOn(keyRing as any, "loadCardanoChainCache").mockResolvedValue({});
    const saveCache = jest
      .spyOn(keyRing as any, "saveCardanoChainCache")
      .mockResolvedValue(undefined);
    jest
      .spyOn(keyRing as any, "decryptKeyStoreText")
      .mockImplementation(async () => {
        // Stands in for a concurrent KeyRingService.getKey publishing the real
        // key while this bulk call is still awaiting its word-count probe.
        (keyRing as any).cardanoKeyCache.set(keyId, derived);
        return Array(23).fill("abandon").concat("about").join(" ");
      });

    const keys = await keyRing.getKeysForCardano(chainId);

    expect(Buffer.from(keys[0].pubKey).toString("hex")).toBe(
      Buffer.from(derived.pubKey).toString("hex")
    );
    expect((keyRing as any).cardanoKeyCache.get(keyId).pubKey).toEqual(
      derived.pubKey
    );
    expect(saveCache).toHaveBeenCalledWith(
      chainId,
      {
        [keyStore.meta.__id__]: {
          address: Buffer.from(derived.address).toString("utf8"),
          pubKey: Buffer.from(derived.pubKey).toString("hex"),
        },
      },
      expect.anything()
    );
  });
});

function makeKeyRing(kvStore: MemoryKVStore) {
  return createTrackedKeyRing(
    [],
    kvStore,
    {} as any,
    {} as any,
    { dispatchEvent: jest.fn() } as any,
    {} as any,
    {} as any
  );
}
