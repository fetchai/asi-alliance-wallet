import { AppCurrency } from "@keplr-wallet/types";
import { DenomHelper } from "@keplr-wallet/common";
import { MakeTxResponse } from "../account/types";
import { MessageRequester, BACKGROUND_PORT } from "@keplr-wallet/router";
import { 
  EstimateSendAdaMsg, 
  SendAdaMsg,
  SendAdaWithPasswordMsg,
} from "@keplr-wallet/background";
import type { KeplrSignOptions } from "@keplr-wallet/types";

type CardanoSignOptions = KeplrSignOptions & {
  cardano?: {
    spendingPassword?: string;
  };
};

function getCardanoSpendingPassword(
  signOptions?: KeplrSignOptions
): string | undefined {
  return (signOptions as CardanoSignOptions | undefined)?.cardano?.spendingPassword;
}

/**
 * Cardano transaction adapter that implements the unified Tx handle interface.
 */
export class CardanoSendAdapter {
  constructor(
    private readonly messageRequester: MessageRequester,
    private readonly chainId: string
  ) {}

  /**
   * Creates transaction handle for Cardano ADA transfers
   */
  makeSendTokenTx(
    amount: string,
    currency: AppCurrency,
    recipient: string
  ): MakeTxResponse | undefined {
    const denomHelper = new DenomHelper(currency.coinMinimalDenom);

    // Only handle native Cardano currency (ADA)
    if (denomHelper.type !== "native") {
      return undefined;
    }

    // Convert ADA to lovelace (1 ADA = 1,000,000 lovelace)
    const actualAmount = (() => {
      let dec = parseFloat(amount);
      dec = dec * Math.pow(10, currency.coinDecimals);
      return Math.floor(dec).toString();
    })();

    return {
      msgs: async () => {
        // Cardano doesn't use amino/proto msgs, return empty structure
        return {
          aminoMsgs: [],
          protoMsgs: []
        };
      },
      simulate: async () => {
        try {
          const estimate = await this.messageRequester.sendMessage(
            BACKGROUND_PORT,
            new EstimateSendAdaMsg(recipient, actualAmount, this.chainId)
          );

          return {
            gasUsed: parseInt(estimate.fee, 10)
          };
        } catch (error) {
          throw error;
        }
      },
      send: async (
        _fee: any,
        _memo?: string,
        _signOptions?: KeplrSignOptions,
        onTxEvents?: any
      ) => {
        try {
          const spendingPassword = getCardanoSpendingPassword(_signOptions);
          const msg = spendingPassword
            ? new SendAdaWithPasswordMsg(
              recipient,
              actualAmount,
              spendingPassword,
              _memo,
              this.chainId
            )
            : new SendAdaMsg(recipient, actualAmount, _memo, this.chainId);

          const txHash = await this.messageRequester.sendMessage(
            BACKGROUND_PORT,
            msg
          );

          if (onTxEvents?.onBroadcasted) {
            onTxEvents.onBroadcasted(Buffer.from(txHash));
          }

          if (onTxEvents?.onFulfill) {
            onTxEvents.onFulfill({ txHash });
          }
        } catch (error) {
          if (onTxEvents?.onBroadcastFailed) {
            onTxEvents.onBroadcastFailed(error);
          }
          throw error;
        }
      },
      simulateAndSend: async (
        _feeOptions: any,
        _memo?: string,
        _signOptions?: KeplrSignOptions,
        onTxEvents?: any
      ) => {
        try {
          const spendingPassword = getCardanoSpendingPassword(_signOptions);
          const msg = spendingPassword
            ? new SendAdaWithPasswordMsg(
              recipient,
              actualAmount,
              spendingPassword,
              _memo,
              this.chainId
            )
            : new SendAdaMsg(recipient, actualAmount, _memo, this.chainId);

          const txHash = await this.messageRequester.sendMessage(
            BACKGROUND_PORT,
            msg
          );

          if (onTxEvents?.onBroadcasted) {
            onTxEvents.onBroadcasted(Buffer.from(txHash));
          }

          if (onTxEvents?.onFulfill) {
            onTxEvents.onFulfill({ txHash });
          }
        } catch (error) {
          if (onTxEvents?.onBroadcastFailed) {
            onTxEvents.onBroadcastFailed(error);
          }
          throw error;
        }
      },
      sendWithGasPrice: async (
        _gasInfo: any,
        _memo?: string,
        _signOptions?: KeplrSignOptions,
        onTxEvents?: any
      ) => {
        try {
          const spendingPassword = getCardanoSpendingPassword(_signOptions);
          const msg = spendingPassword
            ? new SendAdaWithPasswordMsg(
              recipient,
              actualAmount,
              spendingPassword,
              _memo,
              this.chainId
            )
            : new SendAdaMsg(recipient, actualAmount, _memo, this.chainId);

          const txHash = await this.messageRequester.sendMessage(
            BACKGROUND_PORT,
            msg
          );

          if (onTxEvents?.onBroadcasted) {
            onTxEvents.onBroadcasted(Buffer.from(txHash));
          }

          if (onTxEvents?.onFulfill) {
            onTxEvents.onFulfill({ txHash });
          }
        } catch (error) {
          if (onTxEvents?.onBroadcastFailed) {
            onTxEvents.onBroadcastFailed(error);
          }
          throw error;
        }
      }
    };
  }
}

