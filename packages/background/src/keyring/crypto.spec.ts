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
    expect(blob.version).toBe("1.0");
    expect(scrypt.mock.calls[0][1]).toMatchObject({
      salt,
      executionPriority: "background",
    });
  });

  it("binds v1.1 blob MAC to IV, storage key and chain id", async () => {
    const { crypto } = makeCrypto();
    const salt = "cd".repeat(32);
    const macContext = {
      storageKey: "addr_cache:cosmoshub-4",
      chainId: "cosmoshub-4",
    };

    const blob = await Crypto.encryptBlob(
      crypto,
      "scrypt",
      JSON.stringify({ wallet: { address: "cosmos1abc" } }),
      "password",
      { cacheType: "address_cache" },
      { salt, macContext }
    );

    expect(blob.version).toBe("1.1");
    await expect(
      Crypto.decryptBlob(crypto, blob, "password", { macContext })
    ).resolves.toBeInstanceOf(Uint8Array);

    const ivTampered = {
      ...blob,
      crypto: {
        ...blob.crypto,
        cipherparams: { iv: "00".repeat(16) },
      },
    };
    await expect(
      Crypto.decryptBlob(crypto, ivTampered, "password", { macContext })
    ).rejects.toThrow("Unmatched mac");

    await expect(
      Crypto.decryptBlob(crypto, blob, "password", {
        macContext: {
          storageKey: "addr_cache:osmosis-1",
          chainId: "osmosis-1",
        },
      })
    ).rejects.toThrow("Unmatched mac");

    await expect(Crypto.decryptBlob(crypto, blob, "password")).rejects.toThrow(
      "macContext required"
    );
  });

  it("decrypts unbound v1.0 blobs only when no macContext is requested", async () => {
    const { crypto } = makeCrypto();
    const salt = "ef".repeat(32);
    const blob = await Crypto.encryptBlob(
      crypto,
      "scrypt",
      JSON.stringify({ wallet: { address: "cosmos1legacy" } }),
      "password",
      { cacheType: "address_cache" },
      { salt }
    );
    expect(blob.version).toBe("1.0");

    // Unbound callers (e.g. BlockfrostCredentialsStore) still work.
    const decrypted = await Crypto.decryptBlob(crypto, blob, "password");
    expect(Buffer.from(decrypted).toString()).toBe(
      JSON.stringify({ wallet: { address: "cosmos1legacy" } })
    );

    // A caller asking for domain binding must never be served the unbound
    // payload, otherwise the two payload shapes collide across versions.
    await expect(
      Crypto.decryptBlob(crypto, blob, "password", {
        macContext: {
          storageKey: "addr_cache:cosmoshub-4",
          chainId: "cosmoshub-4",
        },
      })
    ).rejects.toThrow("cannot verify an unbound version 1.0 blob");
  });

  it("rejects a v1.1 blob re-presented as v1.0 with a reconstructed payload", async () => {
    const { crypto } = makeCrypto();
    const salt = "ab".repeat(32);
    const macContext = {
      storageKey: "addr_cache:cosmoshub-4",
      chainId: "cosmoshub-4",
    };
    const blob = await Crypto.encryptBlob(
      crypto,
      "scrypt",
      JSON.stringify({ wallet: { address: "cosmos1victim" } }),
      "password",
      { cacheType: "address_cache" },
      { salt, macContext }
    );

    // v1.0 MACs `macKey ‖ ciphertext`, so folding the v1.1 preamble into the
    // ciphertext reproduces the v1.1 MAC payload exactly. The version guard,
    // not the MAC comparison, is what stops this.
    const iv = Buffer.from(blob.crypto.cipherparams.iv, "hex");
    const len = (n: number) => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(n, 0);
      return b;
    };
    const storageKey = Buffer.from(macContext.storageKey, "utf8");
    const chainId = Buffer.from(macContext.chainId, "utf8");
    const preamble = Buffer.concat([
      Buffer.from("address-cache-mac-v1", "utf8"),
      len(iv.length),
      iv,
      len(storageKey.length),
      storageKey,
      len(chainId.length),
      chainId,
    ]);
    const forged = {
      ...blob,
      version: "1.0" as const,
      crypto: {
        ...blob.crypto,
        ciphertext: preamble.toString("hex") + blob.crypto.ciphertext,
      },
    };

    await expect(
      Crypto.decryptBlob(crypto, forged, "password", { macContext })
    ).rejects.toThrow("cannot verify an unbound version 1.0 blob");
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
