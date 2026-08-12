// eslint-disable-next-line @typescript-eslint/no-var-requires
const aesjs = require("aes-js");
const AES = aesjs;
const Counter = aesjs.Counter;
import {
  BIP44HDPath,
  ScryptParams,
  ScryptPriority,
  CommonCrypto,
  SupportedCurve,
  KeyStore,
} from "./types";
import pbkdf2 from "pbkdf2";
import { Buffer } from "buffer/";
import { Hash, KeyCurves } from "@keplr-wallet/crypto";

/**
 * This is similar to ethereum's key store.
 * But, the encrypted data is not the private key, but the mnemonic words.
 */

function deriveKey(
  crypto: CommonCrypto,
  kdf: "scrypt" | "sha256" | "pbkdf2",
  password: string,
  scryptParams: ScryptParams,
  options?: { priority?: ScryptPriority }
): Promise<Uint8Array> {
  switch (kdf) {
    case "scrypt":
      return crypto.scrypt(password, {
        ...scryptParams,
        // Never trust a scheduling hint from persisted kdfparams.
        executionPriority: options?.priority ?? "interactive",
      });
    case "sha256":
      return Promise.resolve(
        Hash.sha256(Buffer.from(`${scryptParams.salt}/${password}`))
      );
    case "pbkdf2":
      return new Promise<Uint8Array>((resolve, reject) => {
        pbkdf2.pbkdf2(
          password,
          scryptParams.salt,
          4000,
          32,
          "sha256",
          (err: any, derivedKey: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(new Uint8Array(derivedKey));
            }
          }
        );
      });
    default:
      throw new Error("Unknown kdf");
  }
}

export class Crypto {
  public static async encrypt(
    crypto: CommonCrypto,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    type: "mnemonic" | "privateKey" | "ledger" | "keystone",
    curve: SupportedCurve,
    text: string | Uint8Array,
    password: string,
    meta: Record<string, string>,
    bip44HDPath?: BIP44HDPath
  ): Promise<KeyStore> {
    if (curve !== KeyCurves.secp256k1) {
      throw new Error(`Unsupported curve: ${curve}`);
    }
    let random = new Uint8Array(32);
    const salt = Buffer.from(await crypto.rng(random)).toString("hex");
    const scryptParams: ScryptParams = {
      salt,
      dklen: 32,
      n: 131072,
      r: 8,
      p: 1,
    };
    const derivedKey = await deriveKey(crypto, kdf, password, scryptParams);
    const buf = (() => {
      if (typeof text === "string") {
        return Buffer.from(text);
      }
      const controlledCopy = Buffer.alloc(text.byteLength);
      controlledCopy.set(text);
      return controlledCopy;
    })();
    let macPayload: Uint8Array | undefined;
    try {
      random = new Uint8Array(16);
      const iv = Buffer.from(await crypto.rng(random));
      const counter = new Counter(0);
      counter.setBytes(iv);
      const aesCtr = new AES.ModeOfOperation.ctr(derivedKey, counter);
      const ciphertext = Buffer.from(aesCtr.encrypt(buf));
      // Mac is sha256(last 16 bytes of derived key + ciphertext)
      macPayload = Buffer.concat([
        Buffer.from(derivedKey.subarray(derivedKey.length / 2)),
        ciphertext,
      ]);
      const mac = Hash.sha256(macPayload);
      return {
        version: "1.2",
        type,
        coinTypeForChain: {},
        curve,
        bip44HDPath,
        meta,
        crypto: {
          cipher: "aes-128-ctr",
          cipherparams: {
            iv: iv.toString("hex"),
          },
          ciphertext: ciphertext.toString("hex"),
          kdf,
          kdfparams: scryptParams,
          mac: Buffer.from(mac).toString("hex"),
        },
      };
    } finally {
      buf.fill(0);
      macPayload?.fill(0);
      derivedKey.fill(0);
    }
  }

  public static async encryptBlob(
    crypto: CommonCrypto,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    text: string,
    password: string,
    meta: Record<string, string>,
    options?: { priority?: ScryptPriority; salt?: string }
  ): Promise<{
    version: "1.0";
    crypto: {
      cipher: "aes-128-ctr";
      cipherparams: { iv: string };
      kdf: "scrypt" | "sha256" | "pbkdf2";
      kdfparams: ScryptParams;
      ciphertext: string;
      mac: string;
    };
    meta: Record<string, string>;
  }> {
    let random: Uint8Array;
    let salt = options?.salt;
    if (salt && !/^[0-9a-f]{64}$/i.test(salt)) {
      throw new Error("Invalid scrypt salt");
    }
    if (!salt) {
      random = new Uint8Array(32);
      salt = Buffer.from(await crypto.rng(random)).toString("hex");
    }
    const scryptParams: ScryptParams = {
      salt,
      dklen: 32,
      n: 131072,
      r: 8,
      p: 1,
    };
    const derivedKey = await deriveKey(
      crypto,
      kdf,
      password,
      scryptParams,
      options
    );
    const buf = Buffer.from(text);
    let macPayload: Uint8Array | undefined;
    try {
      random = new Uint8Array(16);
      const iv = Buffer.from(await crypto.rng(random));
      const counter = new Counter(0);
      counter.setBytes(iv);
      const aesCtr = new AES.ModeOfOperation.ctr(derivedKey, counter);
      const ciphertext = Buffer.from(aesCtr.encrypt(buf));
      macPayload = Buffer.concat([
        Buffer.from(derivedKey.subarray(derivedKey.length / 2)),
        ciphertext,
      ]);
      const mac = Hash.sha256(macPayload);
      return {
        version: "1.0",
        crypto: {
          cipher: "aes-128-ctr",
          cipherparams: { iv: iv.toString("hex") },
          kdf,
          kdfparams: scryptParams,
          ciphertext: ciphertext.toString("hex"),
          mac: Buffer.from(mac).toString("hex"),
        },
        meta,
      };
    } finally {
      buf.fill(0);
      macPayload?.fill(0);
      derivedKey.fill(0);
    }
  }

  public static async decryptBlob(
    crypto: CommonCrypto,
    blob: {
      version: "1.0";
      crypto: {
        cipher: "aes-128-ctr";
        cipherparams: { iv: string };
        kdf: "scrypt" | "sha256" | "pbkdf2";
        kdfparams: ScryptParams;
        ciphertext: string;
        mac: string;
      };
      meta: Record<string, string>;
    },
    password: string,
    options?: { priority?: ScryptPriority }
  ): Promise<Uint8Array> {
    const derivedKey = await deriveKey(
      crypto,
      blob.crypto.kdf as "scrypt" | "sha256" | "pbkdf2",
      password,
      blob.crypto.kdfparams as ScryptParams,
      options
    );
    let macPayload: Uint8Array | undefined;
    try {
      const counter = new Counter(0);
      counter.setBytes(Buffer.from(blob.crypto.cipherparams.iv, "hex"));
      const aesCtr = new AES.ModeOfOperation.ctr(derivedKey, counter);
      const ciphertext = Buffer.from(blob.crypto.ciphertext, "hex");
      macPayload = Buffer.concat([
        Buffer.from(derivedKey.subarray(derivedKey.length / 2)),
        ciphertext,
      ]);
      const mac = Hash.sha256(macPayload);
      if (!Buffer.from(mac).equals(Buffer.from(blob.crypto.mac, "hex"))) {
        throw new Error("Unmatched mac");
      }
      return Buffer.from(aesCtr.decrypt(ciphertext));
    } finally {
      macPayload?.fill(0);
      derivedKey.fill(0);
    }
  }

  public static async decrypt(
    crypto: CommonCrypto,
    keyStore: KeyStore,
    password: string,
    options?: { priority?: ScryptPriority }
  ): Promise<Uint8Array> {
    const derivedKey = await deriveKey(
      crypto,
      keyStore.crypto.kdf as "scrypt" | "sha256" | "pbkdf2",
      password,
      keyStore.crypto.kdfparams as ScryptParams,
      options
    );
    let macPayload: Uint8Array | undefined;
    try {
      const counter = new Counter(0);
      counter.setBytes(Buffer.from(keyStore.crypto.cipherparams.iv, "hex"));
      const aesCtr = new AES.ModeOfOperation.ctr(derivedKey, counter);
      const ciphertext = Buffer.from(keyStore.crypto.ciphertext, "hex");
      macPayload = Buffer.concat([
        Buffer.from(derivedKey.subarray(derivedKey.length / 2)),
        ciphertext,
      ]);
      const mac = Hash.sha256(macPayload);
      if (!Buffer.from(mac).equals(Buffer.from(keyStore.crypto.mac, "hex"))) {
        throw new Error("Unmatched mac");
      }
      return Buffer.from(aesCtr.decrypt(ciphertext));
    } finally {
      macPayload?.fill(0);
      derivedKey.fill(0);
    }
  }
}
