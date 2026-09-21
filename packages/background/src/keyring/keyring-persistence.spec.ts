import {
  ExtensionKVStore,
  KVStore,
  MemoryKVStore,
  MultiGet,
} from "@keplr-wallet/common";
import { KeyCurves } from "@keplr-wallet/crypto";
import { KeyRing, KeyRingStatus } from "./keyring";
import { Crypto } from "./crypto";

const keyRingsToDispose = new Set<KeyRing>();

function createTrackedKeyRing(
  ...args: ConstructorParameters<typeof KeyRing>
): KeyRing {
  const keyRing = new KeyRing(...args);
  keyRingsToDispose.add(keyRing);
  return keyRing;
}

function selectKeyStore(
  keyRing: KeyRing,
  keyStore: { meta?: Record<string, string> } | null
): void {
  (keyRing as any).selectedKeyStoreId = keyStore?.meta?.["__id__"] ?? null;
}

function persistedCiphertext(label: string): string {
  return Buffer.from(label).toString("hex");
}

function makeCrypto(ciphertext = "ciphertext"): any {
  const encodedCiphertext = persistedCiphertext(ciphertext);
  return {
    cipher: "aes-128-ctr",
    cipherparams: { iv: "11".repeat(16) },
    ciphertext: encodedCiphertext,
    kdf: "scrypt",
    kdfparams: {
      salt: "22".repeat(32),
      dklen: 32,
      n: 131072,
      r: 8,
      p: 1,
    },
    mac: "33".repeat(32),
  };
}

function makeWallet(id: string, name = `Wallet ${id}`): any {
  return {
    version: "1.2" as const,
    type: "mnemonic" as const,
    curve: KeyCurves.secp256k1,
    meta: { __id__: id, name },
    bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
    crypto: makeCrypto(`ciphertext-${id}`),
  };
}

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function makePasswordWallet(id: string, password: string): any {
  return {
    ...makeWallet(id),
    crypto: makeCrypto(`${id}:${password}`),
    encryptedWith: password,
  };
}

function mockPasswordCrypto(): void {
  jest
    .spyOn(Crypto, "decrypt")
    .mockImplementation(async (_crypto, keyStore: any, password) => {
      if (keyStore.encryptedWith !== password) {
        throw new Error("Unmatched mac");
      }
      return Buffer.from(TEST_MNEMONIC);
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
        password,
        meta,
        bip44HDPath
      ) => ({
        ...makePasswordWallet(meta["__id__"], password),
        type,
        curve,
        meta,
        bip44HDPath,
      })
    );
}

const persistenceKeys = ["keyring-state:v2", "key-store", "key-multi-store"];
const restorePersistenceKeys = [...persistenceKeys, "incrementalNumber"];

class MultiGetMemoryKVStore implements KVStore, MultiGet {
  private readonly values: Record<string, unknown>;

  constructor(initialValues: Record<string, unknown> = {}) {
    this.values = { ...initialValues };
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values[key] as T | undefined;
  }

  async set<T = unknown>(key: string, data: T | null): Promise<void> {
    this.values[key] = data;
  }

  prefix(): string {
    return "keyring-persistence-test";
  }

  async multiGet(keys: string[]): Promise<{ [key: string]: any }> {
    return Object.fromEntries(keys.map((key) => [key, this.values[key]]));
  }

  peek<T = unknown>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }
}

function makePersistenceKeyRing(
  kvStore: KVStore,
  chainsService: any = {},
  crypto: any = {}
): KeyRing {
  return createTrackedKeyRing(
    [],
    kvStore,
    {} as any,
    {} as any,
    { dispatchEvent: jest.fn() } as any,
    crypto,
    chainsService
  );
}

async function makeUnlockedPasswordKeyRing(
  kvStore: KVStore,
  password: string,
  walletIds = ["w1", "w2"]
): Promise<KeyRing> {
  const wallets = walletIds.map((id) => makePasswordWallet(id, password));
  const keyRing = makePersistenceKeyRing(kvStore);
  (keyRing as any).loaded = true;
  (keyRing as any).multiKeyStore = wallets;
  selectKeyStore(keyRing, wallets[0]);
  (keyRing as any).password = password;
  (keyRing as any).unlockSessionId = "password-transition-session";
  (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
  keyRing.addressCacheManager.setPassword(password);
  await keyRing.save();
  return keyRing;
}

async function expectOnlyPasswordUnlocks(
  kvStore: KVStore,
  acceptedPassword: string,
  rejectedPassword: string
): Promise<void> {
  const restored = makePersistenceKeyRing(kvStore);
  await restored.restore();
  await expect(restored.unlock(rejectedPassword)).rejects.toThrow(
    "Unmatched mac"
  );
  await expect(restored.unlock(acceptedPassword)).resolves.toBeUndefined();
  restored.lock();
}

function persistedCryptoPart(keyStore: any): any {
  return {
    type: keyStore.type,
    curve: keyStore.curve,
    crypto: keyStore.crypto,
    key: keyStore.key,
    bip44HDPath: keyStore.bip44HDPath,
    coinTypeForChain: keyStore.coinTypeForChain,
  };
}

describe("KeyRing persistence atomicity", () => {
  afterEach(async () => {
    await Promise.all(
      [...keyRingsToDispose].map((keyRing) => keyRing.dispose())
    );
    keyRingsToDispose.clear();
    jest.restoreAllMocks();
  });

  it("reads one MultiGet snapshot before save without ordinary gets", async () => {
    const kvStore = new MultiGetMemoryKVStore();
    const wallet = makeWallet("batch-save");
    const keyRing = makePersistenceKeyRing(kvStore);
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    const getSpy = jest.spyOn(kvStore, "get");
    const multiGetSpy = jest.spyOn(kvStore, "multiGet");
    const setSpy = jest.spyOn(kvStore, "set");

    await keyRing.save();

    expect(multiGetSpy).toHaveBeenCalledTimes(1);
    expect(multiGetSpy).toHaveBeenCalledWith(persistenceKeys);
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy.mock.calls.map(([key]) => key)).toEqual([
      "keyring-state:v2",
      "key-store",
      "key-multi-store",
      "keyring-state:v2",
    ]);
    expect(kvStore.peek<any>("keyring-state:v2")).toMatchObject({
      selectedId: "batch-save",
      keyStores: [wallet],
      revision: 1,
      legacyMirror: { status: "synced" },
    });
    expect(kvStore.peek("key-store")).toEqual(wallet);
    expect(kvStore.peek("key-multi-store")).toEqual([wallet]);
  });

  it("reads one MultiGet snapshot on restore and keeps canonical selection", async () => {
    const kvStore = new MultiGetMemoryKVStore();
    const first = makeWallet("restore-first");
    const selected = makeWallet("restore-selected");
    const saved = makePersistenceKeyRing(kvStore);
    (saved as any).multiKeyStore = [first, selected];
    selectKeyStore(saved, selected);
    await saved.save();

    const restored = makePersistenceKeyRing(kvStore);
    const getSpy = jest.spyOn(kvStore, "get");
    const multiGetSpy = jest.spyOn(kvStore, "multiGet");
    const setSpy = jest.spyOn(kvStore, "set");

    await restored.restore();

    expect(multiGetSpy).toHaveBeenCalledTimes(1);
    expect(multiGetSpy).toHaveBeenCalledWith(restorePersistenceKeys);
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect(restored.getCurrentKeyStore()).toEqual(selected);
  });

  it("uses ExtensionKVStore's exact prefixed filtered provider path", async () => {
    const prefix = "keyring-filtered-provider";
    const unrelatedKey = `${prefix}/address-cache:large-unrelated-entry`;
    const storage: Record<string, unknown> = {
      [unrelatedKey]: { blob: "not materialized" },
    };
    const providerGet = jest.fn(async () => ({ ...storage }));
    const materializedKeys: string[] = [];
    const providerMultiGet = jest.fn(async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        materializedKeys.push(key);
        if (key in storage) {
          result[key] = storage[key];
        }
      }
      return result;
    });
    const providerSet = jest.fn(async (items: Record<string, unknown>) => {
      Object.assign(storage, items);
    });
    const extensionKVStoreClass = ExtensionKVStore as any;
    const previousProvider = extensionKVStoreClass.KVStoreProvider;

    try {
      extensionKVStoreClass.KVStoreProvider = {
        get: providerGet,
        set: providerSet,
        multiGet: providerMultiGet,
      };
      const kvStore = new ExtensionKVStore(prefix);
      const wallet = makeWallet("extension-filtered");
      const keyRing = makePersistenceKeyRing(kvStore);
      (keyRing as any).multiKeyStore = [wallet];
      selectKeyStore(keyRing, wallet);

      await keyRing.save();

      const prefixedPersistenceKeys = persistenceKeys.map(
        (key) => `${prefix}/${key}`
      );
      expect(providerMultiGet).toHaveBeenCalledTimes(1);
      expect(providerMultiGet).toHaveBeenCalledWith(prefixedPersistenceKeys);
      expect(providerGet).not.toHaveBeenCalled();
      expect(materializedKeys).toEqual(prefixedPersistenceKeys);
      expect(materializedKeys).not.toContain(unrelatedKey);
      expect(storage[unrelatedKey]).toEqual({ blob: "not materialized" });
    } finally {
      extensionKVStoreClass.KVStoreProvider = previousProvider;
    }
  });

  it("keeps save and restore fallback for KVStore without MultiGet", async () => {
    const kvStore = new MemoryKVStore("keyring-persistence-get-fallback");
    const wallet = makeWallet("fallback");
    const saved = makePersistenceKeyRing(kvStore);
    (saved as any).multiKeyStore = [wallet];
    selectKeyStore(saved, wallet);
    const getSpy = jest.spyOn(kvStore, "get");
    const setSpy = jest.spyOn(kvStore, "set");

    await saved.save();

    expect("multiGet" in kvStore).toBe(false);
    expect(getSpy.mock.calls.map(([key]) => key)).toEqual(persistenceKeys);
    expect(setSpy.mock.calls.map(([key]) => key)).toEqual([
      "keyring-state:v2",
      "key-store",
      "key-multi-store",
      "keyring-state:v2",
    ]);

    getSpy.mockClear();
    setSpy.mockClear();
    const restored = makePersistenceKeyRing(kvStore);
    await restored.restore();

    expect(getSpy.mock.calls.map(([key]) => key)).toEqual(
      restorePersistenceKeys
    );
    expect(setSpy).not.toHaveBeenCalled();
    expect(restored.getCurrentKeyStore()).toEqual(wallet);
  });

  it("rejects a failed MultiGet before save without publishing writes", async () => {
    const kvStore = new MultiGetMemoryKVStore();
    const wallet = makeWallet("batch-read-failure");
    const keyRing = makePersistenceKeyRing(kvStore);
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);
    const getSpy = jest.spyOn(kvStore, "get");
    const multiGetSpy = jest
      .spyOn(kvStore, "multiGet")
      .mockRejectedValueOnce(new Error("filtered storage read failed"));
    const setSpy = jest.spyOn(kvStore, "set");

    await expect(keyRing.save()).rejects.toThrow(
      "filtered storage read failed"
    );

    expect(multiGetSpy).toHaveBeenCalledTimes(1);
    expect(multiGetSpy).toHaveBeenCalledWith(persistenceKeys);
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect(kvStore.peek("keyring-state:v2")).toBeUndefined();
    expect(kvStore.peek("key-store")).toBeUndefined();
    expect(kvStore.peek("key-multi-store")).toBeUndefined();
  });

  it("uses one filtered snapshot read on the wallet-switch save path", async () => {
    const kvStore = new MultiGetMemoryKVStore();
    const first = makeWallet("switch-first");
    const selected = makeWallet("switch-selected");
    const chainId = "switch-chain-1";
    const keyRing = createTrackedKeyRing(
      [{ chainId, features: ["evm"] } as any],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {
        getSelectedChain: jest.fn().mockResolvedValue(chainId),
        getChainEthereumKeyFeatures: jest.fn(),
      }
    );
    (keyRing as any).loaded = true;
    (keyRing as any).multiKeyStore = [first, selected];
    selectKeyStore(keyRing, first);
    (keyRing as any).password = "pw";
    (keyRing as any).unlockSessionId = "switch-session";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);
    (keyRing as any).sessionKeyStoreMaterial.set("switch-selected", {
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array([2]),
    });
    jest.spyOn(keyRing, "loadGenericChainCache").mockResolvedValue({
      "switch-selected": { address: "11".repeat(20) },
    });
    const getSpy = jest.spyOn(kvStore, "get");
    const multiGetSpy = jest.spyOn(kvStore, "multiGet");
    const setSpy = jest.spyOn(kvStore, "set");

    await keyRing.changeKeyStoreFromMultiKeyStore(1);

    expect(multiGetSpy).toHaveBeenCalledTimes(1);
    expect(multiGetSpy).toHaveBeenCalledWith(persistenceKeys);
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy.mock.calls.map(([key]) => key)).toEqual([
      "keyring-state:v2",
      "key-store",
      "key-multi-store",
      "keyring-state:v2",
    ]);
    expect(kvStore.peek<any>("keyring-state:v2")).toMatchObject({
      selectedId: "switch-selected",
      legacyMirror: { status: "synced" },
    });
  });

  it("keeps the previous complete generation when password persistence fails", async () => {
    const mkKeyStore = (id: string, pw: string) =>
      ({
        version: "1.2" as const,
        type: "mnemonic" as const,
        curve: KeyCurves.secp256k1,
        meta: { __id__: id, name: `Wallet ${id}` },
        bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
        crypto: makeCrypto(`password-${id}`),
        encryptedWith: pw,
      } as any);

    const kvStore = new MemoryKVStore("probe-save-atomicity");
    const w1 = mkKeyStore("w1", "old-pw");
    const w2 = mkKeyStore("w2", "old-pw");

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
    (keyRing as any).password = "old-pw";
    (keyRing as any).unlockSessionId = "session-1";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    await kvStore.set("keyring-state:v2", {
      selectedId: "w1",
      keyStores: [w1, w2],
    });

    jest.spyOn(Crypto, "decrypt").mockResolvedValue(Buffer.from("payload"));
    jest.spyOn(Crypto, "encrypt").mockImplementation(
      async (
        _c: any,
        _k: any,
        type: any,
        curve: any,
        _t: any,
        pw: any,
        meta: any,
        bip44HDPath: any
      ) =>
        ({
          version: "1.2",
          type,
          curve,
          meta,
          bip44HDPath,
          crypto: makeCrypto(`password-${meta["__id__"]}`),
          encryptedWith: pw,
        } as any)
    );
    jest
      .spyOn(keyRing.addressCacheManager, "clearAllCaches")
      .mockResolvedValue(undefined);

    // The single atomic storage write fails (quota, worker teardown, disk error...).
    let writes = 0;
    const realSet = kvStore.set.bind(kvStore);
    jest.spyOn(kvStore, "set").mockImplementation(async (k: any, v: any) => {
      writes += 1;
      if (writes === 1) {
        throw new Error("storage write failed");
      }
      return realSet(k, v);
    });

    await expect(
      keyRing.updatePassword("old-pw", "new-pw")
    ).rejects.toBeDefined();

    const persistedState = await kvStore.get<any>("keyring-state:v2");

    const diskPasswords = new Set<string>([
      ...persistedState.keyStores.map((k: any) => k.encryptedWith),
    ]);
    // Everything on disk must be openable with one and the same password.
    expect([...diskPasswords]).toEqual(["old-pw"]);
    expect(persistedState.selectedId).toBe("w1");
    expect((keyRing as any).password).toBe("old-pw");
    expect(writes).toBe(1);
  });

  it("preserves all three persistence keys when lock aborts password update", async () => {
    const wallets = ["w1", "w2", "w3"].map((id) => ({
      ...makeWallet(id),
      encryptedWith: "old-pw",
    }));
    const kvStore = new MemoryKVStore("password-lock-persistence-preservation");
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
    (keyRing as any).multiKeyStore = wallets;
    selectKeyStore(keyRing, wallets[0]);
    (keyRing as any).password = "old-pw";
    (keyRing as any).unlockSessionId = "session-password-lock";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    await kvStore.set("keyring-state:v2", {
      selectedId: "w1",
      keyStores: wallets,
      revision: 7,
    } as any);
    await kvStore.set("key-store", wallets[0] as any);
    await kvStore.set("key-multi-store", wallets as any);
    const before = {
      v2: await kvStore.get("keyring-state:v2"),
      selected: await kvStore.get("key-store"),
      multi: await kvStore.get("key-multi-store"),
    };

    let finishDecrypt!: (value: Uint8Array) => void;
    const decryptGate = new Promise<Uint8Array>((resolve) => {
      finishDecrypt = resolve;
    });
    const decryptedBuffer = Buffer.from("first-secret");
    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockReturnValue(decryptGate);
    const encryptSpy = jest.spyOn(Crypto, "encrypt");
    const clearCachesSpy = jest
      .spyOn(keyRing.addressCacheManager, "clearAllCaches")
      .mockResolvedValue(undefined);
    const setSpy = jest.spyOn(kvStore, "set");

    const passwordUpdate = keyRing.updatePassword("old-pw", "new-pw");
    expect(decryptSpy).toHaveBeenCalledTimes(1);
    keyRing.lock();
    finishDecrypt(decryptedBuffer);

    await expect(passwordUpdate).rejects.toThrow(
      "Key ring session changed while password was updating"
    );
    expect(decryptSpy).toHaveBeenCalledTimes(1);
    expect(encryptSpy).not.toHaveBeenCalled();
    expect(clearCachesSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect([...decryptedBuffer]).toEqual(Array(decryptedBuffer.length).fill(0));
    await expect(kvStore.get("keyring-state:v2")).resolves.toEqual(before.v2);
    await expect(kvStore.get("key-store")).resolves.toEqual(before.selected);
    await expect(kvStore.get("key-multi-store")).resolves.toEqual(before.multi);
    expect(
      (await kvStore.get<any>("key-multi-store")).map(
        (keyStore: any) => keyStore.encryptedWith
      )
    ).toEqual(["old-pw", "old-pw", "old-pw"]);
    expect((keyRing as any).password).toBe("");
    expect(keyRing.status).toBe(KeyRingStatus.LOCKED);
  });

  it("persists a complete sequential password generation to v2 and mirrors", async () => {
    const wallets = ["w1", "w2", "w3"].map((id) => ({
      ...makeWallet(id),
      encryptedWith: "old-pw",
    }));
    const kvStore = new MemoryKVStore("password-success-persistence");
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
    (keyRing as any).multiKeyStore = wallets;
    selectKeyStore(keyRing, wallets[1]);
    (keyRing as any).password = "old-pw";
    (keyRing as any).unlockSessionId = "session-password-success";
    (keyRing as any)._mnemonicMasterSeed = new Uint8Array([1]);

    await kvStore.set("keyring-state:v2", {
      selectedId: "w2",
      keyStores: wallets,
    } as any);
    await kvStore.set("key-store", wallets[1] as any);
    await kvStore.set("key-multi-store", wallets as any);

    const sequence: string[] = [];
    const decryptSpy = jest
      .spyOn(Crypto, "decrypt")
      .mockImplementation(async (_crypto, keyStore) => {
        sequence.push(`decrypt:${keyStore.meta["__id__"]}`);
        return Buffer.from(`secret:${keyStore.meta["__id__"]}`);
      });
    const encryptSpy = jest
      .spyOn(Crypto, "encrypt")
      .mockImplementation(
        async (
          _crypto,
          _kdf,
          type,
          curve,
          _payload,
          password,
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
            crypto: makeCrypto(`password-${meta["__id__"]}`),
            encryptedWith: password,
          } as any;
        }
      );
    const clearCachesSpy = jest
      .spyOn(keyRing.addressCacheManager, "clearAllCaches")
      .mockResolvedValue(undefined);

    await keyRing.updatePassword("old-pw", "new-pw");

    const persistedV2 = await kvStore.get<any>("keyring-state:v2");
    const persistedSelected = await kvStore.get<any>("key-store");
    const persistedMulti = await kvStore.get<any[]>("key-multi-store");
    expect(sequence).toEqual([
      "decrypt:w1",
      "encrypt:w1",
      "decrypt:w2",
      "encrypt:w2",
      "decrypt:w3",
      "encrypt:w3",
    ]);
    expect(decryptSpy).toHaveBeenCalledTimes(3);
    expect(encryptSpy).toHaveBeenCalledTimes(3);
    expect(clearCachesSpy).toHaveBeenCalledTimes(1);
    expect(persistedV2).toMatchObject({
      selectedId: "w2",
      legacyMirror: { status: "synced" },
    });
    expect(
      persistedV2.keyStores.map((keyStore: any) => keyStore.encryptedWith)
    ).toEqual(["new-pw", "new-pw", "new-pw"]);
    expect(persistedSelected).toMatchObject({
      meta: { __id__: "w2" },
      encryptedWith: "new-pw",
    });
    expect(persistedMulti).toBeDefined();
    expect(
      (persistedMulti ?? []).map((keyStore: any) => keyStore.encryptedWith)
    ).toEqual(["new-pw", "new-pw", "new-pw"]);
    expect((keyRing as any).password).toBe("new-pw");
    expect((keyRing as any).unlockSessionId).not.toBe("");
    keyRing.lock();
  });

  it("keeps only the old password durable when the canonical commit fails, then retries", async () => {
    const kvStore = new MemoryKVStore("password-canonical-failure-retry");
    mockPasswordCrypto();
    const keyRing = await makeUnlockedPasswordKeyRing(kvStore, "old-pw");
    const realSet = kvStore.set.bind(kvStore);
    const setSpy = jest
      .spyOn(kvStore, "set")
      .mockImplementation(async (key: string, value: any) => {
        if (
          key === "keyring-state:v2" &&
          value?.legacyMirror?.status === "pending" &&
          value.keyStores?.[0]?.encryptedWith === "new-pw"
        ) {
          throw new Error("canonical commit failed");
        }
        await realSet(key, value);
      });

    await expect(keyRing.updatePassword("old-pw", "new-pw")).rejects.toThrow(
      "canonical commit failed"
    );
    await expectOnlyPasswordUnlocks(kvStore, "old-pw", "new-pw");

    setSpy.mockRestore();
    await keyRing.updatePassword("old-pw", "new-pw");
    await expectOnlyPasswordUnlocks(kvStore, "new-pw", "old-pw");
    keyRing.lock();
  });

  it("treats a rollback mirror failure as a committed recognizable generation", async () => {
    const kvStore = new MemoryKVStore("password-mirror-failure-commit");
    mockPasswordCrypto();
    const keyRing = await makeUnlockedPasswordKeyRing(kvStore, "old-pw");
    const realSet = kvStore.set.bind(kvStore);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest
      .spyOn(kvStore, "set")
      .mockImplementation(async (key: string, value: any) => {
        if (key === "key-store" && value?.encryptedWith === "new-pw") {
          throw new Error("selected mirror failed");
        }
        await realSet(key, value);
      });

    await expect(
      keyRing.updatePassword("old-pw", "new-pw")
    ).resolves.toBeUndefined();
    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      legacyMirror: { status: "pending" },
      keyStores: [{ encryptedWith: "new-pw" }, { encryptedWith: "new-pw" }],
    });
    await expectOnlyPasswordUnlocks(kvStore, "new-pw", "old-pw");
    keyRing.lock();
  });

  it("does not turn pending-to-synced finalization failure into a password error", async () => {
    const kvStore = new MemoryKVStore("password-finalization-failure");
    mockPasswordCrypto();
    const keyRing = await makeUnlockedPasswordKeyRing(kvStore, "old-pw");
    const realSet = kvStore.set.bind(kvStore);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest
      .spyOn(kvStore, "set")
      .mockImplementation(async (key: string, value: any) => {
        if (
          key === "keyring-state:v2" &&
          value?.legacyMirror?.status === "synced" &&
          value.keyStores?.[0]?.encryptedWith === "new-pw"
        ) {
          throw new Error("finalization failed");
        }
        await realSet(key, value);
      });

    await expect(
      keyRing.updatePassword("old-pw", "new-pw")
    ).resolves.toBeUndefined();
    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      legacyMirror: { status: "pending" },
    });
    await expectOnlyPasswordUnlocks(kvStore, "new-pw", "old-pw");
    keyRing.lock();
  });

  it("leaves old storage intact when lock happens before the canonical call", async () => {
    const kvStore = new MemoryKVStore("password-lock-before-commit");
    mockPasswordCrypto();
    const keyRing = await makeUnlockedPasswordKeyRing(kvStore, "old-pw");
    const realGet = kvStore.get.bind(kvStore);
    let locked = false;
    jest.spyOn(kvStore, "get").mockImplementation(async (key) => {
      const value = await realGet(key);
      if (!locked && key === "keyring-state:v2") {
        locked = true;
        keyRing.lock();
      }
      return value;
    });
    const setSpy = jest.spyOn(kvStore, "set");

    await expect(keyRing.updatePassword("old-pw", "new-pw")).rejects.toThrow(
      "session changed while password was updating"
    );
    expect(setSpy).not.toHaveBeenCalled();
    await expectOnlyPasswordUnlocks(kvStore, "old-pw", "new-pw");
  });

  it.each(["during", "immediately after"])(
    "returns success and remains locked when lock happens %s canonical commit",
    async (timing) => {
      const kvStore = new MemoryKVStore(`password-lock-${timing}-commit`);
      mockPasswordCrypto();
      const keyRing = await makeUnlockedPasswordKeyRing(kvStore, "old-pw");
      const realSet = kvStore.set.bind(kvStore);
      let didLock = false;
      jest
        .spyOn(kvStore, "set")
        .mockImplementation(async (key: string, value: any) => {
          if (
            !didLock &&
            key === "keyring-state:v2" &&
            value?.legacyMirror?.status === "pending" &&
            value.keyStores?.[0]?.encryptedWith === "new-pw"
          ) {
            didLock = true;
            if (timing === "during") {
              keyRing.lock();
              await realSet(key, value);
              return;
            }
            await realSet(key, value);
            keyRing.lock();
            return;
          }
          await realSet(key, value);
        });

      await expect(
        keyRing.updatePassword("old-pw", "new-pw")
      ).resolves.toBeUndefined();
      expect(keyRing.status).toBe(KeyRingStatus.LOCKED);
      expect((keyRing as any).password).toBe("");
      expect(
        (keyRing as any).multiKeyStore.map(
          (wallet: any) => wallet.encryptedWith
        )
      ).toEqual(["new-pw", "new-pw"]);
      await expectOnlyPasswordUnlocks(kvStore, "new-pw", "old-pw");
    }
  );

  it("never persists a keyring array containing mixed password generations", async () => {
    const kvStore = new MemoryKVStore("password-no-mixed-generation");
    mockPasswordCrypto();
    const keyRing = await makeUnlockedPasswordKeyRing(kvStore, "old-pw", [
      "w1",
      "w2",
      "w3",
    ]);
    const realSet = kvStore.set.bind(kvStore);
    const observedGenerations: string[][] = [];
    jest
      .spyOn(kvStore, "set")
      .mockImplementation(async (key: string, value: any) => {
        const keyStores =
          key === "keyring-state:v2"
            ? value?.keyStores
            : key === "key-multi-store"
            ? value
            : undefined;
        if (Array.isArray(keyStores)) {
          observedGenerations.push(
            keyStores.map((wallet: any) => wallet.encryptedWith)
          );
        }
        await realSet(key, value);
      });

    await keyRing.updatePassword("old-pw", "new-pw");

    expect(observedGenerations.length).toBeGreaterThan(0);
    for (const generation of observedGenerations) {
      expect(new Set(generation).size).toBeLessThanOrEqual(1);
    }
    await expectOnlyPasswordUnlocks(kvStore, "new-pw", "old-pw");
    keyRing.lock();
  });

  it("preserves chain-specific coin type overrides across password commit", async () => {
    const kvStore = new MemoryKVStore("password-preserves-coin-types");
    mockPasswordCrypto();
    const keyRing = await makeUnlockedPasswordKeyRing(kvStore, "old-pw");
    (keyRing as any).multiKeyStore[0].coinTypeForChain = {
      cosmoshub: 118,
      evmos_9001: 60,
    };
    (keyRing as any).multiKeyStore[1].coinTypeForChain = { fetchhub: 118 };
    await keyRing.save();

    await keyRing.updatePassword("old-pw", "new-pw");

    expect(
      (await kvStore.get<any>("keyring-state:v2")).keyStores.map(
        (wallet: any) => wallet.coinTypeForChain
      )
    ).toEqual([{ cosmoshub: 118, evmos_9001: 60 }, { fetchhub: 118 }]);
    keyRing.lock();
  });

  it("fails closed without writing when legacy multi-key state is unrecognized", async () => {
    const kvStore = new MemoryKVStore("probe-unrecognized-legacy-state");
    const onlyRecoverableWallet = makeWallet("sole-copy");
    const malformedLegacyMulti = {
      format: "unknown-multi-wallet-format",
      wallets: [onlyRecoverableWallet],
    };
    await kvStore.set("key-store", onlyRecoverableWallet);
    await kvStore.set("key-multi-store", malformedLegacyMulti as any);

    const dispatchEvent = jest.fn();
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent } as any,
      {} as any,
      {} as any
    );
    const setSpy = jest.spyOn(kvStore, "set");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(keyRing.restore()).rejects.toThrow(
      "Unable to restore key ring: unrecognized legacy multi-key state"
    );

    expect(setSpy).not.toHaveBeenCalled();
    expect(await kvStore.get("keyring-state:v2")).toBeUndefined();
    expect(await kvStore.get("key-store")).toEqual(onlyRecoverableWallet);
    expect(await kvStore.get("key-multi-store")).toEqual(malformedLegacyMulti);
    expect(keyRing.status).toBe(KeyRingStatus.NOTLOADED);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("preserves malformed v2 and legacy values when neither state is recognizable", async () => {
    const kvStore = new MemoryKVStore("probe-malformed-v2-and-legacy-state");
    const onlyRecoverableWallet = makeWallet("sole-copy");
    const malformedV2 = {
      selectedId: "sole-copy",
      wallets: [onlyRecoverableWallet],
    };
    const malformedLegacyMulti = {
      selectedId: "sole-copy",
      keyStores: "not-an-array",
    };
    await kvStore.set("keyring-state:v2", malformedV2 as any);
    await kvStore.set("key-store", onlyRecoverableWallet);
    await kvStore.set("key-multi-store", malformedLegacyMulti as any);

    const dispatchEvent = jest.fn();
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent } as any,
      {} as any,
      {} as any
    );
    const setSpy = jest.spyOn(kvStore, "set");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(keyRing.restore()).rejects.toThrow(
      "Unable to restore key ring: unrecognized legacy multi-key state"
    );

    expect(setSpy).not.toHaveBeenCalled();
    expect(await kvStore.get("keyring-state:v2")).toEqual(malformedV2);
    expect(await kvStore.get("key-store")).toEqual(onlyRecoverableWallet);
    expect(await kvStore.get("key-multi-store")).toEqual(malformedLegacyMulti);
    expect(keyRing.status).toBe(KeyRingStatus.NOTLOADED);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("falls back from a v2 missing ciphertext without decrypting and remains idempotent", async () => {
    const kvStore = new MemoryKVStore("v2-missing-ciphertext-fallback");
    const legacy = makeWallet("legacy-usable");
    const corrupt = makeWallet("corrupt-v2");
    delete corrupt.crypto.ciphertext;
    await kvStore.set("keyring-state:v2", {
      selectedId: "corrupt-v2",
      keyStores: [corrupt],
    } as any);
    await kvStore.set("key-store", legacy);
    await kvStore.set("key-multi-store", [legacy]);

    const scrypt = jest.fn();
    const decrypt = jest.spyOn(Crypto, "decrypt");
    const restored = makePersistenceKeyRing(kvStore, {}, { scrypt });
    await restored.restore();

    const firstState = await kvStore.get<any>("keyring-state:v2");
    expect(firstState).toMatchObject({
      selectedId: "legacy-usable",
      keyStores: [legacy],
      legacyMirror: { status: "synced" },
    });
    expect(persistedCryptoPart(firstState.keyStores[0])).toEqual(
      persistedCryptoPart(legacy)
    );
    expect(scrypt).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();

    const setSpy = jest.spyOn(kvStore, "set");
    const restoredAgain = makePersistenceKeyRing(kvStore, {}, { scrypt });
    await restoredAgain.restore();
    expect(setSpy).not.toHaveBeenCalled();
    expect(await kvStore.get("keyring-state:v2")).toEqual(firstState);
    expect(scrypt).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it.each([
    ["missing IV", (wallet: any) => delete wallet.crypto.cipherparams.iv],
    ["invalid IV", (wallet: any) => (wallet.crypto.cipherparams.iv = "xyz")],
    ["missing MAC", (wallet: any) => delete wallet.crypto.mac],
    ["invalid MAC", (wallet: any) => (wallet.crypto.mac = "00")],
    ["missing kdfparams", (wallet: any) => delete wallet.crypto.kdfparams],
    ["invalid scrypt n", (wallet: any) => (wallet.crypto.kdfparams.n = 1000)],
    [
      "invalid scrypt dklen",
      (wallet: any) => (wallet.crypto.kdfparams.dklen = 16),
    ],
    [
      "unsupported cipher",
      (wallet: any) => (wallet.crypto.cipher = "aes-256-gcm"),
    ],
    ["unsupported KDF", (wallet: any) => (wallet.crypto.kdf = "argon2")],
    ["unsupported curve", (wallet: any) => (wallet.curve = "ed25519")],
  ])(
    "rejects %s in canonical v2 and uses the complete legacy mirror",
    async (_label, corruptWallet) => {
      const kvStore = new MemoryKVStore(`v2-crypto-shape-${_label}`);
      const legacy = makeWallet("legacy-valid");
      const corrupt = makeWallet("canonical-corrupt");
      corruptWallet(corrupt);
      await kvStore.set("keyring-state:v2", {
        selectedId: "canonical-corrupt",
        keyStores: [corrupt],
      } as any);
      await kvStore.set("key-store", legacy);
      await kvStore.set("key-multi-store", [legacy]);

      const restored = makePersistenceKeyRing(kvStore);
      await restored.restore();

      expect(restored.getCurrentKeyStore()).toMatchObject({
        meta: { __id__: "legacy-valid" },
      });
      expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
        selectedId: "legacy-valid",
        keyStores: [legacy],
      });
    }
  );

  it("restores a pre-curve legacy keystore and backfills the historical curve", async () => {
    const kvStore = new MemoryKVStore("legacy-missing-curve");
    const modern = makeWallet("modern");
    // `curve` only exists in keystores written after 2022. A Ledger wallet
    // older than that never read the field, so it stayed fully functional.
    const preCurve = makeWallet("pre-curve");
    delete preCurve.curve;
    preCurve.type = "ledger";

    await kvStore.set("key-store", preCurve);
    await kvStore.set("key-multi-store", [preCurve, modern]);

    const keyRing = makePersistenceKeyRing(kvStore);
    await keyRing.restore();

    expect(keyRing.getMultiKeyStoreInfo()).toHaveLength(2);
    const persisted = await kvStore.get<any>("keyring-state:v2");
    expect(persisted.keyStores.map((ks: any) => ks.curve)).toEqual([
      KeyCurves.secp256k1,
      KeyCurves.secp256k1,
    ]);
    expect(
      (await kvStore.get<any[]>("key-multi-store"))?.map((ks) => ks.curve)
    ).toEqual([KeyCurves.secp256k1, KeyCurves.secp256k1]);
  });

  it("treats a backfilled keystore as the same wallet as its pre-curve mirror", async () => {
    const kvStore = new MemoryKVStore("legacy-missing-curve-identity");
    const preCurve = makeWallet("pre-curve");
    delete preCurve.curve;

    // Canonical already repaired while the legacy mirror still carries the old
    // shape: what an interrupted upgrade or a version rollback leaves behind.
    // The fingerprint must still prove these are one wallet, not two.
    await kvStore.set("keyring-state:v2", {
      selectedId: "pre-curve",
      keyStores: [{ ...preCurve, curve: KeyCurves.secp256k1 }],
    } as any);
    await kvStore.set("key-store", preCurve);
    await kvStore.set("key-multi-store", [preCurve]);

    const keyRing = makePersistenceKeyRing(kvStore);
    await keyRing.restore();

    expect(keyRing.getMultiKeyStoreInfo()).toHaveLength(1);
  });

  it("rejects the whole canonical array when one keystore is corrupt", async () => {
    const kvStore = new MemoryKVStore("v2-one-corrupt-array-entry");
    const legacyFirst = makeWallet("first-valid");
    const legacySecond = makeWallet("second-valid");
    const corruptSecond = makeWallet("second-valid");
    delete corruptSecond.crypto.mac;
    await kvStore.set("keyring-state:v2", {
      selectedId: "first-valid",
      keyStores: [legacyFirst, corruptSecond],
    } as any);
    await kvStore.set("key-store", legacyFirst);
    await kvStore.set("key-multi-store", [legacyFirst, legacySecond]);

    const restored = makePersistenceKeyRing(kvStore);
    await restored.restore();

    const state = await kvStore.get<any>("keyring-state:v2");
    expect(state.keyStores).toEqual([legacyFirst, legacySecond]);
    expect(
      new Set(state.keyStores.map((wallet: any) => wallet.crypto.ciphertext))
        .size
    ).toBe(2);
  });

  it.each(["1", "1.1"])(
    "accepts and metadata-migrates the supported historical v%s shape",
    async (version) => {
      const kvStore = new MemoryKVStore(`historical-keyring-${version}`);
      const historical = { ...makeWallet(`historical-${version}`), version };
      await kvStore.set("key-store", historical as any);
      await kvStore.set("key-multi-store", [historical] as any);
      const scrypt = jest.fn();
      const decrypt = jest.spyOn(Crypto, "decrypt");

      const restored = makePersistenceKeyRing(kvStore, {}, { scrypt });
      await restored.restore();

      expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
        selectedId: `historical-${version}`,
        keyStores: [{ version: "1.2", crypto: historical.crypto }],
      });
      expect(scrypt).not.toHaveBeenCalled();
      expect(decrypt).not.toHaveBeenCalled();
    }
  );

  it("merges every valid ciphertext from ambiguous pre-metadata v2 and legacy snapshots", async () => {
    const kvStore = new MemoryKVStore("pre-metadata-conservative-merge");
    const canonicalOnly = makeWallet("canonical-only");
    const legacyOnly = makeWallet("legacy-only");
    await kvStore.set("keyring-state:v2", {
      selectedId: "canonical-only",
      keyStores: [canonicalOnly],
    });
    await kvStore.set("key-store", legacyOnly);
    await kvStore.set("key-multi-store", [legacyOnly]);

    const restored = makePersistenceKeyRing(kvStore);
    await restored.restore();

    const state = await kvStore.get<any>("keyring-state:v2");
    expect(state.selectedId).toBe("canonical-only");
    expect(state.keyStores).toHaveLength(2);
    expect(
      state.keyStores.map((wallet: any) => wallet.crypto.ciphertext)
    ).toEqual([canonicalOnly.crypto.ciphertext, legacyOnly.crypto.ciphertext]);
  });

  it("still restores genuinely empty storage as an empty key ring", async () => {
    const kvStore = new MemoryKVStore("probe-fresh-empty-state");
    const dispatchEvent = jest.fn();
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent } as any,
      {} as any,
      {} as any
    );

    await expect(keyRing.restore()).resolves.toBeUndefined();

    expect(keyRing.status).toBe(KeyRingStatus.EMPTY);
    expect(await kvStore.get("keyring-state:v2")).toMatchObject({
      selectedId: null,
      keyStores: [],
      revision: 1,
      legacyMirror: { status: "synced" },
    });
    expect(await kvStore.get("key-store")).toBeNull();
    expect(await kvStore.get("key-multi-store")).toEqual([]);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.anything(),
      "status-changed",
      {}
    );
  });

  it("recovers from an unrecognized persisted state instead of failing to load", async () => {
    const kvStore = new MemoryKVStore("probe-corrupt-state");
    const legacySelected = {
      version: "1.2" as const,
      type: "mnemonic" as const,
      curve: KeyCurves.secp256k1,
      meta: { __id__: "w1", name: "Wallet 1" },
      bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
      crypto: makeCrypto("legacy-selected"),
    } as any;

    // Neither the canonical `{ selectedId, keyStores }` shape nor a legacy array.
    await kvStore.set("keyring-state:v2", {
      keyStores: [legacySelected],
    } as any);
    await kvStore.set("key-store", legacySelected);

    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );

    await expect(keyRing.restore()).resolves.toBeUndefined();

    expect(keyRing.getCurrentKeyStore()).toMatchObject({
      meta: { __id__: "w1" },
    });
    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      selectedId: "w1",
      keyStores: [{ meta: { __id__: "w1", name: "Wallet 1" } }],
    });
    expect(await kvStore.get<any>("key-store")).toMatchObject({
      meta: { __id__: "w1", name: "Wallet 1" },
    });
    expect(await kvStore.get<any>("key-multi-store")).toEqual([
      expect.objectContaining({
        meta: expect.objectContaining({ __id__: "w1", name: "Wallet 1" }),
      }),
    ]);
  });

  it("migrates the interim object format and restores legacy rollback shapes", async () => {
    const kvStore = new MemoryKVStore("probe-interim-state");
    const wallet = {
      version: "1.2" as const,
      type: "mnemonic" as const,
      curve: KeyCurves.secp256k1,
      meta: { __id__: "w2", name: "Wallet 2" },
      bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
      crypto: makeCrypto("interim-wallet"),
    } as any;

    await kvStore.set("key-multi-store", {
      selectedId: "w2",
      keyStores: [wallet],
    } as any);
    await kvStore.set("key-store", null);

    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );

    await keyRing.restore();

    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      selectedId: "w2",
      keyStores: [wallet],
      revision: 1,
      legacyMirror: { status: "synced" },
    });
    expect(await kvStore.get<any>("key-store")).toEqual(wallet);
    expect(await kvStore.get<any>("key-multi-store")).toEqual([wallet]);
  });

  it("keeps v2 material while conservatively importing pre-metadata legacy metadata", async () => {
    const kvStore = new MemoryKVStore("probe-v2-authority");
    const currentWallet = {
      version: "1.2" as const,
      type: "mnemonic" as const,
      curve: KeyCurves.secp256k1,
      meta: { __id__: "current", name: "Current" },
      bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
      crypto: makeCrypto("current-wallet"),
    } as any;
    const staleWallet = {
      ...currentWallet,
      meta: { __id__: "stale", name: "Stale" },
    };

    await kvStore.set("keyring-state:v2", {
      selectedId: "current",
      keyStores: [currentWallet],
    });
    await kvStore.set("key-store", staleWallet);
    await kvStore.set("key-multi-store", [staleWallet]);

    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );

    await keyRing.restore();

    expect(keyRing.getCurrentKeyStore()).toMatchObject({
      meta: { __id__: "current", name: "Stale" },
    });
    expect(await kvStore.get<any>("key-store")).toMatchObject({
      crypto: currentWallet.crypto,
      meta: { __id__: "current", name: "Stale" },
    });
    expect(await kvStore.get<any>("key-multi-store")).toEqual([
      expect.objectContaining({
        crypto: currentWallet.crypto,
        meta: { __id__: "current", name: "Stale" },
      }),
    ]);
  });

  it("keeps usable v2 when edited legacy is invalid and repairs missing selection", async () => {
    const kvStore = new MemoryKVStore(
      "probe-invalid-edited-legacy-with-usable-v2"
    );
    const first = makeWallet("valid-first", "Valid first");
    const second = makeWallet("valid-second", "Valid second");
    const saved = makePersistenceKeyRing(kvStore);
    (saved as any).multiKeyStore = [first, second];
    selectKeyStore(saved, second);
    await saved.save();

    const persisted = await kvStore.get<any>("keyring-state:v2");
    await kvStore.set("keyring-state:v2", {
      ...persisted,
      selectedId: "missing-selection",
    });
    await kvStore.set("key-multi-store", {
      format: "invalid-edited-legacy",
      keyStores: [makeWallet("must-not-win")],
    } as any);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const restored = makePersistenceKeyRing(kvStore);
    await restored.restore();

    expect(restored.getMultiKeyStoreInfo()).toHaveLength(2);
    expect(restored.getCurrentKeyStore()).toMatchObject({
      meta: { __id__: "valid-first", name: "Valid first" },
    });
    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      selectedId: "valid-first",
      keyStores: [first, second],
      legacyMirror: { status: "synced" },
    });
    expect(await kvStore.get<any>("key-multi-store")).toEqual([first, second]);
  });

  it("keeps a successful canonical save when a rollback mirror write fails", async () => {
    const kvStore = new MemoryKVStore("probe-mirror-failure");
    const wallet = {
      version: "1.2" as const,
      type: "mnemonic" as const,
      curve: KeyCurves.secp256k1,
      meta: { __id__: "w3", name: "Wallet 3" },
      bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
      crypto: makeCrypto("mirror-wallet"),
    } as any;
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    (keyRing as any).multiKeyStore = [wallet];
    selectKeyStore(keyRing, wallet);

    const realSet = kvStore.set.bind(kvStore);
    jest
      .spyOn(kvStore, "set")
      .mockImplementation(async (key: any, value: any) => {
        if (key === "key-store") {
          throw new Error("legacy mirror unavailable");
        }
        return realSet(key, value);
      });
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await expect(keyRing.save()).resolves.toBeUndefined();

    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      selectedId: "w3",
      keyStores: [wallet],
      revision: 1,
      legacyMirror: { status: "pending" },
    });
    expect(await kvStore.get<any>("key-multi-store")).toEqual([wallet]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("legacy selected-key rollback mirror"),
      expect.any(Error)
    );
  });

  it("imports wallets added by an older version after rollback", async () => {
    const kvStore = new MemoryKVStore("probe-rollback-reupgrade");
    const current = makeWallet("w1", "Current");
    const addedByOldVersion = makeWallet("w2", "Added after rollback");
    const firstVersion = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    (firstVersion as any).multiKeyStore = [current];
    selectKeyStore(firstVersion, current);
    await firstVersion.save();

    // A rolled-back extension only knows the two legacy keys.
    await kvStore.set("key-multi-store", [current, addedByOldVersion]);
    await kvStore.set("key-store", addedByOldVersion);

    const upgradedAgain = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    await upgradedAgain.restore();

    expect(upgradedAgain.getMultiKeyStoreInfo()).toEqual([
      expect.objectContaining({
        meta: expect.objectContaining({ __id__: "w1" }),
      }),
      expect.objectContaining({
        meta: expect.objectContaining({ __id__: "w2" }),
      }),
    ]);
    expect(upgradedAgain.getCurrentKeyStore()).toMatchObject({
      meta: { __id__: "w2", name: "Added after rollback" },
    });
    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      selectedId: "w2",
      keyStores: [
        { meta: expect.objectContaining({ __id__: "w1" }) },
        { meta: expect.objectContaining({ __id__: "w2" }) },
      ],
      revision: 2,
      legacyMirror: { status: "synced" },
    });
  });

  it("preserves a canonical-only ciphertext when an older version edits legacy", async () => {
    const kvStore = new MemoryKVStore("probe-rollback-canonical-only-loss");
    const canonicalW1 = {
      ...makeWallet("w1", "Original name"),
      crypto: makeCrypto("ciphertext-w1"),
    };
    const canonicalOnlyW2 = {
      ...makeWallet("w2", "Canonical only"),
      crypto: makeCrypto("ciphertext-w2"),
    };
    const keyRing = makePersistenceKeyRing(kvStore);
    (keyRing as any).multiKeyStore = [canonicalW1];
    selectKeyStore(keyRing, canonicalW1);
    await keyRing.save();

    (keyRing as any).multiKeyStore = [canonicalW1, canonicalOnlyW2];
    const realSet = kvStore.set.bind(kvStore);
    let stopBeforeMultiMirror = true;
    jest.spyOn(kvStore, "set").mockImplementation(async (key, value) => {
      if (key === "key-multi-store" && stopBeforeMultiMirror) {
        stopBeforeMultiMirror = false;
        throw new Error("worker stopped before the multi-key legacy mirror");
      }
      await realSet(key, value);
    });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await keyRing.save();
    jest.restoreAllMocks();

    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      keyStores: [canonicalW1, canonicalOnlyW2],
      legacyMirror: { status: "pending" },
    });
    expect(await kvStore.get<any[]>("key-multi-store")).toEqual([canonicalW1]);

    // The rolled-back version only sees w1 and changes user metadata.
    const renamedLegacyW1 = {
      ...canonicalW1,
      meta: { ...canonicalW1.meta, name: "Renamed by old version" },
    };
    await kvStore.set("key-store", renamedLegacyW1);
    await kvStore.set("key-multi-store", [renamedLegacyW1]);

    const upgradedAgain = makePersistenceKeyRing(kvStore);
    await upgradedAgain.restore();
    await upgradedAgain.save();

    expect(upgradedAgain.getMultiKeyStoreInfo()).toHaveLength(2);
    expect(upgradedAgain.getMultiKeyStoreInfo()).toEqual([
      expect.objectContaining({
        meta: expect.objectContaining({
          __id__: "w1",
          name: "Renamed by old version",
        }),
      }),
      expect.objectContaining({
        meta: expect.objectContaining({ __id__: "w2" }),
      }),
    ]);
    expect(
      (await kvStore.get<any>("keyring-state:v2")).keyStores.map(
        (keyStore: any) => keyStore.crypto.ciphertext
      )
    ).toEqual([
      persistedCiphertext("ciphertext-w1"),
      persistedCiphertext("ciphertext-w2"),
    ]);
    expect(
      (await kvStore.get<any[]>("key-multi-store"))?.map(
        (keyStore) => keyStore.crypto.ciphertext
      )
    ).toEqual([
      persistedCiphertext("ciphertext-w1"),
      persistedCiphertext("ciphertext-w2"),
    ]);
  });

  it("does not bind a duplicate-id wallet selection to the first wallet material", async () => {
    const kvStore = new MemoryKVStore("probe-duplicate-id-selection");
    const first = {
      ...makeWallet("duplicate", "First wallet"),
      type: "privateKey" as const,
      bip44HDPath: { account: 1, change: 0, addressIndex: 1 },
      crypto: makeCrypto("ciphertext-first"),
    };
    const second = {
      ...makeWallet("duplicate", "Second wallet"),
      type: "privateKey" as const,
      bip44HDPath: { account: 2, change: 0, addressIndex: 2 },
      crypto: makeCrypto("ciphertext-second"),
    };
    await kvStore.set("keyring-state:v2", {
      selectedId: "duplicate",
      keyStores: [first, second],
    });

    const keyRing = makePersistenceKeyRing(kvStore, {
      getSelectedChain: jest.fn().mockRejectedValue(new Error("no chain")),
    });
    await keyRing.restore();
    const decryptMaterial = jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockImplementation(async (keyStore: any) => ({
        type: "privateKey",
        privateKey: new Uint8Array([
          keyStore.crypto.ciphertext === persistedCiphertext("ciphertext-first")
            ? 11
            : 22,
        ]),
      }));
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await keyRing.unlock("password");
    await keyRing.changeKeyStoreFromMultiKeyStore(1);

    expect(keyRing.getCurrentKeyStore()).toMatchObject({
      crypto: { ciphertext: persistedCiphertext("ciphertext-second") },
      meta: { name: "Second wallet" },
    });
    expect(keyRing.getCurrentKeyStore()?.bip44HDPath).toEqual({
      account: 2,
      change: 0,
      addressIndex: 2,
    });
    expect(Array.from((keyRing as any)._privateKey)).toEqual([22]);
    expect(decryptMaterial).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        crypto: expect.objectContaining({
          ciphertext: persistedCiphertext("ciphertext-second"),
          kdf: "scrypt",
        }),
        meta: expect.objectContaining({ name: "Second wallet" }),
      }),
      "password"
    );
  });

  it("merges rollback state by immutable fingerprint and keeps both one-sided sets", async () => {
    const kvStore = new MultiGetMemoryKVStore();
    const sharedCanonical = {
      ...makeWallet("same-id", "Canonical name"),
      meta: {
        __id__: "same-id",
        name: "Canonical name",
        email: "canonical@example.test",
      },
      crypto: {
        ...makeCrypto("shared-ciphertext"),
        cipherparams: { iv: "01".repeat(16) },
        mac: "04".repeat(32),
      },
    };
    const canonicalOnly = {
      ...makeWallet("collision", "Canonical only"),
      crypto: makeCrypto("canonical-only-ciphertext"),
    };
    const keyRing = makePersistenceKeyRing(kvStore);
    (keyRing as any).multiKeyStore = [sharedCanonical, canonicalOnly];
    selectKeyStore(keyRing, sharedCanonical);
    await keyRing.save();

    const sharedLegacy = {
      ...sharedCanonical,
      meta: {
        ...sharedCanonical.meta,
        __id__: "legacy-different-id",
        name: "Renamed by legacy",
        email: "legacy@example.test",
      },
    };
    const legacyOnly = {
      ...makeWallet("collision", "Legacy only"),
      bip44HDPath: { account: 7, change: 1, addressIndex: 9 },
      crypto: makeCrypto("legacy-only-ciphertext"),
    };
    await kvStore.set("key-store", legacyOnly);
    await kvStore.set("key-multi-store", [sharedLegacy, legacyOnly]);

    const scrypt = jest.fn();
    const decrypt = jest.spyOn(Crypto, "decrypt");
    const restored = makePersistenceKeyRing(kvStore, {}, { scrypt });
    await restored.restore();

    const state = await kvStore.get<any>("keyring-state:v2");
    expect(state.keyStores).toHaveLength(3);
    expect(
      state.keyStores.map((keyStore: any) => keyStore.crypto.ciphertext)
    ).toEqual([
      persistedCiphertext("shared-ciphertext"),
      persistedCiphertext("canonical-only-ciphertext"),
      persistedCiphertext("legacy-only-ciphertext"),
    ]);
    expect(state.keyStores[0].meta).toMatchObject({
      __id__: "same-id",
      name: "Renamed by legacy",
      email: "legacy@example.test",
    });
    expect(state.keyStores[1].meta.__id__).toBe("collision");
    expect(state.keyStores[2].meta.__id__).not.toBe("collision");
    expect(restored.getCurrentKeyStore()).toMatchObject({
      crypto: { ciphertext: persistedCiphertext("legacy-only-ciphertext") },
      meta: { name: "Legacy only" },
      bip44HDPath: { account: 7, change: 1, addressIndex: 9 },
    });
    expect(persistedCryptoPart(state.keyStores[0])).toEqual(
      persistedCryptoPart(sharedCanonical)
    );
    expect(persistedCryptoPart(state.keyStores[1])).toEqual(
      persistedCryptoPart(canonicalOnly)
    );
    expect(persistedCryptoPart(state.keyStores[2])).toEqual(
      persistedCryptoPart(legacyOnly)
    );
    expect(scrypt).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();

    const firstIds = state.keyStores.map(
      (keyStore: any) => keyStore.meta.__id__
    );
    const setSpy = jest.spyOn(kvStore, "set");
    const restoredAgain = makePersistenceKeyRing(kvStore, {}, { scrypt });
    await restoredAgain.restore();
    expect(setSpy).not.toHaveBeenCalled();
    expect(
      (await kvStore.get<any>("keyring-state:v2")).keyStores.map(
        (keyStore: any) => keyStore.meta.__id__
      )
    ).toEqual(firstIds);
  });

  it("repairs the full duplicate-id matrix and advances the allocator", async () => {
    const kvStore = new MemoryKVStore("probe-duplicate-id-matrix");
    const sameCryptoDifferentId = {
      ...makeWallet("different-id", "Same saved record"),
      crypto: makeCrypto("same-record"),
    };
    const canonical = [
      {
        ...sameCryptoDifferentId,
        meta: { __id__: "7", name: "First numeric" },
      },
      {
        ...makeWallet("7", "Second numeric"),
        crypto: makeCrypto("second-numeric"),
      },
      {
        ...makeWallet("wallet", "First nonnumeric"),
        crypto: makeCrypto("first-nonnumeric"),
      },
      {
        ...makeWallet("wallet", "Second nonnumeric"),
        crypto: makeCrypto("second-nonnumeric"),
      },
      {
        ...makeWallet("unused", "Missing id"),
        meta: { name: "Missing id" },
        crypto: makeCrypto("missing-id"),
      },
      {
        ...sameCryptoDifferentId,
        meta: { __id__: "another-id", name: "Duplicate saved record" },
      },
    ];
    await kvStore.set("incrementalNumber", 7);
    await kvStore.set("keyring-state:v2", {
      selectedId: "7",
      keyStores: canonical,
    });

    const keyRing = makePersistenceKeyRing(kvStore);
    await keyRing.restore();
    const repaired = await kvStore.get<any>("keyring-state:v2");
    const ids = repaired.keyStores.map((keyStore: any) => keyStore.meta.__id__);

    expect(repaired.keyStores).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("7");
    expect(ids[2]).toBe("wallet");
    expect(ids.slice(1).filter((id: string) => id !== "wallet")).toEqual([
      "8",
      "9",
      "10",
    ]);
    expect(repaired.selectedId).toBe("7");
    expect(keyRing.getCurrentKeyStore()).toMatchObject({
      crypto: { ciphertext: persistedCiphertext("same-record") },
      meta: { __id__: "7", name: "First numeric" },
    });
    expect(await kvStore.get<number>("incrementalNumber")).toBe(10);

    jest.spyOn(keyRing as any, "decryptKeyStoreToMaterial").mockResolvedValue({
      type: "mnemonic",
      mnemonicMasterSeed: new Uint8Array(32).fill(3),
    });
    jest.spyOn(Crypto, "encrypt").mockImplementation(
      async (
        _crypto,
        kdf,
        type,
        curve,
        _payload,
        _password,
        meta,
        bip44HDPath
      ) =>
        ({
          version: "1.2",
          type,
          curve,
          meta,
          bip44HDPath,
          crypto: { ...makeCrypto("new-wallet-after-repair"), kdf },
        } as any)
    );
    await keyRing.unlock("password");
    await keyRing.addPrivateKey("scrypt", new Uint8Array(32).fill(4), {
      name: "New wallet after repair",
    });
    const afterAdd = await kvStore.get<any>("keyring-state:v2");
    const idsAfterAdd = afterAdd.keyStores.map(
      (keyStore: any) => keyStore.meta.__id__
    );
    expect(idsAfterAdd.slice(0, ids.length)).toEqual(ids);
    expect(idsAfterAdd[idsAfterAdd.length - 1]).toBe("11");
    expect(new Set(idsAfterAdd).size).toBe(idsAfterAdd.length);
    expect(await kvStore.get<number>("incrementalNumber")).toBe(11);

    const secondRestore = makePersistenceKeyRing(kvStore);
    await secondRestore.restore();
    expect(
      (await kvStore.get<any>("keyring-state:v2")).keyStores.map(
        (keyStore: any) => keyStore.meta.__id__
      )
    ).toEqual(idsAfterAdd);
  });

  it("keeps metadata, HD path, address, and material aligned after ID repair and deletion", async () => {
    const kvStore = new MemoryKVStore("probe-repaired-selection-material");
    const first = {
      ...makeWallet("duplicate", "First wallet"),
      type: "privateKey" as const,
      bip44HDPath: { account: 1, change: 0, addressIndex: 1 },
      crypto: makeCrypto("first-material"),
    };
    const second = {
      ...makeWallet("duplicate", "Second wallet"),
      type: "privateKey" as const,
      bip44HDPath: { account: 2, change: 1, addressIndex: 2 },
      crypto: makeCrypto("second-material"),
    };
    await kvStore.set("keyring-state:v2", {
      selectedId: "duplicate",
      keyStores: [first, second],
    });
    const keyRing = makePersistenceKeyRing(kvStore, {
      getSelectedChain: jest.fn().mockRejectedValue(new Error("no chain")),
    });
    await keyRing.restore();
    jest
      .spyOn(keyRing as any, "decryptKeyStoreToMaterial")
      .mockImplementation(async (keyStore: any) => ({
        type: "privateKey",
        privateKey: new Uint8Array(32).fill(
          keyStore.crypto.ciphertext === persistedCiphertext("first-material")
            ? 1
            : 2
        ),
      }));
    jest.spyOn(Crypto, "decrypt").mockResolvedValue(new Uint8Array(32));
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await keyRing.unlock("password");
    const firstAddress = Buffer.from(
      (await keyRing.getKey("chain-1", 118, false)).address
    ).toString("hex");
    await keyRing.changeKeyStoreFromMultiKeyStore(1);
    const secondAddress = Buffer.from(
      (await keyRing.getKey("chain-1", 118, false)).address
    ).toString("hex");

    expect(secondAddress).not.toBe(firstAddress);
    expect(Array.from((keyRing as any)._privateKey)).toEqual(
      Array.from(new Uint8Array(32).fill(2))
    );
    expect(keyRing.getCurrentKeyStore()).toMatchObject({
      meta: { name: "Second wallet" },
      bip44HDPath: { account: 2, change: 1, addressIndex: 2 },
      crypto: { ciphertext: persistedCiphertext("second-material") },
    });

    await keyRing.deleteKeyRing(0, "password");
    expect(keyRing.getMultiKeyStoreInfo()).toHaveLength(1);
    expect(keyRing.getCurrentKeyStore()).toMatchObject({
      meta: { name: "Second wallet" },
      crypto: { ciphertext: persistedCiphertext("second-material") },
    });
    expect(
      Buffer.from(
        (await keyRing.getKey("chain-1", 118, false)).address
      ).toString("hex")
    ).toBe(secondAddress);
    expect(
      (await kvStore.get<any>("keyring-state:v2")).keyStores.map(
        (keyStore: any) => keyStore.crypto.ciphertext
      )
    ).toEqual([persistedCiphertext("second-material")]);
  });

  it.each([
    "before-repaired-v2",
    "after-repaired-v2-pending",
    "after-first-legacy-mirror",
    "before-repaired-v2-synced",
    "after-synced",
  ])("recovers an interrupted ID repair at %s", async (failurePoint) => {
    const kvStore = new MemoryKVStore(`probe-repair-crash-${failurePoint}`);
    const first = {
      ...makeWallet("duplicate", "First"),
      crypto: makeCrypto("repair-first"),
    };
    const second = {
      ...makeWallet("duplicate", "Second"),
      crypto: makeCrypto("repair-second"),
    };
    await kvStore.set("keyring-state:v2", {
      selectedId: "duplicate",
      keyStores: [first, second],
    });
    const realSet = kvStore.set.bind(kvStore);
    let v2Writes = 0;
    let injected = false;
    const setSpy = jest
      .spyOn(kvStore, "set")
      .mockImplementation(async (key: any, value: any) => {
        if (key === "keyring-state:v2") {
          v2Writes += 1;
        }
        const shouldFail =
          !injected &&
          ((failurePoint === "before-repaired-v2" &&
            key === "incrementalNumber") ||
            (failurePoint === "after-repaired-v2-pending" &&
              key === "key-store") ||
            (failurePoint === "after-first-legacy-mirror" &&
              key === "key-multi-store") ||
            (failurePoint === "before-repaired-v2-synced" &&
              key === "keyring-state:v2" &&
              v2Writes === 2));
        if (shouldFail) {
          injected = true;
          throw new Error(`injected repair stop: ${failurePoint}`);
        }
        if (
          failurePoint === "after-repaired-v2-pending" &&
          key === "key-multi-store"
        ) {
          throw new Error(`injected repair stop: ${failurePoint}`);
        }
        await realSet(key, value);
      });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const interrupted = makePersistenceKeyRing(kvStore);
    if (failurePoint === "before-repaired-v2") {
      await expect(interrupted.restore()).rejects.toThrow(
        "injected repair stop"
      );
    } else {
      await expect(interrupted.restore()).resolves.toBeUndefined();
    }
    setSpy.mockRestore();

    const recovered = makePersistenceKeyRing(kvStore);
    await recovered.restore();
    const repaired = await kvStore.get<any>("keyring-state:v2");
    const ids = repaired.keyStores.map((keyStore: any) => keyStore.meta.__id__);
    expect(repaired.keyStores).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(
      repaired.keyStores.map((keyStore: any) => keyStore.crypto.ciphertext)
    ).toEqual([
      persistedCiphertext("repair-first"),
      persistedCiphertext("repair-second"),
    ]);
    expect(repaired.selectedId).toBe(ids[0]);
    expect(repaired.legacyMirror).toMatchObject({ status: "synced" });
    expect(await kvStore.get<any>("key-multi-store")).toEqual(
      repaired.keyStores
    );

    const stable = makePersistenceKeyRing(kvStore);
    const stableSetSpy = jest.spyOn(kvStore, "set");
    await stable.restore();
    expect(stableSetSpy).not.toHaveBeenCalled();
    expect(
      (await kvStore.get<any>("keyring-state:v2")).keyStores.map(
        (keyStore: any) => keyStore.meta.__id__
      )
    ).toEqual(ids);
  });

  it("preserves a wallet from a partial legacy add", async () => {
    const kvStore = new MemoryKVStore("probe-partial-legacy-add");
    const current = makeWallet("w1", "Current");
    const selectedOnly = makeWallet("w2", "Selected-only legacy wallet");
    const firstVersion = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    (firstVersion as any).multiKeyStore = [current];
    selectKeyStore(firstVersion, current);
    await firstVersion.save();

    // Simulate an older worker stopping after key-store but before
    // key-multi-store. The selected wallet is still the only recoverable copy.
    await kvStore.set("key-store", selectedOnly);

    const upgradedAgain = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    await upgradedAgain.restore();

    expect(upgradedAgain.getMultiKeyStoreInfo()).toEqual([
      expect.objectContaining({
        meta: expect.objectContaining({ __id__: "w1" }),
      }),
      expect.objectContaining({
        meta: expect.objectContaining({ __id__: "w2" }),
      }),
    ]);
    expect(upgradedAgain.getCurrentKeyStore()).toMatchObject({
      meta: { __id__: "w2", name: "Selected-only legacy wallet" },
    });
  });

  it("keeps v2 when the worker stops between the two legacy mirror writes", async () => {
    const kvStore = new MemoryKVStore("probe-partial-rollback-mirror");
    const current = makeWallet("w1", "Current");
    const added = makeWallet("w2", "New generation");
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    (keyRing as any).multiKeyStore = [current];
    selectKeyStore(keyRing, current);
    await keyRing.save();

    (keyRing as any).multiKeyStore = [current, added];
    selectKeyStore(keyRing, added);
    const realSet = kvStore.set.bind(kvStore);
    let failMultiOnce = true;
    const setSpy = jest
      .spyOn(kvStore, "set")
      .mockImplementation(async (key: any, value: any) => {
        if (key === "key-multi-store" && failMultiOnce) {
          failMultiOnce = false;
          throw new Error("worker stopped during mirror");
        }
        return realSet(key, value);
      });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(keyRing.save()).resolves.toBeUndefined();
    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      selectedId: "w2",
      keyStores: [current, added],
      revision: 2,
      legacyMirror: { status: "pending" },
    });
    expect(await kvStore.get<any>("key-store")).toEqual(added);
    expect(await kvStore.get<any>("key-multi-store")).toEqual([current]);
    setSpy.mockRestore();

    const afterRestart = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    await afterRestart.restore();

    expect(afterRestart.getMultiKeyStoreInfo()).toHaveLength(2);
    expect(afterRestart.getCurrentKeyStore()).toMatchObject({
      meta: { __id__: "w2" },
    });
    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      selectedId: "w2",
      keyStores: [current, added],
      revision: 3,
      legacyMirror: { status: "synced" },
    });
    expect(await kvStore.get<any>("key-multi-store")).toEqual([current, added]);
  });

  it("serializes v2 generations so an older finalize cannot win", async () => {
    const kvStore = new MemoryKVStore("probe-persistence-generation-order");
    const firstWallet = makeWallet("w1", "First");
    const secondWallet = makeWallet("w2", "Second");
    const keyRing = createTrackedKeyRing(
      [],
      kvStore,
      {} as any,
      {} as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any,
      {} as any
    );
    (keyRing as any).multiKeyStore = [firstWallet];
    selectKeyStore(keyRing, firstWallet);

    const realSet = kvStore.set.bind(kvStore);
    let releaseFirstMirror!: () => void;
    let markFirstMirrorStarted!: () => void;
    const firstMirrorGate = new Promise<void>((resolve) => {
      releaseFirstMirror = resolve;
    });
    const firstMirrorStarted = new Promise<void>((resolve) => {
      markFirstMirrorStarted = resolve;
    });
    let holdFirstSelectedMirror = true;
    jest
      .spyOn(kvStore, "set")
      .mockImplementation(async (key: any, value: any) => {
        if (key === "key-store" && holdFirstSelectedMirror) {
          holdFirstSelectedMirror = false;
          markFirstMirrorStarted();
          await firstMirrorGate;
        }
        return realSet(key, value);
      });

    const firstSave = keyRing.save();
    await firstMirrorStarted;
    (keyRing as any).multiKeyStore = [firstWallet, secondWallet];
    selectKeyStore(keyRing, secondWallet);
    const secondSave = keyRing.save();

    releaseFirstMirror();
    await Promise.all([firstSave, secondSave]);

    expect(await kvStore.get<any>("keyring-state:v2")).toMatchObject({
      selectedId: "w2",
      keyStores: [firstWallet, secondWallet],
      revision: 2,
      legacyMirror: { status: "synced" },
    });
    expect(await kvStore.get<any>("key-store")).toEqual(secondWallet);
    expect(await kvStore.get<any>("key-multi-store")).toEqual([
      firstWallet,
      secondWallet,
    ]);
  });
});
