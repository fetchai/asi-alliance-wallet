import { TransportIniter } from "./options";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { publicKeyConvert, signatureImport } from "secp256k1";
import Eth from "@ledgerhq/hw-app-eth";
import { EthSignType } from "@keplr-wallet/types";
import { BIP44HDPath, EIP712MessageValidator } from "../keyring";
import { serialize } from "@ethersproject/transactions";
import { Buffer } from "buffer/";
import { domainHash, messageHash } from "../keyring/utils";
import { CosmosApp } from "@keplr-wallet/ledger-cosmos";
import {
  ErrCodeAppNotInitialised,
  ErrCodeDeviceLocked,
  ErrCodeUnsupportedApp,
  ErrFailedGetPublicKey,
  ErrFailedGetVersion,
  ErrFailedInit,
  ErrFailedSign,
  ErrModuleLedgerSign,
} from "./types";
import { WalletError } from "@keplr-wallet/router";

export enum LedgerApp {
  Cosmos = "cosmos",
  Ethereum = "ethereum",
}

export const LedgerWebUSBIniter: TransportIniter = async () => {
  return await TransportWebUSB.create();
};

export const LedgerWebHIDIniter: TransportIniter = async () => {
  return await TransportWebHID.create();
};

export class Ledger {
  constructor(
    public readonly cosmosApp: CosmosApp | undefined = undefined,
    public readonly ethereumApp: Eth | undefined = undefined
  ) {}

  static async init(
    transportIniter: TransportIniter,
    initArgs: any[] = [],
    app: LedgerApp,
    cosmosLikeApp: string
  ): Promise<Ledger> {
    let transport;
    try {
      transport = await transportIniter(...initArgs);
    } catch (e) {
      throw new WalletError(
        ErrModuleLedgerSign,
        ErrFailedInit,
        "Connect and unlock your Ledger device."
      );
    }

    try {
      if (app === LedgerApp.Ethereum) {
        const ethereumApp = new Eth(transport);

        // Ensure that the keplr can connect to ethereum app on ledger.
        // getAppConfiguration() works even if the ledger is on screen saver mode.
        // To detect the screen saver mode, we should request the address before using.
        await ethereumApp.getAddress("m/44'/60'/0'/0/0");

        return new Ledger(undefined, ethereumApp);
      }

      const cosmosApp = new CosmosApp(cosmosLikeApp, transport);

      const ledger = new Ledger(cosmosApp, undefined);
      const versionResponse = await ledger.getVersion();

      // In this case, device is on screen saver.
      // However, it is almost same as that the device is not unlocked to user-side.
      // So, handle this case as initializing failed in `Transport`.
      if (versionResponse.deviceLocked) {
        throw new WalletError(
          ErrModuleLedgerSign,
          ErrCodeDeviceLocked,
          "Unlock your Ledger device."
        );
      }

      let appName = "";
      try {
        const appInfo = await cosmosApp.getAppInfo();
        appName = appInfo.app_name;
      } catch (e) {
        console.log(e);
      }
      if (appName && appName !== cosmosLikeApp) {
        throw new WalletError(
          ErrModuleLedgerSign,
          ErrCodeUnsupportedApp,
          "Invalid cosmos app selected"
        );
      }

      return ledger;
    } catch (e) {
      if (transport) {
        await transport.close();
      }

      if (
        e.message === "Device is on screen saver" ||
        e.message?.includes("Unknown Status Code: 21781")
      ) {
        throw new WalletError(
          ErrModuleLedgerSign,
          ErrCodeDeviceLocked,
          "Unlock your Ledger device."
        );
      }

      throw new WalletError(
        ErrModuleLedgerSign,
        ErrCodeAppNotInitialised,
        `Open the ${cosmosLikeApp} app on Ledger and try again.`
      );
    }
  }

  async getVersion(): Promise<{
    deviceLocked: boolean;
    major: number;
    minor: number;
    patch: number;
    targetId: string;
    testMode: boolean;
  }> {
    if (!this.cosmosApp) {
      throw new WalletError(
        ErrModuleLedgerSign,
        ErrCodeAppNotInitialised,
        "Please initialize Cosmos app first"
      );
    }

    const result = await this.cosmosApp.getVersion();

    if (result.error_message !== "No errors") {
      throw new WalletError(
        ErrModuleLedgerSign,
        ErrFailedGetVersion,
        result.error_message
      );
    }

    return {
      deviceLocked: result.device_locked ?? false,
      major: result.major,
      minor: result.minor,
      patch: result.patch,
      targetId: result.target_id,
      testMode: result.test_mode,
    };
  }

  async getPublicKey(app: LedgerApp, fields: BIP44HDPath): Promise<Uint8Array> {
    if (app === LedgerApp.Ethereum) {
      if (!this.ethereumApp) {
        throw new WalletError(
          ErrModuleLedgerSign,
          ErrCodeAppNotInitialised,
          "Please initialize Ethereum app first"
        );
      }

      try {
        const result = await this.ethereumApp.getAddress(
          Ledger.pathToString(Ledger.createPath(60, fields))
        );

        const pubKey = Buffer.from(result.publicKey, "hex");
        // Compress the public key
        return publicKeyConvert(pubKey, true);
      } catch (e: any) {
        throw new WalletError(ErrModuleLedgerSign, e);
      }
    } else {
      if (!this.cosmosApp) {
        throw new WalletError(
          ErrModuleLedgerSign,
          ErrCodeAppNotInitialised,
          "Please initialize Cosmos app first"
        );
      }

      const result = await this.cosmosApp.getPublicKey(
        fields.account,
        fields.change,
        fields.addressIndex
      );
      if (result.error_message !== "No errors") {
        throw new WalletError(
          ErrModuleLedgerSign,
          ErrFailedGetPublicKey,
          result.error_message
        );
      }

      return result.compressed_pk;
    }
  }

  async sign(fields: BIP44HDPath, message: Uint8Array): Promise<Uint8Array> {
    if (!this.cosmosApp) {
      throw new WalletError(
        ErrModuleLedgerSign,
        ErrCodeAppNotInitialised,
        "Please initialize Cosmos app first"
      );
    }

    const result = await this.cosmosApp.sign(
      fields.account,
      fields.change,
      fields.addressIndex,
      message
    );
    if (result.error_message !== "No errors") {
      throw new WalletError(
        ErrModuleLedgerSign,
        ErrFailedSign,
        result.error_message
      );
    }

    // Parse a DER ECDSA signature
    return signatureImport(result.signature);
  }

  async signEthereum(
    fields: BIP44HDPath,
    signType: EthSignType,
    message: Uint8Array
  ) {
    if (!this.ethereumApp) {
      throw new WalletError(
        ErrModuleLedgerSign,
        ErrCodeAppNotInitialised,
        "Please initialize Ethereum app first"
      );
    }

    const formattedPath = Ledger.pathToString(Ledger.createPath(60, fields));

    switch (signType) {
      case EthSignType.MESSAGE: {
        const signature = await this.ethereumApp.signPersonalMessage(
          formattedPath,
          Buffer.from(message).toString("hex")
        );
        return Ledger.ethSignatureToBytes(signature);
      }
      case EthSignType.TRANSACTION: {
        const tx = JSON.parse(Buffer.from(message).toString());
        const rlpArray = serialize(tx).replace("0x", "");

        const signature = await this.ethereumApp.signTransaction(
          formattedPath,
          rlpArray
        );

        const signedTx = serialize(tx, {
          r: `0x${signature.r}`,
          s: `0x${signature.s}`,
          v: parseInt(signature.v, 16),
        }).replace("0x", "");

        return Buffer.from(signedTx, "hex");
      }
      case EthSignType.EIP712: {
        const data = await EIP712MessageValidator.validateAsync(
          JSON.parse(Buffer.from(message).toString())
        );

        // Unfortunately, signEIP712Message not works on ledger yet.
        return Ledger.ethSignatureToBytes(
          await this.ethereumApp.signEIP712HashedMessage(
            formattedPath,
            domainHash(data),
            messageHash(data)
          )
        );
      }
      default:
        throw new Error(`Unknown sign type: ${signType}`);
    }
  }

  async close(): Promise<void> {
    if (this.cosmosApp) {
      await this.cosmosApp.transport.close();
    }
    if (this.ethereumApp) {
      await this.ethereumApp.transport.close();
    }
  }

  static async isWebHIDSupported(): Promise<boolean> {
    return await TransportWebHID.isSupported();
  }

  static createPath(coinType: number, fields: BIP44HDPath) {
    return [44, coinType, fields.account, fields.change, fields.addressIndex];
  }

  // Convert a path represented by number[] to the string format
  // expected by the Ethereum Ledger app.
  static pathToString(path: number[]): string {
    if (path.length !== 5) {
      throw new Error(`Invalid path for bip44: ${path.join(",")}`);
    }

    let res = "m";
    let c = 0;
    path.forEach((el) => {
      res = res.concat(`/${el}`);
      // Harden the first three values by default
      if (c < 3) {
        res = res.concat("'");
      }
      c++;
    });

    return res;
  }

  // Convert an Ethereum signature object to bytes to be returned.
  static ethSignatureToBytes(signature: {
    v: number;
    r: string;
    s: string;
  }): Uint8Array {
    // Validate signature.r is hex encoded
    const r = Buffer.from(signature.r, "hex");
    // Validate signature.s is hex encoded
    const s = Buffer.from(signature.s, "hex");

    // Must be 32 bytes
    if (r.length !== 32 || s.length !== 32) {
      throw new Error("Unable to process signature: malformed fields");
    }

    if (!Number.isInteger(signature.v)) {
      throw new Error("Unable to process signature: malformed fields");
    }

    return Buffer.concat([r, s, Buffer.from([signature.v])]);
  }
}
