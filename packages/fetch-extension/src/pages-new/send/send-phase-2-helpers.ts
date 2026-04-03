import { EmptyAddressError } from "@keplr-wallet/hooks";

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
