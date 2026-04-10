import { AppCurrency } from "@keplr-wallet/types";
import { DenomHelper } from "@keplr-wallet/common";
import {
  cardanoMalformedMinimumPayloadError,
  formatCardanoMinimumViolationMessage,
  mapCardanoMinimumViolation,
} from "@keplr-wallet/cardano";
import { MakeTxResponse } from "../account/types";
import { MessageRequester, BACKGROUND_PORT } from "@keplr-wallet/router";
import {
  BuildSendAdaTxDraftMsg,
  BuildSendAdaTxDraftResult,
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

function displayAmountToBaseUnits(amount: string, decimals: number): string {
  const normalized = amount.trim();
  if (!normalized) {
    throw new Error("Amount is empty");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Invalid amount format");
  }

  const [wholePart, fractionPartRaw = ""] = normalized.split(".");
  const truncatedFraction = fractionPartRaw.slice(0, decimals);
  const paddedFraction = truncatedFraction.padEnd(decimals, "0");
  const units = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "");
  return units || "0";
}

function getCardanoSpendingPassword(
  signOptions?: KeplrSignOptions
): string | undefined {
  return (signOptions as CardanoSignOptions | undefined)?.cardano?.spendingPassword;
}

function isPositiveDecimalString(value: string): boolean {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return false;
  const [whole, fraction = ""] = normalized.split(".");
  return /[1-9]/.test(whole) || /[1-9]/.test(fraction);
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

    const normalizedRecipient = recipient.trim();

    // Convert display amount to base units
    const actualAmount = displayAmountToBaseUnits(amount, currency.coinDecimals);

    // Build assets array for native token sends
    let assets: CardanoAssetAmount[] | undefined;
    let lovelaceAmount = actualAmount;
    if (isCardanoToken) {
      const assetId = denomHelper.contractAddress;
      assets = [{ assetId, amount: actualAmount }];
      // ADA amount is "0" -- minAda will be auto-calculated by the SDK
      lovelaceAmount = "0";
    }

    const allowZeroForMinimumCheck =
      isNativeAda && actualAmount === "0" && isPositiveDecimalString(amount);
    const throwFromMinimumViolationDraft = (params: {
      minimumOutputLovelace: string;
      coinMissingLovelace?: string;
    }): never => {
      const violation = mapCardanoMinimumViolation({
        minimumOutputLovelace: params.minimumOutputLovelace,
        coinMissingLovelace: params.coinMissingLovelace,
      });
      if (!violation) {
        throw cardanoMalformedMinimumPayloadError("Failed to build transaction");
      }
      throw new Error(
        formatCardanoMinimumViolationMessage({
          violation,
          cardanoDenom: currency.coinDenom,
          nativeAdaCoinDecimals: currency.coinDecimals,
        })
      );
    };
    const safeDiscardDraft = async (draftId?: string) => {
      if (!draftId) return;
      try {
        await this.messageRequester.sendMessage(
          BACKGROUND_PORT,
          new DiscardSendAdaTxDraftMsg(draftId)
        );
      } catch {
        // Ignore cleanup errors.
      }
    };

    // Shared send logic: build message, broadcast, fire events
    const executeSend = async (
      _memo?: string,
      _signOptions?: KeplrSignOptions,
      onTxEvents?: any
    ) => {
      if (!normalizedRecipient) {
        throw new Error("Recipient address is required");
      }

      let draftId: string | undefined;
      try {
        const draftResult = (await this.messageRequester.sendMessage(
          BACKGROUND_PORT,
          new BuildSendAdaTxDraftMsg(
            normalizedRecipient,
            lovelaceAmount,
            _memo,
            this.chainId,
            assets,
            allowZeroForMinimumCheck
          )
        )) as BuildSendAdaTxDraftResult;
        if (draftResult.kind === "minimum_violation") {
          throwFromMinimumViolationDraft({
            minimumOutputLovelace: draftResult.minimumOutputLovelace,
            coinMissingLovelace: draftResult.coinMissingLovelace,
          });
        }
        if (draftResult.kind !== "draft") {
          throw new Error("Unexpected Cardano draft build response");
        }
        draftId = draftResult.draftId;

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
        await safeDiscardDraft(draftId);
        if (onTxEvents?.onBroadcastFailed) {
          onTxEvents.onBroadcastFailed(error);
        }
        throw error;
      }
    };

    return {
      msgs: async () => ({ aminoMsgs: [], protoMsgs: [] }),
      simulate: async () => {
        if (!normalizedRecipient) {
          throw new Error("Recipient address is required");
        }
        const draftResult = (await this.messageRequester.sendMessage(
          BACKGROUND_PORT,
          new BuildSendAdaTxDraftMsg(
            normalizedRecipient,
            lovelaceAmount,
            undefined,
            this.chainId,
            assets,
            allowZeroForMinimumCheck
          )
        )) as BuildSendAdaTxDraftResult;
        if (draftResult.kind === "minimum_violation") {
          throwFromMinimumViolationDraft({
            minimumOutputLovelace: draftResult.minimumOutputLovelace,
            coinMissingLovelace: draftResult.coinMissingLovelace,
          });
        }
        if (draftResult.kind !== "draft") {
          throw new Error("Unexpected Cardano draft build response");
        }
        await safeDiscardDraft(draftResult.draftId);
        return { gasUsed: parseInt(draftResult.fee, 10) };
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
