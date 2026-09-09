import { MemoryKVStore } from "@keplr-wallet/common";
import {
  BlockfrostCredentialsStore,
  BLOCKFROST_CREDENTIALS_STORE_VERSION,
  maskBlockfrostProjectId,
} from "./blockfrost-credentials-store";
import { Crypto } from "../keyring/crypto";

describe("BlockfrostCredentialsStore", () => {
  const mockCrypto = {
    rng: {
      getBytes: () => new Uint8Array(32),
    },
    scrypt: async () => new Uint8Array(32),
  } as any;

  const password = "test-password";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createStore = () =>
    new BlockfrostCredentialsStore(
      new MemoryKVStore("blockfrost-credentials-test"),
      mockCrypto
    );

  beforeEach(() => {
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

  it("hasPrefs checks raw KV without decrypting", async () => {
    const store = createStore();
    expect(await store.hasPrefs("preprod")).toBe(false);

    await store.savePrefs("preprod", password, {
      projectId: "preprod-custom-key",
      useCustomKey: true,
    });

    expect(await store.hasPrefs("preprod")).toBe(true);
  });

  it("savePrefs rejects empty projectId", async () => {
    const store = createStore();
    await expect(
      store.savePrefs("preprod", password, {
        projectId: "   ",
        useCustomKey: true,
      })
    ).rejects.toThrow("blockfrost_invalid_project_id");
  });

  it("roundtrips encrypted prefs", async () => {
    const store = createStore();
    await store.savePrefs("preprod", password, {
      projectId: "custom-key-12345",
      useCustomKey: false,
    });

    expect(await store.getPrefs("preprod", password)).toEqual({
      projectId: "custom-key-12345",
      useCustomKey: false,
    });
  });

  it("clearPrefs clears prefs contract", async () => {
    const store = createStore();
    await store.savePrefs("preprod", password, {
      projectId: "custom-key-12345",
      useCustomKey: true,
    });
    await store.clearPrefs("preprod");
    expect(await store.hasPrefs("preprod")).toBe(false);
    expect(await store.getPrefs("preprod", password)).toBeUndefined();
  });

  it("masks project id for display", () => {
    expect(maskBlockfrostProjectId("abcdefghijklmnop")).toBe("abcd...mnop");
    expect(maskBlockfrostProjectId("short")).toBe("****");
  });
});

describe("BlockfrostCredentialsStore key format", () => {
  it("uses versioned network key", async () => {
    const kv = new MemoryKVStore("blockfrost-credentials-key-format");
    const store = new BlockfrostCredentialsStore(kv, {
      rng: { getBytes: () => new Uint8Array(32) },
      scrypt: async () => new Uint8Array(32),
    } as any);

    jest.spyOn(Crypto, "encryptBlob").mockResolvedValue({
      version: "1.0",
      crypto: {
        cipher: "aes-128-ctr",
        cipherparams: { iv: "a".repeat(32) },
        kdf: "scrypt",
        kdfparams: { salt: "b".repeat(32) },
        ciphertext: "00",
        mac: "c".repeat(64),
      },
      meta: {},
    } as any);

    await store.savePrefs("preview", "pw", {
      projectId: "preview-key",
      useCustomKey: true,
    });

    expect(
      await kv.get(
        `blockfrost-credentials.v${BLOCKFROST_CREDENTIALS_STORE_VERSION}:preview`
      )
    ).toBeDefined();
  });
});
