import { lovelacesToAdaString } from "./lovelacesToAdaString";

export type CardanoMinimumViolationInput = {
  minimumOutputLovelace: string;
  coinMissingLovelace?: string;
};

export type CardanoMinimumViolation = {
  classification: "minimum_violation";
  minimumOutputLovelace: string;
  coinMissingLovelace?: string;
};

/** Stable id for logs/support when structured minimum fields fail mapper validation. */
export const CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD =
  "CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD";

/**
 * Same user-visible message as a plain Error, but attaches cause for diagnostics
 * (stack traces / error reporting) without changing UI copy.
 */
export const cardanoMalformedMinimumPayloadError = (
  userMessage: string
): Error => {
  const err = new Error(userMessage) as Error & { cause?: Error };
  err.cause = new Error(CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD);
  return err;
};

const trimTrailingZeros = (value: string): string => value.replace(/\.?0+$/, "");

const isDigitsOnly = (value: string): boolean => /^\d+$/.test(value);
const isPositiveIntegerString = (value: string): boolean =>
  isDigitsOnly(value) && BigInt(value) > BigInt(0);

/**
 * Semantic mapper for minimum-ADA violations.
 * Accepts source numeric fields only; never parse free-form error strings here.
 */
export const mapCardanoMinimumViolation = (
  input: CardanoMinimumViolationInput
): CardanoMinimumViolation | null => {
  const minimumOutputLovelace = input.minimumOutputLovelace?.trim();
  const coinMissingLovelace = input.coinMissingLovelace?.trim();
  if (!minimumOutputLovelace || !isPositiveIntegerString(minimumOutputLovelace)) {
    return null;
  }
  const validCoinMissing =
    coinMissingLovelace != null &&
    coinMissingLovelace !== "" &&
    isDigitsOnly(coinMissingLovelace)
      ? coinMissingLovelace
      : undefined;

  return {
    classification: "minimum_violation",
    minimumOutputLovelace,
    coinMissingLovelace: validCoinMissing,
  };
};

/**
 * User-facing formatter. Consumes mapped semantic data only.
 */
export const formatCardanoMinimumViolationMessage = (params: {
  violation: CardanoMinimumViolation;
  cardanoDenom: string;
  nativeAdaCoinDecimals: number;
}): string => {
  const minAda = trimTrailingZeros(
    lovelacesToAdaString(
      params.violation.minimumOutputLovelace,
      params.nativeAdaCoinDecimals
    )
  );
  return `Amount too small. Minimum required is ${minAda} ${params.cardanoDenom}`;
};

/**
 * Compatibility helper for legacy transport where callers still expect Error text.
 */
export const formatLegacyMinimumViolationLovelaceError = (params: {
  violation: CardanoMinimumViolation;
}): string =>
  `Amount too small: minimum output value is ${params.violation.minimumOutputLovelace} lovelace (protocol minimum for this output). Please send at least ${params.violation.minimumOutputLovelace} lovelace.`;
