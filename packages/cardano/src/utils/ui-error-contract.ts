export const CARDANO_UI_ERROR_PREFIX = "cardano_ui_error:";
const CARDANO_UI_ERROR_SEPARATOR = ":";

export const CARDANO_UI_ERROR_CODES = [
  "invalid_password",
  "password_required",
  "wallet_locked",
  "wallet_syncing",
] as const;

export type CardanoUiErrorCode = (typeof CARDANO_UI_ERROR_CODES)[number];
const CARDANO_UI_ERROR_CODES_SET: ReadonlySet<string> = new Set(
  CARDANO_UI_ERROR_CODES
);

export const isCardanoUiErrorCode = (
  value: string
): value is CardanoUiErrorCode => {
  return CARDANO_UI_ERROR_CODES_SET.has(value);
};

export const encodeCardanoUiError = (
  code: CardanoUiErrorCode,
  message: string
): string =>
  `${CARDANO_UI_ERROR_PREFIX}${code}${CARDANO_UI_ERROR_SEPARATOR}${message}`;

export const parseCardanoUiError = (
  message: string
): {
  code?: CardanoUiErrorCode;
  message: string;
} => {
  if (!message.startsWith(CARDANO_UI_ERROR_PREFIX)) {
    return { message };
  }

  const payload = message.slice(CARDANO_UI_ERROR_PREFIX.length);
  const separatorIndex = payload.indexOf(CARDANO_UI_ERROR_SEPARATOR);
  if (separatorIndex === -1) {
    return { message: payload };
  }

  const rawCode = payload.slice(0, separatorIndex);
  const decodedMessage = payload.slice(separatorIndex + 1) || payload;
  if (!isCardanoUiErrorCode(rawCode)) {
    return { message: decodedMessage };
  }

  return { code: rawCode, message: decodedMessage };
};
