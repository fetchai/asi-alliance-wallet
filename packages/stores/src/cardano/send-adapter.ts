import { AppCurrency } from "@keplr-wallet/types";
import { DenomHelper } from "@keplr-wallet/common";
import { MakeTxResponse } from "../account/types";
import { MessageRequester, BACKGROUND_PORT } from "@keplr-wallet/router";
import {
  EstimateSendAdaMsg,
  BuildSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftWithPasswordMsg,
  DiscardSendAdaTxDraftMsg,
} from "@keplr-wallet/background";
import type { CardanoAssetAmount } from "@keplr-wallet/background";
import type { KeplrSignOptions } from "@keplr-wallet/types";
import { CARDANO_NATIVE_TOKEN_TYPE } from "../query/cardano/token-balance-registry";

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
 * Supports both ADA-only and multi-asset (native token) transactions.
 */
export class CardanoSendAdapter {
  constructor(
    private readonly messageRequester: MessageRequester,
    private readonly chainId: string
  ) {}

  /**
   * Creates transaction handle for Cardano ADA or native token transfers.
   */
  makeSendTokenTx(
    amount: string,
    currency: AppCurrency,
    recipient: string
  ): MakeTxResponse | undefined {
    const denomHelper = new DenomHelper(currency.coinMinimalDenom);

    const isNativeAda = denomHelper.type === "native";
    const isCardanoToken = denomHelper.type === CARDANO_NATIVE_TOKEN_TYPE;

    if (!isNativeAda && !isCardanoToken) {
      return undefined;
    }

    // Convert display amount to base units
    const actualAmount = (() => {
      let dec = parseFloat(amount);
      dec = dec * Math.pow(10, currency.coinDecimals);
      return Math.floor(dec).toString();
    })();

    // Build assets array for native token sends
    let assets: CardanoAssetAmount[] | undefined;
    let lovelaceAmount = actualAmount;
    if (isCardanoToken) {
      const assetId = denomHelper.contractAddress;
      assets = [{ assetId, amount: actualAmount }];
      // ADA amount is "0" -- minAda will be auto-calculated by the SDK
      lovelaceAmount = "0";
    }

    // Shared send logic: build message, broadcast, fire events
    const executeSend = async (
      _memo?: string,
      _signOptions?: KeplrSignOptions,
      onTxEvents?: any
    ) => {
      let draftId: string | undefined;
      try {
        const draft = (await this.messageRequester.sendMessage(
          BACKGROUND_PORT,
          new BuildSendAdaTxDraftMsg(
            recipient,
            lovelaceAmount,
            _memo,
            this.chainId,
            assets
          )
        )) as { draftId: string };
        draftId = draft.draftId;

        const spendingPassword = getCardanoSpendingPassword(_signOptions);
        const txHash = await this.messageRequester.sendMessage(
          BACKGROUND_PORT,
          spendingPassword
            ? new SubmitSendAdaTxDraftWithPasswordMsg(
                draftId,
                spendingPassword,
                this.chainId
              )
            : new SubmitSendAdaTxDraftMsg(draftId, this.chainId)
        ) as string;

        if (onTxEvents?.onBroadcasted) {
          onTxEvents.onBroadcasted(Buffer.from(txHash));
        }
        if (onTxEvents?.onFulfill) {
          onTxEvents.onFulfill({ txHash });
        }
      } catch (error) {
        if (draftId) {
          try {
            await this.messageRequester.sendMessage(
              BACKGROUND_PORT,
              new DiscardSendAdaTxDraftMsg(draftId)
            );
          } catch {
            // Ignore cleanup errors.
          }
        }
        if (onTxEvents?.onBroadcastFailed) {
          onTxEvents.onBroadcastFailed(error);
        }
        throw error;
      }
    };

    return {
      msgs: async () => ({ aminoMsgs: [], protoMsgs: [] }),
      simulate: async () => {
        const estimateMsg = new EstimateSendAdaMsg(
          recipient, lovelaceAmount, undefined, this.chainId, assets
        );
        const estimate = await this.messageRequester.sendMessage(BACKGROUND_PORT, estimateMsg) as {
          fee: string;
          total: string;
          minAdaForTokens?: string;
        };
        return { gasUsed: parseInt(estimate.fee, 10) };
      },
      send: async (_fee: any, _memo?: string, _signOptions?: KeplrSignOptions, onTxEvents?: any) => {
        await executeSend(_memo, _signOptions, onTxEvents);
      },
      simulateAndSend: async (_feeOptions: any, _memo?: string, _signOptions?: KeplrSignOptions, onTxEvents?: any) => {
        await executeSend(_memo, _signOptions, onTxEvents);
      },
      sendWithGasPrice: async (_gasInfo: any, _memo?: string, _signOptions?: KeplrSignOptions, onTxEvents?: any) => {
        await executeSend(_memo, _signOptions, onTxEvents);
      }
    };
  }
}
