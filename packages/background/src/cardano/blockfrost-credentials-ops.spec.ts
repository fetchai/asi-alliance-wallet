import { MemoryKVStore } from "@keplr-wallet/common";
import { BlockfrostCredentialsStore } from "./blockfrost-credentials-store";
import { Crypto } from "../keyring/crypto";
import {
  applyClearBlockfrostCredentials,
  applySetBlockfrostCredentials,
  getBlockfrostCredentialsResponse,
} from "./blockfrost-credentials-ops";
import {
  ClearBlockfrostCredentialsMsg,
  SetBlockfrostCredentialsMsg,
} from "./messages";
import * as validation from "./blockfrost-credentials-validation";

describe("blockfrost credentials ops", () => {
  const mockCrypto = {
    rng: {
      getBytes: () => new Uint8Array(32),
    },
    scrypt: async () => new Uint8Array(32),
  } as any;
  const password = "wallet-password";

  let store: BlockfrostCredentialsStore;

  beforeEach(() => {
    store = new BlockfrostCredentialsStore(
      new MemoryKVStore(`blockfrost-ops-${Date.now()}`),
      mockCrypto
    );

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

    jest.spyOn(validation, "validateBlockfrostProjectId").mockResolvedValue({
      ok: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects chainId/network mismatch on set", async () => {
    const msg = new SetBlockfrostCredentialsMsg(
      "cardano-mainnet",
      "preprod",
      true,
      "custom-key"
    );

    await expect(
      applySetBlockfrostCredentials(store, msg, {
        isLocked: false,
        password,
      })
    ).rejects.toThrow("cardano_network_mismatch");
  });

  it("empty save with toggle off and no existing key leaves KV empty", async () => {
    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg("cardano-preprod", "preprod", false),
      { isLocked: false, password }
    );

    expect(await store.hasPrefs("preprod")).toBe(false);

    const lockedGet = await getBlockfrostCredentialsResponse(store, {
      chainId: "cardano-preprod",
      network: "preprod",
      locked: true,
    });
    expect(lockedGet).toMatchObject({ locked: true, hasCustomKey: false });
  });

  it("valid save with toggle off keeps blob and returns masked id when unlocked", async () => {
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

    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg("cardano-preprod", "preprod", false),
      { isLocked: false, password }
    );

    const lockedGet = await getBlockfrostCredentialsResponse(store, {
      chainId: "cardano-preprod",
      network: "preprod",
      locked: true,
    });
    expect(lockedGet).toMatchObject({
      locked: true,
      hasCustomKey: true,
    });

    const unlockedGet = await getBlockfrostCredentialsResponse(store, {
      chainId: "cardano-preprod",
      network: "preprod",
      locked: false,
      password,
    });
    expect(unlockedGet).toMatchObject({
      locked: false,
      hasCustomKey: true,
      useCustomKey: false,
      maskedProjectId: "save...5678",
    });
  });

  it("toggle on/off without repeating projectId merges existing key", async () => {
    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg(
        "cardano-preprod",
        "preprod",
        true,
        "merge-key-12345678"
      ),
      { isLocked: false, password }
    );

    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg("cardano-preprod", "preprod", false),
      { isLocked: false, password }
    );

    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg("cardano-preprod", "preprod", true),
      { isLocked: false, password }
    );

    const prefs = await store.getPrefs("preprod", password);
    expect(prefs).toEqual({
      projectId: "merge-key-12345678",
      useCustomKey: true,
    });
  });

  it("clear removes credentials", async () => {
    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg(
        "cardano-preprod",
        "preprod",
        true,
        "clear-me-key-12345"
      ),
      { isLocked: false, password }
    );

    await applyClearBlockfrostCredentials(
      store,
      new ClearBlockfrostCredentialsMsg("cardano-preprod", "preprod"),
      { isLocked: false }
    );

    expect(await store.hasPrefs("preprod")).toBe(false);

    const response = await getBlockfrostCredentialsResponse(store, {
      chainId: "cardano-preprod",
      network: "preprod",
      locked: false,
      password,
    });
    expect(response).toMatchObject({
      locked: false,
      hasCustomKey: false,
      useCustomKey: false,
    });
    if (!response.locked) {
      expect(response.maskedProjectId).toBeUndefined();
    }
  });

  it("rejects set when wallet is locked", async () => {
    await expect(
      applySetBlockfrostCredentials(
        store,
        new SetBlockfrostCredentialsMsg(
          "cardano-preprod",
          "preprod",
          true,
          "key"
        ),
        { isLocked: true }
      )
    ).rejects.toThrow("cardano_wallet_locked");
  });

  it("validates new projectId even when toggle is off", async () => {
    const validateSpy = jest.spyOn(validation, "validateBlockfrostProjectId");

    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg(
        "cardano-preprod",
        "preprod",
        false,
        "some-new-key-12345678"
      ),
      { isLocked: false, password }
    );

    expect(validateSpy).toHaveBeenCalledWith(
      "some-new-key-12345678",
      "preprod"
    );
  });

  it("does not allow validation bypass by saving key disabled then enabling without projectId", async () => {
    const validateSpy = jest
      .spyOn(validation, "validateBlockfrostProjectId")
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        reason: "network_mismatch",
        requiresConfirmation: true,
      });

    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg(
        "cardano-preprod",
        "preprod",
        false,
        "bypass-key-12345678"
      ),
      { isLocked: false, password }
    );

    await expect(
      applySetBlockfrostCredentials(
        store,
        new SetBlockfrostCredentialsMsg("cardano-preprod", "preprod", true),
        { isLocked: false, password }
      )
    ).rejects.toThrow("blockfrost_credentials_requires_confirmation");

    expect(validateSpy).toHaveBeenCalledTimes(2);
    expect(validateSpy).toHaveBeenLastCalledWith(
      "bypass-key-12345678",
      "preprod"
    );
  });

  it("returns sanitized unlocked response when prefs decrypt fails", async () => {
    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg(
        "cardano-preprod",
        "preprod",
        true,
        "corrupt-key-12345678"
      ),
      { isLocked: false, password }
    );

    jest.spyOn(store, "getPrefs").mockRejectedValue(new Error("Unmatched mac"));

    const response = await getBlockfrostCredentialsResponse(store, {
      chainId: "cardano-preprod",
      network: "preprod",
      locked: false,
      password,
    });

    expect(response).toEqual({
      locked: false,
      hasCustomKey: false,
      network: "preprod",
      chainId: "cardano-preprod",
      useCustomKey: false,
    });
  });

  it("allows save when validation is unreachable and allowUnverifiedSave is set", async () => {
    jest.spyOn(validation, "validateBlockfrostProjectId").mockResolvedValue({
      ok: false,
      reason: "unreachable",
      requiresConfirmation: true,
    });

    await applySetBlockfrostCredentials(
      store,
      new SetBlockfrostCredentialsMsg(
        "cardano-preprod",
        "preprod",
        true,
        "offline-key-12345678",
        true
      ),
      { isLocked: false, password }
    );

    const prefs = await store.getPrefs("preprod", password);
    expect(prefs).toEqual({
      projectId: "offline-key-12345678",
      useCustomKey: true,
    });
  });

  it("requires confirmation when validation reports network mismatch", async () => {
    jest.spyOn(validation, "validateBlockfrostProjectId").mockResolvedValue({
      ok: false,
      reason: "network_mismatch",
      requiresConfirmation: true,
    });

    await expect(
      applySetBlockfrostCredentials(
        store,
        new SetBlockfrostCredentialsMsg(
          "cardano-preprod",
          "preprod",
          true,
          "mismatch-key"
        ),
        { isLocked: false, password }
      )
    ).rejects.toThrow("blockfrost_credentials_requires_confirmation");
  });
});
