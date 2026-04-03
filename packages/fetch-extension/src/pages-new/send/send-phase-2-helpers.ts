import { EmptyAddressError } from "@keplr-wallet/hooks";
import { Dec, DecUtils } from "@keplr-wallet/unit";
import { lovelacesToAdaString } from "@keplr-wallet/cardano";

const MIN_OUTPUT_LOVELACE_REGEX =
  /minimum output value is (\d+) lovelace/i;

const trimTrailingZeros = (value: string): string =>
  value.replace(/\.?0+$/, "");

export const getMinimumDisplayAmountFromDecimals = (decimals: number): string => {
  if (decimals <= 0) {
    return "1";
  }

  const zeroes = "0".repeat(Math.max(0, decimals - 1));
  return `0.${zeroes}1`;
};

export const isPositiveDecimalAmount = (amount: string): boolean => {
  try {
    return new Dec(amount).gt(new Dec(0));
  } catch {
    return false;
  }
};

export const parseAmountToBaseUnits = (
  amount: string,
  decimals: number
): bigint => {
  const decimalAmount = new Dec(amount ? amount : "0");
  const scaledAmount = decimalAmount
    .mul(DecUtils.getTenExponentNInPrecisionRange(decimals))
    .truncate()
    .toString();

  return BigInt(scaledAmount);
};

export const normalizeCardanoDraftError = (params: {
  rawError: string | null | undefined;
  cardanoDenom: string;
  sendCurrencyDenom?: string;
  sendCurrencyCoinDecimals: number;
  nativeAdaCoinDecimals: number;
}): string | null => {
  const rawError = params.rawError?.trim();
  if (!rawError) {
    return null;
  }

  if (rawError === "recipient address is empty") {
    return "Recipient address is required";
  }

  if (rawError === "amount must be a positive number") {
    const minAda = trimTrailingZeros(
      lovelacesToAdaString("1", params.sendCurrencyCoinDecimals)
    );
    return `Amount too small. Minimum sendable amount is ${minAda} ${params.cardanoDenom}`;
  }

  if (rawError === "asset amount must be positive") {
    const minDisplayAmount = getMinimumDisplayAmountFromDecimals(
      params.sendCurrencyCoinDecimals
    );
    const denom = params.sendCurrencyDenom ?? "token";
    return `Amount too small. Minimum sendable amount is ${minDisplayAmount} ${denom}`;
  }

  const minOutputMatch = rawError.match(MIN_OUTPUT_LOVELACE_REGEX);
  if (minOutputMatch) {
    const [, minLovelace] = minOutputMatch;
    const minAda = trimTrailingZeros(
      lovelacesToAdaString(minLovelace, params.nativeAdaCoinDecimals)
    );
    return `Amount too small. Minimum required is ${minAda} ${params.cardanoDenom}`;
  }

  return rawError;
};

/**
 * Post-recipient slice of sendConfigError — same sources/order as SendPhase2, excluding recipientConfig.
 */
export function getHighestPriorityNonRecipientBlockingError(params: {
  amountError: Error | undefined;
  memoError: Error | undefined;
  isCardano: boolean;
  normalizedCardanoDraftError: string | null;
  cardanoDraft: { draftId: string } | null | undefined;
  isBuildingCardanoDraft: boolean;
  gasError: Error | undefined;
  feeError: Error | undefined;
}): Error | undefined {
  const cardanoOrFeeGas = params.isCardano
    ? params.normalizedCardanoDraftError
      ? new Error(params.normalizedCardanoDraftError)
      : !params.cardanoDraft && !params.isBuildingCardanoDraft
      ? new Error("Transaction is not ready")
      : undefined
    : params.gasError ?? params.feeError;

  return params.amountError ?? params.memoError ?? cardanoOrFeeGas;
}

export function isOnlyEmptyRecipientBlocking(
  recipientError: Error | undefined,
  postRecipientError: Error | undefined
): boolean {
  return (
    recipientError instanceof EmptyAddressError && postRecipientError == null
  );
}

/**
 * Validation banner error (red box). Operational guards (syncing, offline, building draft) are handled separately in the UI.
 */
export function getBannerValidationError(params: {
  sendConfigError: Error | undefined;
  recipientError: Error | undefined;
  postRecipientError: Error | undefined;
  recipientTouched: boolean;
  reviewAttempted: boolean;
}): Error | null {
  const {
    sendConfigError,
    recipientError,
    postRecipientError,
    recipientTouched,
    reviewAttempted,
  } = params;

  if (sendConfigError == null) {
    return null;
  }

  if (recipientError instanceof EmptyAddressError) {
    if (postRecipientError != null) {
      return postRecipientError;
    }
    if (recipientTouched || reviewAttempted) {
      return recipientError;
    }
    return null;
  }

  return sendConfigError;
}

export function shouldEnableReviewWhenInvalid(params: {
  onlyEmptyRecipientBlocking: boolean;
  recipientTouched: boolean;
  reviewAttempted: boolean;
}): boolean {
  return (
    params.onlyEmptyRecipientBlocking &&
    !params.recipientTouched &&
    !params.reviewAttempted
  );
}

export function isReviewTransactionButtonDisabled(params: {
  operationalDisabled: boolean;
  txStateIsValid: boolean;
  onlyEmptyRecipientBlocking: boolean;
  recipientTouched: boolean;
  reviewAttempted: boolean;
}): boolean {
  if (params.operationalDisabled) {
    return true;
  }
  if (params.txStateIsValid) {
    return false;
  }
  return !shouldEnableReviewWhenInvalid({
    onlyEmptyRecipientBlocking: params.onlyEmptyRecipientBlocking,
    recipientTouched: params.recipientTouched,
    reviewAttempted: params.reviewAttempted,
  });
}
