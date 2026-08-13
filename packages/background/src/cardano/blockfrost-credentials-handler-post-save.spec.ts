import { MemoryKVStore } from "@keplr-wallet/common";
import { BlockfrostCredentialsStore } from "./blockfrost-credentials-store";
import {
  applyClearBlockfrostCredentials,
  applySetBlockfrostCredentials,
} from "./blockfrost-credentials-ops";
import {
  ClearBlockfrostCredentialsMsg,
  SetBlockfrostCredentialsMsg,
} from "./messages";
import { Crypto } from "../keyring/crypto";
import * as validation from "./blockfrost-credentials-validation";
import { afterBlockfrostCredentialsChanged } from "./blockfrost-credentials-post-save";
import { resetBlockfrostRateLimitTelemetry } from "@keplr-wallet/cardano";

jest.mock("@keplr-wallet/cardano", () => {
  const actual = jest.requireActual("@keplr-wallet/cardano");
  return {
    ...actual,
    resetBlockfrostRateLimitTelemetry: jest.fn(),
  };
});

describe("Blockfrost credentials handler post-save", () => {
  const mockCrypto = {
    rng: {
      getBytes: () => new Uint8Array(32),
    },
    scrypt: async () => new Uint8Array(32),
  } as any;
  const password = "wallet-password";

  const runPostSave = async (chainId: string, network: "preprod") => {
    const keyRingService = {
      chainsService: {
        getSelectedChain: jest.fn().mockResolvedValue(chainId),
      },
      isRegisteredCardanoChain: jest.fn().mockResolvedValue(true),
      reinitializeCardanoService: jest
        .fn()
        .mockRejectedValue(new Error("provider_unavailable")),
    } as any;

    await afterBlockfrostCredentialsChanged({
      chainId,
      network,
      keyRingService,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(validation, "validateBlockfrostProjectId").mockResolvedValue({
      ok: true,
    });

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
  });

  it("does not fail SetBlockfrostCredentials when post-save reinit fails", async () => {
    const store = new BlockfrostCredentialsStore(
      new MemoryKVStore(`handler-post-save-set-${Date.now()}`),
      mockCrypto
    );

    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg(
        "cardano-preprod",
        "preprod",
        true,
        "saved-key-12345678"
      ),
      { isLocked: false, password }
    );

    await expect(
      runPostSave("cardano-preprod", "preprod")
    ).resolves.toBeUndefined();

    expect(await store.hasPrefs("preprod")).toBe(true);
    expect(resetBlockfrostRateLimitTelemetry).toHaveBeenCalledWith("Preprod");
  });

  it("does not fail ClearBlockfrostCredentials when post-save reinit fails", async () => {
    const store = new BlockfrostCredentialsStore(
      new MemoryKVStore(`handler-post-save-clear-${Date.now()}`),
      mockCrypto
    );

    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg(
        "cardano-preprod",
        "preprod",
        true,
        "saved-key-12345678"
      ),
      { isLocked: false, password }
    );
    expect(await store.hasPrefs("preprod")).toBe(true);

    await applyClearBlockfrostCredentials(
      store,
      new ClearBlockfrostCredentialsMsg("cardano-preprod", "preprod"),
      { isLocked: false }
    );
    expect(await store.hasPrefs("preprod")).toBe(false);

    await expect(
      runPostSave("cardano-preprod", "preprod")
    ).resolves.toBeUndefined();
  });
});
