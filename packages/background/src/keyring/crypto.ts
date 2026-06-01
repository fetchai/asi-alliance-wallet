// eslint-disable-next-line @typescript-eslint/no-var-requires
const aesjs = require("aes-js");
const AES = aesjs;
const Counter = aesjs.Counter;
import {
  BIP44HDPath,
  ScryptParams,
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
  scryptParams: ScryptParams
): Promise<Uint8Array> {
  switch (kdf) {
    case "scrypt":
      return crypto.scrypt(password, scryptParams);
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
    text: string,
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
    const buf = Buffer.from(text);
    random = new Uint8Array(16);
    const iv = Buffer.from(await crypto.rng(random));
    const counter = new Counter(0);
    counter.setBytes(iv);
    const aesCtr = new AES.ModeOfOperation.ctr(derivedKey, counter);
    const ciphertext = Buffer.from(aesCtr.encrypt(buf));
    // Mac is sha256(last 16 bytes of derived key + ciphertext)
    const mac = Hash.sha256(
      Buffer.concat([
        Buffer.from(derivedKey.slice(derivedKey.length / 2)),
        ciphertext,
      ])
    );
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
  }

  public static async encryptBlob(
    crypto: CommonCrypto,
    kdf: "scrypt" | "sha256" | "pbkdf2",
    text: string,
    password: string,
    meta: Record<string, string>
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
    const buf = Buffer.from(text);
    random = new Uint8Array(16);
    const iv = Buffer.from(await crypto.rng(random));
    const counter = new Counter(0);
    counter.setBytes(iv);
    const aesCtr = new AES.ModeOfOperation.ctr(derivedKey, counter);
    const ciphertext = Buffer.from(aesCtr.encrypt(buf));
    const mac = Hash.sha256(
      Buffer.concat([
        Buffer.from(derivedKey.slice(derivedKey.length / 2)),
        ciphertext,
      ])
    );
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
    password: string
  ): Promise<Uint8Array> {
    const derivedKey = await deriveKey(
      crypto,
      blob.crypto.kdf as "scrypt" | "sha256" | "pbkdf2",
      password,
      blob.crypto.kdfparams as ScryptParams
    );
    const counter = new Counter(0);
    counter.setBytes(Buffer.from(blob.crypto.cipherparams.iv, "hex"));
    const aesCtr = new AES.ModeOfOperation.ctr(derivedKey, counter);
    const mac = Hash.sha256(
      Buffer.concat([
        Buffer.from(derivedKey.slice(derivedKey.length / 2)),
        Buffer.from(blob.crypto.ciphertext, "hex"),
      ])
    );
    if (!Buffer.from(mac).equals(Buffer.from(blob.crypto.mac, "hex"))) {
      throw new Error("Unmatched mac");
    }
    return Buffer.from(
      aesCtr.decrypt(Buffer.from(blob.crypto.ciphertext, "hex"))
    );
  }

  public static async decrypt(
    crypto: CommonCrypto,
    keyStore: KeyStore,
    password: string
  ): Promise<Uint8Array> {
    const derivedKey = await deriveKey(
      crypto,
      keyStore.crypto.kdf as "scrypt" | "sha256" | "pbkdf2",
      password,
      keyStore.crypto.kdfparams as ScryptParams
    );
    const counter = new Counter(0);
    counter.setBytes(Buffer.from(keyStore.crypto.cipherparams.iv, "hex"));
    const aesCtr = new AES.ModeOfOperation.ctr(derivedKey, counter);
    const mac = Hash.sha256(
      Buffer.concat([
        Buffer.from(derivedKey.slice(derivedKey.length / 2)),
        Buffer.from(keyStore.crypto.ciphertext, "hex"),
      ])
    );
    if (!Buffer.from(mac).equals(Buffer.from(keyStore.crypto.mac, "hex"))) {
      throw new Error("Unmatched mac");
    }
    return Buffer.from(
      aesCtr.decrypt(Buffer.from(keyStore.crypto.ciphertext, "hex"))
    );
  }
}
