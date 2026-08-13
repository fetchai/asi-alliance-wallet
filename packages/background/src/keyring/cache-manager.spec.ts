import { MemoryKVStore } from "@keplr-wallet/common";
import { AddressCacheManager } from "./cache-manager";
import { Crypto } from "./crypto";

describe("AddressCacheManager security", () => {
  const mockCrypto = {
    rng: async (array: Uint8Array) => {
      array.fill(7);
      return array;
    },
    scrypt: async () => new Uint8Array(32),
  } as any;

  function mockReversibleCacheBlobCrypto(): void {
    jest.spyOn(Crypto, "encryptBlob").mockImplementation(
      async (_crypto, _kdf, data) =>
        ({
          version: "1.0",
          crypto: {
            cipher: "aes-128-ctr",
            cipherparams: { iv: "a".repeat(32) },
            kdf: "scrypt",
            kdfparams: { salt: "b".repeat(64) },
            ciphertext: Buffer.from(data).toString("hex"),
            mac: "c".repeat(64),
          },
        } as any)
    );
    jest
      .spyOn(Crypto, "decryptBlob")
      .mockImplementation(async (_crypto, data) =>
        Buffer.from((data as any).crypto.ciphertext, "hex")
      );
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("fails closed when cache encryption throws", async () => {
    const kvStore = new MemoryKVStore("cache-manager-fail-closed");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });

    jest
      .spyOn(Crypto, "encryptBlob")
      .mockRejectedValue(new Error("simulated-encryption-error"));

    await expect(
      manager.saveCardanoCache("cardano-mainnet", {
        wallet1: { address: "addr1...", pubKey: "pub1" },
      })
    ).rejects.toThrow("Failed to encrypt Cardano cache");

    const cacheValue = await kvStore.get("cardano_addr_cache:cardano-mainnet");
    const failureValue = await kvStore.get(
      "cache_encryption_failed:cardano:cardano-mainnet"
    );

    expect(cacheValue).toBeUndefined();
    expect(failureValue).toContain("simulated-encryption-error");
  });

  it("does not release a running operation when a waiter times out", async () => {
    const kvStore = new MemoryKVStore("cache-manager-lock-timeout");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });
    const originalTimeout = (AddressCacheManager as any).LOCK_TIMEOUT_MS;
    (AddressCacheManager as any).LOCK_TIMEOUT_MS = 50;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const thirdOperation = jest.fn().mockResolvedValue("third");
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    try {
      const first = (manager as any).withLock("generic:test", async () => {
        await firstGate;
        return "first";
      });
      await Promise.resolve();

      const second = (manager as any).withLock(
        "generic:test",
        async () => "second"
      );
      await expect(second).rejects.toThrow("Lock timeout waiting");
      expect(warnSpy).toHaveBeenCalledWith(
        "[AddressCacheManager] Cache lock wait timed out",
        { lockKey: "generic:test", timeoutMs: 50 }
      );

      const third = (manager as any).withLock("generic:test", thirdOperation);
      await Promise.resolve();
      expect(thirdOperation).not.toHaveBeenCalled();

      releaseFirst();
      await expect(first).resolves.toBe("first");
      await expect(third).resolves.toBe("third");
    } finally {
      (AddressCacheManager as any).LOCK_TIMEOUT_MS = originalTimeout;
    }
  });

  it("does not retry a background lock acquisition timeout", async () => {
    const kvStore = new MemoryKVStore("cache-manager-lock-no-retry");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });
    const originalTimeout = (AddressCacheManager as any).LOCK_TIMEOUT_MS;
    (AddressCacheManager as any).LOCK_TIMEOUT_MS = 10;
    let releaseLock!: () => void;
    const lockGate = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const heldLock = (manager as any).withLock(
      "generic:test",
      async () => await lockGate
    );
    await Promise.resolve();
    const withLockSpy = jest.spyOn(manager as any, "withLock");
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    try {
      await expect(
        manager.loadGenericCache("test", { scryptPriority: "background" })
      ).rejects.toThrow("Lock timeout waiting");
      expect(withLockSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        "[AddressCacheManager] Cache lock wait timed out",
        { lockKey: "generic:test", timeoutMs: 10 }
      );
    } finally {
      releaseLock();
      await heldLock;
      (AddressCacheManager as any).LOCK_TIMEOUT_MS = originalTimeout;
    }
  });

  it("does not let a background lock block an interactive legacy decrypt", async () => {
    const kvStore = new MemoryKVStore(
      "cache-manager-interactive-legacy-lock-bypass"
    );
    const scryptSpy = jest.spyOn(mockCrypto, "scrypt");
    const legacyBlob = await Crypto.encryptBlob(
      mockCrypto,
      "scrypt",
      JSON.stringify({ current: { address: "legacy-address" } }),
      "test-password",
      { cacheType: "address_cache" },
      { priority: "background" }
    );
    scryptSpy.mockClear();
    await kvStore.set("addr_cache:legacy-chain", JSON.stringify(legacyBlob));

    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });
    let releaseBackground!: () => void;
    let markBackgroundStarted!: () => void;
    const backgroundGate = new Promise<void>((resolve) => {
      releaseBackground = resolve;
    });
    const backgroundStarted = new Promise<void>((resolve) => {
      markBackgroundStarted = resolve;
    });
    const heldLock = (manager as any).withLock(
      "generic:legacy-chain",
      async () => {
        markBackgroundStarted();
        await backgroundGate;
      }
    );
    await backgroundStarted;

    try {
      await expect(manager.loadGenericCache("legacy-chain")).resolves.toEqual({
        current: { address: "legacy-address" },
      });
      expect(scryptSpy).toHaveBeenCalledTimes(1);
      expect(scryptSpy.mock.calls[0][1]).toMatchObject({
        salt: legacyBlob.crypto.kdfparams.salt,
        executionPriority: "interactive",
      });
    } finally {
      releaseBackground();
      await heldLock;
    }
  });

  it("does not let a cache write lock block a consistency read", async () => {
    const kvStore = new MemoryKVStore("cache-manager-consistency-lock-bypass");
    const scryptSpy = jest.spyOn(mockCrypto, "scrypt");
    const legacyBlob = await Crypto.encryptBlob(
      mockCrypto,
      "scrypt",
      JSON.stringify({ current: { address: "legacy-address" } }),
      "test-password",
      { cacheType: "address_cache" },
      { priority: "background" }
    );
    scryptSpy.mockClear();
    await kvStore.set("addr_cache:legacy-chain", JSON.stringify(legacyBlob));

    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });
    let releaseWrite!: () => void;
    let markWriteStarted!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve;
    });
    const heldLock = (manager as any).withLock(
      "generic:legacy-chain",
      async () => {
        markWriteStarted();
        await writeGate;
      }
    );
    await writeStarted;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const outcome = await Promise.race([
        manager.checkConsistency(
          "legacy-chain",
          ["current"],
          "current",
          "legacy-address",
          false
        ),
        new Promise<"blocked">((resolve) => {
          timeout = setTimeout(() => resolve("blocked"), 100);
        }),
      ]);

      expect(outcome).toEqual({ isConsistent: true, issues: [] });
      expect(scryptSpy).toHaveBeenCalledTimes(1);
      expect(scryptSpy.mock.calls[0][1]).toMatchObject({
        salt: legacyBlob.crypto.kdfparams.salt,
        executionPriority: "background",
      });
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      releaseWrite();
      await heldLock;
    }
  });

  it("migrates plaintext caches to encrypted format without plaintext backups", async () => {
    const kvStore = new MemoryKVStore("cache-manager-migration");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-mainnet", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });

    const cardanoPlain = {
      wallet1: { address: "addr1...", pubKey: "pub1" },
    };
    const genericPlain = {
      wallet1: {
        address: "cosmos1...",
        name: "Wallet 1",
        pubKey: "pub2",
        mnemonicLength: "24",
      },
    };
    const expectedGeneric = {
      wallet1: {
        address: "cosmos1...",
        name: "Wallet 1",
        pubKey: "pub2",
      },
    };

    await kvStore.set(
      "cardano_addr_cache:cardano-mainnet",
      cardanoPlain as any
    );
    await kvStore.set("addr_cache:cosmoshub-4", genericPlain as any);

    jest
      .spyOn(Crypto, "encryptBlob")
      .mockImplementation(async (_c, _k, data) => {
        return {
          version: "1.0",
          crypto: {
            cipher: "aes-128-ctr",
            cipherparams: { iv: "a".repeat(32) },
            kdf: "scrypt",
            kdfparams: { salt: "b".repeat(32) },
            ciphertext: Buffer.from(data).toString("hex"),
            mac: "c".repeat(64),
          },
        } as any;
      });

    jest.spyOn(Crypto, "decryptBlob").mockImplementation(async (_c, data) => {
      const ciphertext = (data as any).crypto?.ciphertext;
      return Buffer.from(ciphertext, "hex");
    });

    await manager.migrateToEncrypted();

    const migratedCardano = await kvStore.get(
      "cardano_addr_cache:cardano-mainnet"
    );
    const migratedGeneric = await kvStore.get("addr_cache:cosmoshub-4");
    const cardanoBackup = await kvStore.get(
      "cardano_addr_cache:backup_v1:cardano-mainnet"
    );
    const genericBackup = await kvStore.get("addr_cache:backup_v1:cosmoshub-4");

    expect(typeof migratedCardano).toBe("string");
    expect(typeof migratedGeneric).toBe("string");
    expect(cardanoBackup).toBeUndefined();
    expect(genericBackup).toBeUndefined();
    expect(await manager.loadCardanoCache("cardano-mainnet")).toEqual(
      cardanoPlain
    );
    expect(await manager.loadGenericCache("cosmoshub-4")).toEqual(
      expectedGeneric
    );
  });

  it("does not migrate malformed string blobs as plaintext caches", async () => {
    const kvStore = new MemoryKVStore("cache-manager-malformed-migration");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });
    await kvStore.set("cardano_addr_cache:cardano-preview", "abc");
    await kvStore.set("addr_cache:cosmoshub-4", "def");
    const encryptSpy = jest.spyOn(Crypto, "encryptBlob");

    await manager.migrateToEncrypted();

    expect(encryptSpy).not.toHaveBeenCalled();
    await expect(
      kvStore.get("cardano_addr_cache:cardano-preview")
    ).resolves.toBe("abc");
    await expect(kvStore.get("addr_cache:cosmoshub-4")).resolves.toBe("def");
  });

  it("serializes legacy migration with concurrent cache writes", async () => {
    const kvStore = new MemoryKVStore("cache-manager-migration-lock");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [{ chainId: "cosmoshub-4", features: [] }],
    });
    const legacy = { wallet1: { address: "legacy" } };
    const fresh = { wallet1: { address: "fresh" } };
    await kvStore.set("addr_cache:cosmoshub-4", legacy as any);

    let releaseMigrationEncrypt!: () => void;
    let markMigrationEncryptStarted!: () => void;
    const migrationEncryptGate = new Promise<void>((resolve) => {
      releaseMigrationEncrypt = resolve;
    });
    const migrationEncryptStarted = new Promise<void>((resolve) => {
      markMigrationEncryptStarted = resolve;
    });
    let encryptCount = 0;

    jest
      .spyOn(Crypto, "encryptBlob")
      .mockImplementation(async (_c, _k, data) => {
        encryptCount += 1;
        if (encryptCount === 1) {
          markMigrationEncryptStarted();
          await migrationEncryptGate;
        }
        return {
          version: "1.0",
          crypto: {
            cipher: "aes-128-ctr",
            cipherparams: { iv: "a".repeat(32) },
            kdf: "scrypt",
            kdfparams: { salt: "b".repeat(32) },
            ciphertext: Buffer.from(data).toString("hex"),
            mac: "c".repeat(64),
          },
        } as any;
      });
    jest.spyOn(Crypto, "decryptBlob").mockImplementation(async (_c, data) => {
      return Buffer.from((data as any).crypto.ciphertext, "hex");
    });

    const migration = manager.migrateToEncrypted();
    await migrationEncryptStarted;
    const concurrentSave = manager.saveGenericCache("cosmoshub-4", fresh);

    releaseMigrationEncrypt();
    await Promise.all([migration, concurrentSave]);

    await expect(manager.loadGenericCache("cosmoshub-4")).resolves.toEqual(
      fresh
    );
  });

  it("validates migrated caches after applying deleted-wallet tombstones", async () => {
    const kvStore = new MemoryKVStore("cache-manager-migration-tombstones");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });

    // Establish the same session state as a deletion that happens before
    // background migration reaches these legacy caches.
    await manager.removeWalletFromAllCaches("deleted");
    (manager as any).embedChainInfos = [
      { chainId: "cardano-preview", features: ["cardano"] },
      { chainId: "cosmoshub-4", features: [] },
    ];
    await kvStore.set("cardano_addr_cache:cardano-preview", {
      current: { address: "addr-current", pubKey: "pub-current" },
      deleted: { address: "addr-deleted", pubKey: "pub-deleted" },
    } as any);
    await kvStore.set("addr_cache:cosmoshub-4", {
      current: { address: "cosmos-current", name: "Current" },
      deleted: { address: "cosmos-deleted", name: "Deleted" },
    } as any);

    jest.spyOn(Crypto, "encryptBlob").mockImplementation(
      async (_c, _k, data) =>
        ({
          version: "1.0",
          crypto: {
            cipher: "aes-128-ctr",
            cipherparams: { iv: "a".repeat(32) },
            kdf: "scrypt",
            kdfparams: { salt: "b".repeat(64) },
            ciphertext: Buffer.from(data).toString("hex"),
            mac: "c".repeat(64),
          },
        } as any)
    );
    jest.spyOn(Crypto, "decryptBlob").mockImplementation(async (_c, data) => {
      return Buffer.from((data as any).crypto.ciphertext, "hex");
    });

    await expect(manager.migrateToEncrypted()).resolves.toBeUndefined();
    await expect(manager.loadCardanoCache("cardano-preview")).resolves.toEqual({
      current: { address: "addr-current", pubKey: "pub-current" },
    });
    await expect(manager.loadGenericCache("cosmoshub-4")).resolves.toEqual({
      current: { address: "cosmos-current", name: "Current" },
    });
    await expect(
      kvStore.get("cache_migration_review_needed:cardano-preview")
    ).resolves.toBeUndefined();
    await expect(
      kvStore.get("cache_migration_review_needed:cosmoshub-4")
    ).resolves.toBeUndefined();
  });

  it("propagates migration failures to the unlock maintenance caller", async () => {
    const kvStore = new MemoryKVStore("cache-manager-migration-error");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [{ chainId: "cosmoshub-4", features: [] }],
    });
    await kvStore.set("addr_cache:cosmoshub-4", {
      wallet1: { address: "legacy" },
    } as any);
    jest
      .spyOn(Crypto, "encryptBlob")
      .mockRejectedValue(new Error("migration-encryption-failed"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(manager.migrateToEncrypted()).rejects.toThrow(
      "migration-encryption-failed"
    );
  });

  it("removes only the deleted wallet from persistent chain caches", async () => {
    const kvStore = new MemoryKVStore("cache-manager-wallet-removal");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });
    await kvStore.set("cardano_addr_cache:cardano-preview", {
      current: { address: "addr-current", pubKey: "pub-current" },
      deleted: { address: "addr-deleted", pubKey: "pub-deleted" },
    } as any);
    await kvStore.set("addr_cache:cosmoshub-4", {
      current: { address: "cosmos-current", name: "Current" },
      deleted: { address: "cosmos-deleted", name: "Deleted" },
    } as any);
    jest.spyOn(Crypto, "encryptBlob").mockImplementation(
      async (_c, _k, data) =>
        ({
          version: "1.0",
          crypto: {
            cipher: "aes-128-ctr",
            cipherparams: { iv: "a".repeat(32) },
            kdf: "scrypt",
            kdfparams: { salt: "b".repeat(32) },
            ciphertext: Buffer.from(data).toString("hex"),
            mac: "c".repeat(64),
          },
        } as any)
    );
    jest.spyOn(Crypto, "decryptBlob").mockImplementation(async (_c, data) => {
      return Buffer.from((data as any).crypto.ciphertext, "hex");
    });

    const staleCardanoSnapshot = await manager.loadCardanoCache(
      "cardano-preview"
    );
    const staleGenericSnapshot = await manager.loadGenericCache("cosmoshub-4");

    await manager.removeWalletFromAllCaches("deleted");

    // A save that started from a snapshot captured before removal must not
    // resurrect the deleted wallet.
    await manager.saveCardanoCache("cardano-preview", staleCardanoSnapshot);
    await manager.saveGenericCache("cosmoshub-4", staleGenericSnapshot);

    await expect(manager.loadCardanoCache("cardano-preview")).resolves.toEqual({
      current: { address: "addr-current", pubKey: "pub-current" },
    });
    await expect(manager.loadGenericCache("cosmoshub-4")).resolves.toEqual({
      current: { address: "cosmos-current", name: "Current" },
    });
  });

  it("full-clears every known cache without a password or cache crypto", async () => {
    const kvStore = new MemoryKVStore("cache-manager-last-wallet-clear");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });
    const staleCardanoSnapshot = {
      deleted: { address: "addr-deleted", pubKey: "pub-deleted" },
    };
    const staleGenericSnapshot = {
      deleted: { address: "cosmos-deleted", name: "Deleted" },
    };
    await kvStore.set(
      "cardano_addr_cache:cardano-preview",
      staleCardanoSnapshot as any
    );
    await kvStore.set("addr_cache:cosmoshub-4", staleGenericSnapshot as any);

    const realSet = kvStore.set.bind(kvStore);
    let releaseClear!: () => void;
    let markClearStarted!: () => void;
    const clearGate = new Promise<void>((resolve) => {
      releaseClear = resolve;
    });
    const clearStarted = new Promise<void>((resolve) => {
      markClearStarted = resolve;
    });
    let blockedClearWrites = 0;
    jest.spyOn(kvStore, "set").mockImplementation(async (key, value) => {
      if (
        value === null &&
        (key === "cardano_addr_cache:cardano-preview" ||
          key === "addr_cache:cosmoshub-4")
      ) {
        blockedClearWrites += 1;
        markClearStarted();
        await clearGate;
      }
      await realSet(key, value);
    });
    const decryptBlobSpy = jest.spyOn(Crypto, "decryptBlob");
    const scryptSpy = jest.spyOn(mockCrypto, "scrypt");

    const removal = manager.removeWalletFromAllCaches("deleted", {
      mode: "full-clear",
    });

    try {
      // The tombstone is visible synchronously, before either KV write starts.
      expect((manager as any).deletedWalletIds.has("deleted")).toBe(true);
      manager.setPassword("");
      await clearStarted;
      expect(blockedClearWrites).toBe(2);
      expect(decryptBlobSpy).not.toHaveBeenCalled();
      expect(scryptSpy).not.toHaveBeenCalled();
    } finally {
      releaseClear();
    }

    await removal;
    await expect(
      kvStore.get("cardano_addr_cache:cardano-preview")
    ).resolves.toBeNull();
    await expect(kvStore.get("addr_cache:cosmoshub-4")).resolves.toBeNull();

    // A stale snapshot from before deletion remains filtered in a new session.
    mockReversibleCacheBlobCrypto();
    manager.setPassword("new-password");
    await manager.saveCardanoCache("cardano-preview", staleCardanoSnapshot);
    await manager.saveGenericCache("cosmoshub-4", staleGenericSnapshot);
    await expect(manager.loadCardanoCache("cardano-preview")).resolves.toEqual(
      {}
    );
    await expect(manager.loadGenericCache("cosmoshub-4")).resolves.toEqual({});
  });

  it("preserves every generic cache blob when cleanup is interrupted by lock", async () => {
    const kvStore = new MemoryKVStore("cache-manager-generic-lock-removal");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "generic-first", features: [] },
        { chainId: "generic-second", features: [] },
      ],
    });
    mockReversibleCacheBlobCrypto();
    await manager.saveGenericCache("generic-first", {
      retained: { address: "first-retained", name: "Retained" },
      deleted: { address: "first-deleted", name: "Deleted" },
    });
    await manager.saveGenericCache("generic-second", {
      retained: { address: "second-retained", name: "Retained" },
      deleted: { address: "second-deleted", name: "Deleted" },
    });
    const secondBefore = await kvStore.get("addr_cache:generic-second");

    const originalLoad = (manager as any)._loadGenericCacheUnsafe.bind(manager);
    let releaseSecond!: () => void;
    let markSecondStarted!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const secondStarted = new Promise<void>((resolve) => {
      markSecondStarted = resolve;
    });
    jest
      .spyOn(manager as any, "_loadGenericCacheUnsafe")
      .mockImplementation(async (...args: unknown[]) => {
        const [chainId, options] = args as [string, any];
        if (chainId === "generic-second" && options.throwOnDecryptFailure) {
          markSecondStarted();
          await secondGate;
        }
        return originalLoad(chainId, options);
      });

    const removal = manager.removeWalletFromAllCaches("deleted");
    await secondStarted;
    manager.setPassword("");
    releaseSecond();
    await removal;

    expect(await kvStore.get("addr_cache:generic-first")).not.toBeNull();
    expect(await kvStore.get("addr_cache:generic-second")).toEqual(
      secondBefore
    );
    manager.setPassword("test-password");
    await expect(manager.loadGenericCache("generic-first")).resolves.toEqual({
      retained: { address: "first-retained", name: "Retained" },
    });
    await expect(
      manager.loadGenericCache("generic-second")
    ).resolves.toMatchObject({
      retained: { address: "second-retained", name: "Retained" },
    });
  });

  it("preserves every Cardano cache blob when cleanup is interrupted by lock", async () => {
    const kvStore = new MemoryKVStore("cache-manager-cardano-lock-removal");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-first", features: ["cardano"] },
        { chainId: "cardano-second", features: ["cardano"] },
      ],
    });
    mockReversibleCacheBlobCrypto();
    await manager.saveCardanoCache("cardano-first", {
      retained: { address: "first-retained", pubKey: "first-pub" },
      deleted: { address: "first-deleted", pubKey: "deleted-pub" },
    });
    await manager.saveCardanoCache("cardano-second", {
      retained: { address: "second-retained", pubKey: "second-pub" },
      deleted: { address: "second-deleted", pubKey: "deleted-pub" },
    });
    const secondBefore = await kvStore.get("cardano_addr_cache:cardano-second");

    const originalLoad = (manager as any)._loadCardanoCacheUnsafe.bind(manager);
    let releaseSecond!: () => void;
    let markSecondStarted!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const secondStarted = new Promise<void>((resolve) => {
      markSecondStarted = resolve;
    });
    jest
      .spyOn(manager as any, "_loadCardanoCacheUnsafe")
      .mockImplementation(async (...args: unknown[]) => {
        const [chainId, options] = args as [string, any];
        if (chainId === "cardano-second" && options.throwOnDecryptFailure) {
          markSecondStarted();
          await secondGate;
        }
        return originalLoad(chainId, options);
      });

    const removal = manager.removeWalletFromAllCaches("deleted");
    await secondStarted;
    manager.setPassword("");
    releaseSecond();
    await removal;

    expect(
      await kvStore.get("cardano_addr_cache:cardano-first")
    ).not.toBeNull();
    expect(await kvStore.get("cardano_addr_cache:cardano-second")).toEqual(
      secondBefore
    );
    manager.setPassword("test-password");
    await expect(manager.loadCardanoCache("cardano-first")).resolves.toEqual({
      retained: { address: "first-retained", pubKey: "first-pub" },
    });
    await expect(
      manager.loadCardanoCache("cardano-second")
    ).resolves.toMatchObject({
      retained: { address: "second-retained", pubKey: "second-pub" },
    });
  });

  it("does not apply destructive fallback to later mixed caches after lock", async () => {
    const kvStore = new MemoryKVStore("cache-manager-mixed-lock-removal");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "generic-first", features: [] },
        { chainId: "cardano-middle", features: ["cardano"] },
        { chainId: "generic-last", features: [] },
      ],
    });
    mockReversibleCacheBlobCrypto();
    await manager.saveGenericCache("generic-first", {
      retained: { address: "first-retained" },
      deleted: { address: "first-deleted" },
    });
    await manager.saveCardanoCache("cardano-middle", {
      retained: { address: "middle-retained", pubKey: "middle-pub" },
      deleted: { address: "middle-deleted", pubKey: "deleted-pub" },
    });
    await manager.saveGenericCache("generic-last", {
      retained: { address: "last-retained" },
      deleted: { address: "last-deleted" },
    });
    const middleBefore = await kvStore.get("cardano_addr_cache:cardano-middle");
    const lastBefore = await kvStore.get("addr_cache:generic-last");

    const originalLoad = (manager as any)._loadCardanoCacheUnsafe.bind(manager);
    let releaseMiddle!: () => void;
    let markMiddleStarted!: () => void;
    const middleGate = new Promise<void>((resolve) => {
      releaseMiddle = resolve;
    });
    const middleStarted = new Promise<void>((resolve) => {
      markMiddleStarted = resolve;
    });
    jest
      .spyOn(manager as any, "_loadCardanoCacheUnsafe")
      .mockImplementation(async (...args: unknown[]) => {
        const [chainId, options] = args as [string, any];
        if (chainId === "cardano-middle" && options.throwOnDecryptFailure) {
          markMiddleStarted();
          await middleGate;
        }
        return originalLoad(chainId, options);
      });

    const removal = manager.removeWalletFromAllCaches("deleted");
    await middleStarted;
    manager.setPassword("");
    releaseMiddle();
    await removal;

    expect(await kvStore.get("addr_cache:generic-first")).not.toBeNull();
    expect(await kvStore.get("cardano_addr_cache:cardano-middle")).toEqual(
      middleBefore
    );
    expect(await kvStore.get("addr_cache:generic-last")).toEqual(lastBefore);
    manager.setPassword("test-password");
    await expect(manager.loadGenericCache("generic-first")).resolves.toEqual({
      retained: { address: "first-retained" },
    });
    await expect(
      manager.loadCardanoCache("cardano-middle")
    ).resolves.toMatchObject({
      retained: { address: "middle-retained", pubKey: "middle-pub" },
    });
    await expect(
      manager.loadGenericCache("generic-last")
    ).resolves.toMatchObject({
      retained: { address: "last-retained" },
    });
  });

  it("deletes an unreadable cache blob while removing a wallet", async () => {
    const kvStore = new MemoryKVStore("cache-manager-corrupt-removal");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });
    const unreadableBlob = JSON.stringify({
      version: "1.0",
      crypto: {
        cipher: "aes-128-ctr",
        cipherparams: { iv: "a".repeat(32) },
        kdf: "scrypt",
        kdfparams: { salt: "b".repeat(64) },
        ciphertext: "00",
        mac: "c".repeat(64),
      },
    });
    await kvStore.set("cardano_addr_cache:cardano-preview", unreadableBlob);
    await kvStore.set("addr_cache:cosmoshub-4", unreadableBlob);
    jest
      .spyOn(Crypto, "decryptBlob")
      .mockRejectedValue(new Error("corrupt cache blob"));

    await manager.removeWalletFromAllCaches("deleted");

    await expect(
      kvStore.get("cardano_addr_cache:cardano-preview")
    ).resolves.toBeNull();
    await expect(kvStore.get("addr_cache:cosmoshub-4")).resolves.toBeNull();
  });

  it("does not delete cache blobs on transient scrypt inactivity timeout", async () => {
    const kvStore = new MemoryKVStore("cache-manager-transient-scrypt-removal");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });
    const readableBlob = JSON.stringify({
      version: "1.0",
      crypto: {
        cipher: "aes-128-ctr",
        cipherparams: { iv: "a".repeat(32) },
        kdf: "scrypt",
        kdfparams: { salt: "b".repeat(64) },
        ciphertext: "00",
        mac: "c".repeat(64),
      },
      meta: { cacheType: "address_cache" },
    });
    await kvStore.set("cardano_addr_cache:cardano-preview", readableBlob);
    await kvStore.set("addr_cache:cosmoshub-4", readableBlob);

    // Message has no "timeout" word — classification must use error name.
    const timeout = new Error("Scrypt operation made no progress for 30000ms");
    timeout.name = "ScryptInactivityTimeoutError";
    const decryptSpy = jest
      .spyOn(Crypto, "decryptBlob")
      .mockRejectedValue(timeout);

    await manager.removeWalletFromAllCaches("deleted");

    // Two chains × withRetry (2 attempts) after continue-on-exhausted-transient.
    expect(decryptSpy.mock.calls.length).toBe(4);
    await expect(
      kvStore.get("cardano_addr_cache:cardano-preview")
    ).resolves.toBe(readableBlob);
    await expect(kvStore.get("addr_cache:cosmoshub-4")).resolves.toBe(
      readableBlob
    );
  });

  it("continues cleanup on later chains after exhausted transient timeout", async () => {
    const kvStore = new MemoryKVStore(
      "cache-manager-transient-continue-other-chains"
    );
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });
    mockReversibleCacheBlobCrypto();
    await manager.saveCardanoCache("cardano-preview", {
      retained: { address: "cardano-retained", pubKey: "pub" },
      deleted: { address: "cardano-deleted", pubKey: "del" },
    });
    await manager.saveGenericCache("cosmoshub-4", {
      retained: { address: "generic-retained", name: "Retained" },
      deleted: { address: "generic-deleted", name: "Deleted" },
    });
    const cardanoBefore = await kvStore.get(
      "cardano_addr_cache:cardano-preview"
    );

    let cardanoAttempts = 0;
    jest.spyOn(Crypto, "decryptBlob").mockImplementation(async (_c, data) => {
      const plaintext = Buffer.from(
        (data as any).crypto.ciphertext,
        "hex"
      ).toString("utf8");
      if (plaintext.includes("cardano-retained")) {
        cardanoAttempts += 1;
        const err = new Error("Scrypt operation made no progress for 30000ms");
        err.name = "ScryptInactivityTimeoutError";
        throw err;
      }
      return Buffer.from((data as any).crypto.ciphertext, "hex");
    });

    await manager.removeWalletFromAllCaches("deleted");

    expect(cardanoAttempts).toBe(2);
    await expect(
      kvStore.get("cardano_addr_cache:cardano-preview")
    ).resolves.toEqual(cardanoBefore);
    mockReversibleCacheBlobCrypto();
    await expect(manager.loadGenericCache("cosmoshub-4")).resolves.toEqual({
      retained: { address: "generic-retained", name: "Retained" },
    });
  });

  it("continues cleanup on later chains when the save path times out", async () => {
    const kvStore = new MemoryKVStore("cache-manager-transient-save-continue");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });
    mockReversibleCacheBlobCrypto();
    await manager.saveCardanoCache("cardano-preview", {
      retained: { address: "cardano-retained", pubKey: "pub" },
      deleted: { address: "cardano-deleted", pubKey: "del" },
    });
    await manager.saveGenericCache("cosmoshub-4", {
      retained: { address: "generic-retained", name: "Retained" },
      deleted: { address: "generic-deleted", name: "Deleted" },
    });
    const cardanoBefore = await kvStore.get(
      "cardano_addr_cache:cardano-preview"
    );
    const genericBefore = await kvStore.get("addr_cache:cosmoshub-4");

    // Decryption keeps working: the wedged KDF only hits the save half, which
    // is reachable with a readable blob (e.g. a legacy per-blob salt is
    // memoised on load while saving derives under the shared salt).
    const encryptSpy = jest
      .spyOn(Crypto, "encryptBlob")
      .mockImplementation(async () => {
        const err = new Error("Scrypt operation made no progress for 30000ms");
        err.name = "ScryptInactivityTimeoutError";
        throw err;
      });
    // The setup saves above share this spy; only cleanup calls are counted.
    encryptSpy.mockClear();

    await manager.removeWalletFromAllCaches("deleted");

    // Two chains × withRetry (2 attempts): the second chain must be reached.
    expect(encryptSpy.mock.calls.length).toBe(4);
    await expect(
      kvStore.get("cardano_addr_cache:cardano-preview")
    ).resolves.toEqual(cardanoBefore);
    await expect(kvStore.get("addr_cache:cosmoshub-4")).resolves.toEqual(
      genericBefore
    );
    // A transient failure is not proof that encryption is broken.
    await expect(
      kvStore.get("cache_encryption_failed:cardano:cardano-preview")
    ).resolves.toBeNull();
    await expect(
      kvStore.get("cache_encryption_failed:generic:cosmoshub-4")
    ).resolves.toBeNull();
  });

  it("retries a timed-out save once and leaves no encryption-failure marker", async () => {
    const kvStore = new MemoryKVStore("cache-manager-transient-save-retry");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [{ chainId: "cosmoshub-4", features: [] }],
    });

    let attempts = 0;
    jest.spyOn(Crypto, "encryptBlob").mockImplementation(async () => {
      attempts += 1;
      const err = new Error("Scrypt operation made no progress for 30000ms");
      err.name = "ScryptInactivityTimeoutError";
      throw err;
    });

    await expect(
      manager.saveGenericCache("cosmoshub-4", {
        wallet1: { address: "generic-address", name: "Wallet" },
      })
    ).rejects.toThrow("Transient crypto failure encrypting generic cache");

    expect(attempts).toBe(2);
    await expect(
      kvStore.get("cache_encryption_failed:generic:cosmoshub-4")
    ).resolves.toBeUndefined();
  });

  it("retries wallet-cache removal once after a transient scrypt timeout", async () => {
    const kvStore = new MemoryKVStore(
      "cache-manager-transient-scrypt-removal-retry"
    );
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [{ chainId: "cosmoshub-4", features: [] }],
    });
    mockReversibleCacheBlobCrypto();
    await manager.saveGenericCache("cosmoshub-4", {
      retained: { address: "retained-address", name: "Retained" },
      deleted: { address: "deleted-address", name: "Deleted" },
    });

    let attempts = 0;
    jest.spyOn(Crypto, "decryptBlob").mockImplementation(async (_c, data) => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error("Scrypt operation made no progress for 30000ms");
        err.name = "ScryptInactivityTimeoutError";
        throw err;
      }
      return Buffer.from((data as any).crypto.ciphertext, "hex");
    });

    await manager.removeWalletFromAllCaches("deleted");

    expect(attempts).toBe(2);
    mockReversibleCacheBlobCrypto();
    await expect(manager.loadGenericCache("cosmoshub-4")).resolves.toEqual({
      retained: { address: "retained-address", name: "Retained" },
    });
  });

  it("keeps tombstones after session-invalidated cleanup aborts", async () => {
    const kvStore = new MemoryKVStore(
      "cache-manager-aborted-removal-tombstone"
    );
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [{ chainId: "cosmoshub-4", features: [] }],
    });
    mockReversibleCacheBlobCrypto();
    await manager.saveGenericCache("cosmoshub-4", {
      retained: { address: "retained-address", name: "Retained" },
      deleted: { address: "deleted-address", name: "Deleted" },
    });
    const staleSnapshot = await manager.loadGenericCache("cosmoshub-4");

    const originalLoad = (manager as any)._loadGenericCacheUnsafe.bind(manager);
    let releaseCleanup!: () => void;
    let markCleanupStarted!: () => void;
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const cleanupStarted = new Promise<void>((resolve) => {
      markCleanupStarted = resolve;
    });
    jest
      .spyOn(manager as any, "_loadGenericCacheUnsafe")
      .mockImplementation(async (...args: unknown[]) => {
        const [chainId, options] = args as [string, any];
        if (options.throwOnDecryptFailure) {
          markCleanupStarted();
          await cleanupGate;
        }
        return originalLoad(chainId, options);
      });

    const removal = manager.removeWalletFromAllCaches("deleted");
    await cleanupStarted;
    manager.setPassword("");
    releaseCleanup();
    await removal;

    manager.setPassword("test-password");
    await manager.saveGenericCache("cosmoshub-4", staleSnapshot);
    await expect(manager.loadGenericCache("cosmoshub-4")).resolves.toEqual({
      retained: { address: "retained-address", name: "Retained" },
    });
  });

  it("still clears every known cache explicitly", async () => {
    const kvStore = new MemoryKVStore("cache-manager-explicit-clear");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [
        { chainId: "cardano-preview", features: ["cardano"] },
        { chainId: "cosmoshub-4", features: [] },
      ],
    });
    await kvStore.set("cardano_addr_cache:cardano-preview", {
      retained: { address: "cardano-retained", pubKey: "pub" },
    } as any);
    await kvStore.set("addr_cache:cosmoshub-4", {
      retained: { address: "generic-retained" },
    } as any);

    await manager.clearAllCaches();

    await expect(
      kvStore.get("cardano_addr_cache:cardano-preview")
    ).resolves.toBeNull();
    await expect(kvStore.get("addr_cache:cosmoshub-4")).resolves.toBeNull();
  });

  it("treats deleted-wallet tombstones and stale names as consistent", async () => {
    const kvStore = new MemoryKVStore("cache-manager-lazy-tombstone");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });

    await kvStore.set("addr_cache:cosmoshub-4", {
      current: { address: "aabb", name: "Old name" },
      deleted: { address: "ccdd", name: "Deleted wallet" },
    } as any);

    await expect(
      manager.checkConsistency(
        "cosmoshub-4",
        ["current"],
        "current",
        "aabb",
        false
      )
    ).resolves.toEqual({ isConsistent: true, issues: [] });
  });

  it("still rejects missing current wallets and active-address mismatches", async () => {
    const kvStore = new MemoryKVStore("cache-manager-real-inconsistency");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });

    await kvStore.set("addr_cache:cosmoshub-4", {
      current: { address: "aabb" },
    } as any);

    const result = await manager.checkConsistency(
      "cosmoshub-4",
      ["current", "missing"],
      "current",
      "different",
      false
    );

    expect(result.isConsistent).toBe(false);
    expect(result.issues).toEqual([
      "Missing wallet IDs in cache",
      expect.stringContaining("Active wallet address mismatch"),
    ]);
  });

  it("marks address-cache blob crypto as background work", async () => {
    const kvStore = new MemoryKVStore("cache-manager-background-priority");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });
    const encryptSpy = jest.spyOn(Crypto, "encryptBlob").mockResolvedValue({
      version: "1.0",
      crypto: {
        cipher: "aes-128-ctr",
        cipherparams: { iv: "a".repeat(32) },
        kdf: "scrypt",
        kdfparams: {
          salt: "b".repeat(64),
          dklen: 32,
          n: 131072,
          r: 8,
          p: 1,
        },
        ciphertext: "",
        mac: "c".repeat(64),
      },
      meta: { cacheType: "address_cache" },
    });

    await manager.saveGenericCache("cosmoshub-4", {
      current: { address: "aabb" },
    });

    expect(encryptSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        rng: expect.any(Function),
        scrypt: expect.any(Function),
      }),
      "scrypt",
      expect.any(String),
      "test-password",
      { cacheType: "address_cache" },
      {
        priority: "background",
        salt: expect.stringMatching(/^[0-9a-f]{64}$/),
      }
    );
  });

  it("uses interactive priority for foreground cache reads", async () => {
    const kvStore = new MemoryKVStore("cache-manager-read-priority");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });
    await manager.saveGenericCache("cosmoshub-4", {
      current: { address: "aabb" },
    });
    const decryptSpy = jest.spyOn(Crypto, "decryptBlob");

    await manager.loadGenericCache("cosmoshub-4");
    expect(decryptSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      "test-password",
      { priority: "interactive" }
    );

    await manager.loadGenericCache("cosmoshub-4", {
      scryptPriority: "background",
    });
    expect(decryptSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      "test-password",
      { priority: "background" }
    );
  });

  it("derives the shared address-cache key once per password session", async () => {
    const kvStore = new MemoryKVStore("cache-manager-shared-derived-key");
    let randomByte = 1;
    const scrypt = jest.fn(async (_password: string, _params: any) =>
      Uint8Array.from({ length: 32 }, (_, index) => index)
    );
    const crypto = {
      rng: async (array: Uint8Array) => {
        array.fill(randomByte++);
        return array;
      },
      scrypt,
    } as any;
    const manager = new AddressCacheManager({
      kvStore,
      crypto,
      password: "test-password",
      embedChainInfos: [],
    });

    await manager.saveGenericCache("cosmoshub-4", {
      current: { address: "first" },
    });
    const firstStored = await kvStore.get<string>("addr_cache:cosmoshub-4");
    expect(firstStored).toBeDefined();
    const firstBlob = JSON.parse(firstStored as string);

    await manager.saveGenericCache("cosmoshub-4", {
      current: { address: "second" },
    });
    const secondStored = await kvStore.get<string>("addr_cache:cosmoshub-4");
    expect(secondStored).toBeDefined();
    const secondBlob = JSON.parse(secondStored as string);

    await expect(manager.loadGenericCache("cosmoshub-4")).resolves.toEqual({
      current: { address: "second" },
    });
    expect(scrypt).toHaveBeenCalledTimes(1);
    expect(firstBlob.crypto.kdfparams.salt).toBe(
      secondBlob.crypto.kdfparams.salt
    );
    expect(firstBlob.crypto.cipherparams.iv).not.toBe(
      secondBlob.crypto.cipherparams.iv
    );
    expect(scrypt.mock.calls[0][1].executionPriority).toBe("background");

    manager.setPassword("");
    manager.setPassword("test-password");
    await manager.loadGenericCache("cosmoshub-4");
    expect(scrypt).toHaveBeenCalledTimes(2);
  });

  it("warms the shared address-cache key with background priority", async () => {
    const kvStore = new MemoryKVStore("cache-manager-shared-key-warmup");
    const scrypt = jest.fn(
      async (_password: string, _params: any) => new Uint8Array(32)
    );
    const manager = new AddressCacheManager({
      kvStore,
      crypto: {
        rng: async (array: Uint8Array) => {
          array.fill(9);
          return array;
        },
        scrypt,
      } as any,
      password: "test-password",
      embedChainInfos: [],
    });

    await manager.warmSharedDerivedKey();
    await manager.saveGenericCache("cosmoshub-4", {
      current: { address: "aabb" },
    });

    expect(scrypt).toHaveBeenCalledTimes(1);
    expect(scrypt.mock.calls[0][1]).toMatchObject({
      executionPriority: "background",
      salt: "09".repeat(32),
    });
  });

  it("single-flights overlapping warm-ups and memoizes the derived key", async () => {
    const kvStore = new MemoryKVStore(
      "cache-manager-shared-key-warmup-single-flight"
    );
    let releaseScrypt!: () => void;
    let markScryptStarted!: () => void;
    const scryptGate = new Promise<void>((resolve) => {
      releaseScrypt = resolve;
    });
    const scryptStarted = new Promise<void>((resolve) => {
      markScryptStarted = resolve;
    });
    let activeScrypt = 0;
    let maxConcurrentScrypt = 0;
    const scrypt = jest.fn(async () => {
      activeScrypt += 1;
      maxConcurrentScrypt = Math.max(maxConcurrentScrypt, activeScrypt);
      markScryptStarted();
      await scryptGate;
      activeScrypt -= 1;
      return new Uint8Array(32);
    });
    const manager = new AddressCacheManager({
      kvStore,
      crypto: {
        rng: async (array: Uint8Array) => {
          array.fill(8);
          return array;
        },
        scrypt,
      } as any,
      password: "test-password",
      embedChainInfos: [],
    });

    const first = manager.warmSharedDerivedKey();
    await scryptStarted;
    const second = manager.warmSharedDerivedKey();
    await Promise.resolve();

    expect(scrypt).toHaveBeenCalledTimes(1);
    expect(maxConcurrentScrypt).toBe(1);
    releaseScrypt();
    await Promise.all([first, second]);
    await manager.warmSharedDerivedKey();

    expect(scrypt).toHaveBeenCalledTimes(1);
    expect(maxConcurrentScrypt).toBe(1);
  });

  it("invalidates two shared-KDF callers across A to B to A and zeroes the stale result", async () => {
    const kvStore = new MemoryKVStore("cache-manager-generation-aba");
    let releaseScrypt!: () => void;
    let markScryptStarted!: () => void;
    const scryptGate = new Promise<void>((resolve) => {
      releaseScrypt = resolve;
    });
    const scryptStarted = new Promise<void>((resolve) => {
      markScryptStarted = resolve;
    });
    const staleDerivedKey = new Uint8Array(32).fill(9);
    const scrypt = jest.fn(async () => {
      markScryptStarted();
      await scryptGate;
      return staleDerivedKey;
    });
    const manager = new AddressCacheManager({
      kvStore,
      crypto: {
        rng: async (array: Uint8Array) => {
          array.fill(7);
          return array;
        },
        scrypt,
      } as any,
      password: "password-a",
      embedChainInfos: [],
    });

    const first = manager.warmSharedDerivedKey();
    await scryptStarted;
    const second = manager.warmSharedDerivedKey();
    manager.setPassword("password-b");
    manager.setPassword("password-a");
    releaseScrypt();

    await expect(first).rejects.toThrow("password changed");
    await expect(second).rejects.toThrow("password changed");
    expect(scrypt).toHaveBeenCalledTimes(1);
    expect([...staleDerivedKey]).toEqual(Array(staleDerivedKey.length).fill(0));
    expect((manager as any).cacheDerivedKeys.size).toBe(0);
    expect((manager as any).cacheDerivedKeyFlights.size).toBe(0);
  });

  it("zeroes memoized derived keys as soon as the password generation changes", async () => {
    const kvStore = new MemoryKVStore("cache-manager-zero-memoized-key");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: {
        rng: async (array: Uint8Array) => {
          array.fill(6);
          return array;
        },
        scrypt: async () => new Uint8Array(32).fill(5),
      } as any,
      password: "password-a",
      embedChainInfos: [],
    });
    await manager.warmSharedDerivedKey();
    const cached = [
      ...(manager as any).cacheDerivedKeys.values(),
    ][0] as Uint8Array;
    expect(cached.some((byte) => byte !== 0)).toBe(true);

    manager.setPassword("password-b");

    expect([...cached]).toEqual(Array(cached.length).fill(0));
    expect((manager as any).cacheDerivedKeys.size).toBe(0);
  });

  it("orders a pending old-generation cache commit before the newer final value", async () => {
    const kvStore = new MemoryKVStore("cache-manager-write-generation-order");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "password-a",
      embedChainInfos: [],
    });
    jest.spyOn(Crypto, "encryptBlob").mockImplementation(
      async (_crypto, _kdf, _text, password) =>
        ({
          version: "1.0",
          crypto: {
            cipher: "aes-128-ctr",
            cipherparams: { iv: "11".repeat(16) },
            kdf: "scrypt",
            kdfparams: {
              salt: "22".repeat(32),
              dklen: 32,
              n: 131072,
              r: 8,
              p: 1,
            },
            ciphertext: Buffer.from(password).toString("hex"),
            mac: "33".repeat(32),
          },
          meta: {},
        } as any)
    );
    const realSet = kvStore.set.bind(kvStore);
    let releaseOldWrite!: () => void;
    let markOldWriteStarted!: () => void;
    const oldWriteGate = new Promise<void>((resolve) => {
      releaseOldWrite = resolve;
    });
    const oldWriteStarted = new Promise<void>((resolve) => {
      markOldWriteStarted = resolve;
    });
    let cacheWrites = 0;
    jest.spyOn(kvStore, "set").mockImplementation(async (key, value) => {
      if (key === "addr_cache:cosmoshub-4") {
        cacheWrites += 1;
        if (cacheWrites === 1) {
          markOldWriteStarted();
          await oldWriteGate;
        }
      }
      await realSet(key, value);
    });

    const oldWrite = (manager as any)._saveGenericCacheUnsafe("cosmoshub-4", {
      w1: { address: "old" },
    });
    await oldWriteStarted;
    manager.setPassword("password-b");
    const newWrite = (manager as any)._saveGenericCacheUnsafe("cosmoshub-4", {
      w1: { address: "new" },
    });
    await Promise.resolve();
    expect(cacheWrites).toBe(1);

    releaseOldWrite();
    await expect(oldWrite).rejects.toThrow("password changed");
    await expect(newWrite).resolves.toBeUndefined();
    const finalBlob = JSON.parse(
      (await kvStore.get<string>("addr_cache:cosmoshub-4")) as string
    );
    expect(Buffer.from(finalBlob.crypto.ciphertext, "hex").toString()).toBe(
      "password-b"
    );
    expect(cacheWrites).toBe(2);
  });

  it("zeroes and rejects decrypted cache plaintext after lock", async () => {
    const kvStore = new MemoryKVStore("cache-manager-lock-during-decrypt");
    const manager = new AddressCacheManager({
      kvStore,
      crypto: mockCrypto,
      password: "test-password",
      embedChainInfos: [],
    });
    await kvStore.set(
      "addr_cache:cosmoshub-4",
      JSON.stringify({
        version: "1.0",
        crypto: {
          cipher: "aes-128-ctr",
          cipherparams: { iv: "11".repeat(16) },
          kdf: "scrypt",
          kdfparams: { salt: "22".repeat(32) },
          ciphertext: "00",
          mac: "33".repeat(32),
        },
      })
    );
    let releaseDecrypt!: (value: Uint8Array) => void;
    let markDecryptStarted!: () => void;
    const decryptGate = new Promise<Uint8Array>((resolve) => {
      releaseDecrypt = resolve;
    });
    const decryptStarted = new Promise<void>((resolve) => {
      markDecryptStarted = resolve;
    });
    const plaintext = Buffer.from(
      JSON.stringify({ w1: { address: "must-not-publish" } })
    );
    jest.spyOn(Crypto, "decryptBlob").mockImplementation(() => {
      markDecryptStarted();
      return decryptGate;
    });

    const load = manager.loadGenericCache("cosmoshub-4");
    await decryptStarted;
    manager.setPassword("");
    releaseDecrypt(plaintext);

    await expect(load).rejects.toThrow("password changed");
    expect([...plaintext]).toEqual(Array(plaintext.length).fill(0));
  });
});
