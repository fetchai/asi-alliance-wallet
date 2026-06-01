import { MemoryKVStore } from "@keplr-wallet/common";
import { AddressCacheManager } from "./cache-manager";
import { Crypto } from "./crypto";

describe("AddressCacheManager security", () => {
  const mockCrypto = {
    rng: {
      getBytes: () => new Uint8Array(32),
    },
    scrypt: async () => new Uint8Array(32),
  } as any;

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
      wallet1: { address: "cosmos1...", name: "Wallet 1", pubKey: "pub2" },
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
    expect(await manager.loadGenericCache("cosmoshub-4")).toEqual(genericPlain);
  });
});
