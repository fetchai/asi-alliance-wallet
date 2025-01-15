import {
  Ledger,
  LedgerApp,
  LedgerInitError,
  LedgerInitErrorOn,
  LedgerWebHIDIniter,
  LedgerWebUSBIniter,
} from "./ledger";

import { APP_PORT, Env } from "@keplr-wallet/router";
import { BIP44HDPath } from "../keyring";
import { KVStore } from "@keplr-wallet/common";
import { InteractionService } from "../interaction";
import { LedgerOptions } from "./options";
import { Buffer } from "buffer/";
import { EthSignType } from "@keplr-wallet/types";
import { ErrFailedInit, ErrPublicKeyUnmatched } from "./types";

export class LedgerService {
  protected options: LedgerOptions;

  protected interactionService!: InteractionService;

  constructor(
    protected readonly kvStore: KVStore,
    options: Partial<LedgerOptions>
  ) {
    this.options = {
      defaultMode: options.defaultMode || "webusb",
      transportIniters: options.transportIniters ?? {},
    };

    if (!this.options.transportIniters["webusb"]) {
      this.options.transportIniters["webusb"] = LedgerWebUSBIniter;
    }
    if (!this.options.transportIniters["webhid"]) {
      this.options.transportIniters["webhid"] = LedgerWebHIDIniter;
    }
  }

  init(interactionService: InteractionService) {
    this.interactionService = interactionService;
  }

  async tryLedgerInit(
    env: Env,
    ledgerApp: LedgerApp,
    cosmosLikeApp: string = "Cosmos"
  ): Promise<void> {
    await this.getPublicKey(
      env,
      ledgerApp,
      {
        account: 0,
        change: 0,
        addressIndex: 0,
      },
      cosmosLikeApp
    );
  }

  async getPublicKey(
    env: Env,
    ledgerApp: LedgerApp,
    bip44HDPath: BIP44HDPath,
    cosmosLikeApp: string = "Cosmos"
  ): Promise<Uint8Array> {
    return await this.useLedger(
      env,
      ledgerApp,
      async (ledger) => {
        try {
          // Specific apps only support each coin type for app.
          return await ledger.getPublicKey(ledgerApp, bip44HDPath);
        } catch (e) {
          console.log(e);
          throw e;
        }
      },
      cosmosLikeApp
    );
  }

  async sign(
    env: Env,
    bip44HDPath: BIP44HDPath,
    expectedPubKey: Uint8Array,
    message: Uint8Array,
    cosmosLikeApp: string = "Cosmos"
  ): Promise<Uint8Array> {
    const ledgerApp = LedgerApp.Cosmos;

    return await this.useLedger(
      env,
      ledgerApp,
      async (ledger) => {
        try {
          this.interactionService.dispatchEvent(APP_PORT, "ledger-sign", {
            event: "sign-txn-guide",
            isShow: true,
          });
          const pubKey = await ledger.getPublicKey(ledgerApp, bip44HDPath);
          if (
            Buffer.from(expectedPubKey).toString("hex") !==
            Buffer.from(pubKey).toString("hex")
          ) {
            throw new LedgerInitError(
              LedgerInitErrorOn.App,
              ErrPublicKeyUnmatched,
              "Unmatched public key"
            );
          }
          // Cosmos App on Ledger doesn't support the coin type other than 118.
          const signature: Uint8Array = await ledger.sign(bip44HDPath, message);
          // Notify UI Ledger signing succeeded only when Ledger initialization is tried again.
          this.interactionService.dispatchEvent(APP_PORT, "ledger-sign", {
            event: "sign-txn-guide",
            isShow: false,
          });
          return signature;
        } catch (e) {
          this.interactionService.dispatchEvent(APP_PORT, "ledger-sign", {
            event: "sign-txn-guide",
            isShow: false,
          });

          throw e;
        }
      },
      cosmosLikeApp
    );
  }

  async signEthereum(
    env: Env,
    type: EthSignType,
    bip44HDPath: BIP44HDPath,
    expectedPubKey: Uint8Array,
    message: Uint8Array
  ): Promise<Uint8Array> {
    const ledgerApp = LedgerApp.Ethereum;

    return await this.useLedger(env, ledgerApp, async (ledger) => {
      try {
        this.interactionService.dispatchEvent(APP_PORT, "ledger-sign", {
          event: "sign-txn-guide",
          isShow: true,
        });
        const pubKey = await ledger.getPublicKey(ledgerApp, bip44HDPath);
        if (
          Buffer.from(expectedPubKey).toString("hex") !==
          Buffer.from(pubKey).toString("hex")
        ) {
          throw new LedgerInitError(
            LedgerInitErrorOn.App,
            ErrPublicKeyUnmatched,
            "Unmatched public key"
          );
        }
        const signature = await ledger.signEthereum(bip44HDPath, type, message);
        // Notify UI Ledger signing succeeded only when Ledger initialization is tried again.
        this.interactionService.dispatchEvent(APP_PORT, "ledger-sign", {
          event: "sign-txn-guide",
          isShow: false,
        });
        return signature;
      } catch (e) {
        this.interactionService.dispatchEvent(APP_PORT, "ledger-sign", {
          event: "sign-txn-guide",
          isShow: false,
        });
        throw e;
      }
    });
  }

  async useLedger<T>(
    env: Env,
    ledgerApp: LedgerApp,
    fn: (ledger: Ledger) => Promise<T>,
    cosmosLikeApp: string = "Cosmos"
  ): Promise<T> {
    let ledger: { ledger: Ledger } | undefined;
    try {
      ledger = await this.initLedger(env, ledgerApp, cosmosLikeApp);
      return await fn(ledger.ledger);
    } finally {
      if (ledger) {
        await ledger.ledger.close();
      }
    }
  }

  async initLedger(
    env: Env,
    ledgerApp: LedgerApp,
    cosmosLikeApp: string = "Cosmos"
  ): Promise<{ ledger: Ledger }> {
    const initArgs: any[] = [];

    while (true) {
      const mode = await this.getMode();
      try {
        const transportIniter = this.options.transportIniters[mode];
        if (!transportIniter) {
          throw new LedgerInitError(
            LedgerInitErrorOn.App,
            ErrFailedInit,
            `Unknown mode: ${mode}`
          );
        }

        const ledger = await Ledger.init(
          transportIniter,
          initArgs,
          ledgerApp,
          cosmosLikeApp
        );
        this.interactionService.dispatchEvent(APP_PORT, "ledger-init", {
          event: "init-success",
        });
        return {
          ledger,
        };
      } catch (e) {
        this.interactionService.dispatchEventAndData(
          env,
          APP_PORT,
          "ledger-init",
          {
            event: "init-failed",
            ledgerApp,
            cosmosLikeApp,
          }
        );

        throw e;
      }
    }
  }

  /**
   * Mode means that which transport should be used.
   * "webusb" and "webhid" are used in the extension environment (web).
   * Alternatively, custom mode can be supported by delivering the custom transport initer on the constructor.
   * Maybe, the "ble" (bluetooth) mode would be supported in the mobile environment (only with Ledger Nano X).
   */
  async getMode(): Promise<string> {
    // Backward compatibilty for the extension.
    if (await this.getWebHIDFlag()) {
      return "webhid";
    }

    return this.options.defaultMode;
  }

  async getWebHIDFlag(): Promise<boolean> {
    const webHIDFlag = await this.kvStore.get<boolean>("webhid");
    return !!webHIDFlag;
  }

  async setWebHIDFlag(flag: boolean): Promise<void> {
    await this.kvStore.set<boolean>("webhid", flag);
  }
}
