import { EmptyAddressError } from "@keplr-wallet/hooks";
import { Dec, DecUtils } from "@keplr-wallet/unit";
import {
  CardanoUiErrorCode,
  CARDANO_SEND_CONFLICT_PENDING_MESSAGE,
  formatCardanoMinimumViolationMessage,
  mapCardanoMinimumViolation,
  parseCardanoUiError,
} from "@keplr-wallet/cardano";

/**
 * True during Cardano sync/offline operational window: use status banners and disable review
 * instead of showing synthetic validation "Transaction is not ready". Does not include
 * provider_error — those stay validation/draft-error UX unless handled separately.
 * When {@link hasOutgoingPendingSpend} is true, another send is still pending (matches background guard).
 */
export function isCardanoSendOperationalGuard(params: {
  isCardano: boolean;
  isOnline: boolean;
  isCardanoSyncing: boolean;
  hasOutgoingPendingSpend?: boolean;
}): boolean {
  if (!params.isCardano) {
    return false;
  }
  if (!params.isOnline) {
    return true;
  }
  if (params.hasOutgoingPendingSpend) {
    return true;
  }
  if (params.isCardanoSyncing) {
    return true;
  }
  return false;
}

/**
 * Same gate as the Cardano draft build effect in SendPhase2: trimmed recipient, non-empty amount,
 * and no recipient validation error. Until true, missing draft is expected, not a validation failure.
 */
export function isCardanoSendDraftInputsReady(params: {
  recipient: string;
  recipientError: Error | undefined;
  amount: string;
}): boolean {
  return (
    (params.recipient?.trim() ?? "").length > 0 &&
    params.recipientError == null &&
    (params.amount ?? "").length > 0
  );
}

const MIN_OUTPUT_LOVELACE_REGEX =
  /minimum output value is (\d+) lovelace/i;

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

  if (rawError === CARDANO_SEND_CONFLICT_PENDING_MESSAGE) {
    return CARDANO_SEND_CONFLICT_PENDING_MESSAGE;
  }

  if (rawError === "recipient address is empty") {
    return "Recipient address is required";
  }

  // Legacy/non-structured fallback: keep user-facing wording for exact zero.
  if (rawError === "amount must be a positive number") {
    return "Amount must be greater than 0";
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
    const violation = mapCardanoMinimumViolation({
      minimumOutputLovelace: minLovelace,
    });
    if (!violation) {
      return "Failed to build transaction";
    }
    return formatCardanoMinimumViolationMessage({
      violation,
      cardanoDenom: params.cardanoDenom,
      nativeAdaCoinDecimals: params.nativeAdaCoinDecimals,
    });
  }

  // Cardano SDK coin-selection error (e.g. when "max" leaves no UTxO for fee/change).
  if (/\butxo fully depleted\b/i.test(rawError)) {
    return (
      "Insufficient balance to cover amount + fees. " +
      "Try reducing the amount or leaving some balance for transaction fees."
    );
  }

  return rawError;
};

/** User-facing message for structured minimum_violation from BuildSendAdaTxDraftMsg (protocol min UTxO). */
export function formatAdaMinimumViolationMessageFromRawFields(params: {
  minimumOutputLovelace: string;
  coinMissingLovelace?: string;
  cardanoDenom: string;
  nativeAdaCoinDecimals: number;
}): string {
  const violation = mapCardanoMinimumViolation({
    minimumOutputLovelace: params.minimumOutputLovelace,
    coinMissingLovelace: params.coinMissingLovelace,
  });
  if (!violation) {
    return "Failed to build transaction";
  }
  return formatCardanoMinimumViolationMessage({
    violation,
    cardanoDenom: params.cardanoDenom,
    nativeAdaCoinDecimals: params.nativeAdaCoinDecimals,
  });
}

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
  /** When true, omit synthetic "Transaction is not ready" during sync/offline operational guard. */
  cardanoOperationalGuard?: boolean;
  /**
   * When false, omit synthetic "Transaction is not ready" — form input is not sufficient to
   * trigger draft build yet (mirrors {@link isCardanoSendDraftInputsReady}).
   */
  cardanoDraftInputsReady?: boolean;
  gasError: Error | undefined;
  feeError: Error | undefined;
}): Error | undefined {
  const cardanoOrFeeGas = params.isCardano
    ? params.normalizedCardanoDraftError
      ? new Error(params.normalizedCardanoDraftError)
      : !params.cardanoDraft && !params.isBuildingCardanoDraft
      ? params.cardanoOperationalGuard
        ? undefined
        : params.cardanoDraftInputsReady
          ? new Error("Transaction is not ready")
          : undefined
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

const CARDANO_MODAL_LEVEL_ERROR_HINTS = [
  "invalid password",
  "fail to decrypt",
  "password is required",
  "wallet is syncing",
  "please unlock wallet first",
];

export function parseCardanoUiErrorMessage(message: string): {
  code?: CardanoUiErrorCode;
  message: string;
} {
  return parseCardanoUiError(message);
}

export function isCardanoModalLevelErrorMessage(message: string): boolean {
  const parsed = parseCardanoUiErrorMessage(message);
  if (parsed.code) {
    return (
      parsed.code === "invalid_password" ||
      parsed.code === "password_required" ||
      parsed.code === "wallet_locked" ||
      parsed.code === "wallet_syncing"
    );
  }
  const normalizedMessage = parsed.message.toLowerCase();
  return CARDANO_MODAL_LEVEL_ERROR_HINTS.some((hint) =>
    normalizedMessage.includes(hint)
  );
}

export function shouldNavigateCardanoFailedFromError(params: {
  isFromPasswordModal: boolean;
  errorMessage: string;
}): boolean {
  if (!params.isFromPasswordModal) {
    return true;
  }

  return !isCardanoModalLevelErrorMessage(params.errorMessage);
}

export function getCardanoPasswordModalInlineError(params: {
  parsedCode?: CardanoUiErrorCode;
  message: string;
  syncingMessage?: string;
}): string | undefined {
  const normalizedMessage = params.message.toLowerCase();

  if (
    params.parsedCode === "invalid_password" ||
    normalizedMessage.includes("invalid password") ||
    normalizedMessage.includes("fail to decrypt")
  ) {
    return "Invalid password";
  }

  if (
    params.parsedCode === "password_required" ||
    normalizedMessage.includes("password is required")
  ) {
    return "Password is required";
  }

  if (
    params.parsedCode === "wallet_syncing" ||
    normalizedMessage.includes("wallet is syncing")
  ) {
    return params.syncingMessage ?? "Wallet is syncing. Please wait.";
  }

  if (
    params.parsedCode === "wallet_locked" ||
    normalizedMessage.includes("please unlock wallet first")
  ) {
    return "Wallet is locked. Please unlock and try again.";
  }

  return undefined;
}

export function shouldPushCardanoFailedWarningFromModal(params: {
  parsedCode?: CardanoUiErrorCode;
  message: string;
}): boolean {
  return (
    getCardanoPasswordModalInlineError({
      parsedCode: params.parsedCode,
      message: params.message,
    }) == null
  );
}
