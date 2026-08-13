import { MemoryKVStore } from "@keplr-wallet/common";
import { BlockfrostCredentialsStore } from "./blockfrost-credentials-store";
import { createBlockfrostConfigResolver } from "./blockfrost-credentials-runtime";
import { Crypto } from "../keyring/crypto";

describe("createBlockfrostConfigResolver", () => {
  const mockCrypto = {
    rng: {
      getBytes: () => new Uint8Array(32),
    },
    scrypt: async () => new Uint8Array(32),
  } as any;
  const password = "wallet-password";

  beforeEach(() => {
    process.env["BLOCKFROST_PROJECT_ID_PREPROD"] = "builtin-preprod-key";

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
          meta: {},
        } as any)
    );

    jest.spyOn(Crypto, "decryptBlob").mockImplementation(async (_c, data) => {
      const ciphertext = (data as any).crypto?.ciphertext;
      return Buffer.from(ciphertext, "hex");
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env["BLOCKFROST_PROJECT_ID_PREPROD"];
  });

  it("returns undefined when credentials store is unavailable", () => {
    expect(createBlockfrostConfigResolver(undefined, password)).toBeUndefined();
  });

  it("resolves built-in config when no custom prefs exist", async () => {
    const resolver = createBlockfrostConfigResolver(
      new BlockfrostCredentialsStore(
        new MemoryKVStore("runtime-builtin"),
        mockCrypto
      ),
      password
    );

    await expect(resolver!("preprod")).resolves.toEqual({
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: "builtin-preprod-key",
    });
  });

  it("resolves custom config when useCustomKey is enabled", async () => {
    const store = new BlockfrostCredentialsStore(
      new MemoryKVStore("runtime-custom"),
      mockCrypto
    );
    await store.savePrefs("preprod", password, {
      projectId: "user-custom-key-12345",
      useCustomKey: true,
    });

    const resolver = createBlockfrostConfigResolver(store, password);
    await expect(resolver!("preprod")).resolves.toEqual({
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: "user-custom-key-12345",
    });
  });

  it("falls back to built-in when toggle is off even if custom key is saved", async () => {
    const store = new BlockfrostCredentialsStore(
      new MemoryKVStore("runtime-disabled"),
      mockCrypto
    );
    await store.savePrefs("preprod", password, {
      projectId: "saved-disabled-key",
      useCustomKey: false,
    });

    const resolver = createBlockfrostConfigResolver(store, password);
    await expect(resolver!("preprod")).resolves.toEqual({
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: "builtin-preprod-key",
    });
  });
});
