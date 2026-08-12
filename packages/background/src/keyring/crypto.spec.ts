import { KeyCurves } from "@keplr-wallet/crypto";
import { Crypto } from "./crypto";
import type { ScryptParams } from "./types";

describe("Crypto scrypt scheduling metadata", () => {
  function makeCrypto() {
    const scrypt = jest.fn(async (_text: string, _params: ScryptParams) =>
      Uint8Array.from({ length: 32 }, (_, index) => index)
    );
    return {
      crypto: {
        rng: async (bytes: Uint8Array) => {
          bytes.fill(7);
          return bytes;
        },
        scrypt,
      } as any,
      scrypt,
    };
  }

  it("uses interactive priority without persisting the runtime hint", async () => {
    const { crypto, scrypt } = makeCrypto();

    const keyStore = await Crypto.encrypt(
      crypto,
      "scrypt",
      "mnemonic",
      KeyCurves.secp256k1,
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      "password",
      { name: "Wallet" }
    );

    expect(scrypt.mock.calls[0][1].executionPriority).toBe("interactive");
    expect(keyStore.crypto.kdfparams.executionPriority).toBeUndefined();
  });

  it("ignores a persisted priority hint when decrypting", async () => {
    const { crypto, scrypt } = makeCrypto();
    const keyStore = await Crypto.encrypt(
      crypto,
      "scrypt",
      "mnemonic",
      KeyCurves.secp256k1,
      "test mnemonic",
      "password",
      { name: "Wallet" }
    );
    keyStore.crypto.kdfparams.executionPriority = "background";
    scrypt.mockClear();

    const decrypted = await Crypto.decrypt(crypto, keyStore, "password");
    expect(Buffer.from(decrypted).toString()).toBe("test mnemonic");
    expect(scrypt.mock.calls[0][1].executionPriority).toBe("interactive");
  });

  it("keeps blob crypto interactive by default and supports explicit background work", async () => {
    const { crypto, scrypt } = makeCrypto();
    const blob = await Crypto.encryptBlob(
      crypto,
      "scrypt",
      "payload",
      "password",
      { kind: "interactive-setting" }
    );

    expect(scrypt.mock.calls[0][1].executionPriority).toBe("interactive");
    expect(blob.crypto.kdfparams.executionPriority).toBeUndefined();

    scrypt.mockClear();
    await Crypto.decryptBlob(crypto, blob, "password", {
      priority: "background",
    });
    expect(scrypt.mock.calls[0][1].executionPriority).toBe("background");
  });

  it("uses a caller-provided blob salt while still generating a fresh IV", async () => {
    const { crypto, scrypt } = makeCrypto();
    const salt = "ab".repeat(32);

    const blob = await Crypto.encryptBlob(
      crypto,
      "scrypt",
      "payload",
      "password",
      { kind: "address-cache" },
      { priority: "background", salt }
    );

    expect(blob.crypto.kdfparams.salt).toBe(salt);
    expect(blob.crypto.cipherparams.iv).toHaveLength(32);
    expect(scrypt.mock.calls[0][1]).toMatchObject({
      salt,
      executionPriority: "background",
    });
  });

  it("zeroes every provider-derived key buffer after encrypt and decrypt", async () => {
    const derivedKeys: Uint8Array[] = [];
    const crypto = {
      rng: async (bytes: Uint8Array) => {
        bytes.fill(4);
        return bytes;
      },
      scrypt: async () => {
        const derivedKey = Uint8Array.from(
          { length: 32 },
          (_, index) => index + 1
        );
        derivedKeys.push(derivedKey);
        return derivedKey;
      },
    } as any;
    const plaintext = Buffer.from("controlled plaintext");

    const keyStore = await Crypto.encrypt(
      crypto,
      "scrypt",
      "mnemonic",
      KeyCurves.secp256k1,
      plaintext,
      "password",
      { name: "Wallet" }
    );
    expect(Buffer.from(plaintext).toString()).toBe("controlled plaintext");
    const decrypted = await Crypto.decrypt(crypto, keyStore, "password");
    expect(Buffer.from(decrypted).toString()).toBe("controlled plaintext");
    decrypted.fill(0);

    expect(derivedKeys).toHaveLength(2);
    for (const derivedKey of derivedKeys) {
      expect([...derivedKey]).toEqual(Array(derivedKey.length).fill(0));
    }
  });
});
