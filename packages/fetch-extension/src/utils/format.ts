import { CoinPretty } from "@keplr-wallet/unit";
import { AGENT_ADDRESS } from "../config.ui.var";
import { isToday, isYesterday, format } from "date-fns";
import moment from "moment";

export const formatAddress = (address: string) => {
  if (Object.values(AGENT_ADDRESS).includes(address)) return "Fetchbot";
  if (address?.length > 15)
    return (
      address.substring(0, 8).toLowerCase() +
      "..." +
      address.substring(Math.max(0, address.length - 8)).toLowerCase()
    );
  else return address;
};

export const formatToTruncated = (address: string) => {
  if (address?.length > 12)
    return (
      address.substring(0, 8) +
      "..." +
      address.substring(address.length - 4, address.length)
    );
  else return address;
};

export const formatGroupName = (address: string) => {
  if (address?.length > 15)
    return (
      address.substring(0, 8) +
      "..." +
      address.substring(address.length - 6, address.length)
    );
  else return address;
};

export const formatTokenName = (name: string) => {
  if (name.length > 16) {
    return name.substring(0, 15) + "...";
  }

  return name;
};

export function titleCase(str: string) {
  return str.toLowerCase().replace(/\b\w/g, (s: string) => s.toUpperCase());
}

export const shortenNumber = (value: string, decimal = 18) => {
  const number = Math.abs(parseFloat(value)) / 10 ** decimal;
  let result = "";
  if (number >= 1000000) {
    result = (number / 1000000).toFixed(2) + " M";
  } else if (number >= 1000) {
    result = (number / 1000).toFixed(2) + " K";
  } else if (number >= 1) {
    result = number.toFixed(2) + " ";
  } else if (number >= 10 ** -3) {
    result = (number * 1000).toFixed(2) + " m";
  } else if (number >= 10 ** -6) {
    result = (number * 10 ** 6).toFixed(2) + " u";
  } else if (number >= 10 ** -9) {
    result = (number * 10 ** 9).toFixed(2) + " n";
  } else if (number >= 10 ** -12) {
    result = (number * 10 ** 9).toFixed(3) + " n";
  } else if (number >= 10 ** -18) {
    result = (number * 10 ** 18).toFixed(0) + " a";
  } else {
    result = number.toFixed(2) + " ";
  }

  return result;
};

export const formatString = (address: string) => {
  if (address?.length > 30) return address.substring(0, 30) + "...";
  else return address;
};

export const formatDomain = (domainName: string): string => {
  const maxLength = 15;

  if (domainName.length <= maxLength) {
    return domainName;
  } else {
    const firstPart = domainName.slice(0, 4);
    const lastPart = domainName.slice(-8);
    return `${firstPart}...${lastPart}`;
  }
};

export const shortenMintingNumber = (value: string, decimal = 18) => {
  const number = Math.abs(parseFloat(value)) / 10 ** decimal;
  let result = "";
  if (number >= 1000000) {
    result = (number / 1000000).toFixed(2) + " M";
  } else if (number >= 1000) {
    result = (number / 1000).toFixed(2) + " K";
  } else if (number >= 1) {
    result = number.toFixed(2) + " ";
  } else if (number >= 10 ** -3) {
    result = (number * 1000).toFixed(2) + " m";
  } else if (number >= 10 ** -6) {
    result = (number * 10 ** 6).toFixed(2) + " u";
  } else if (number >= 10 ** -9) {
    result = (number * 10 ** 9).toFixed(2) + " n";
  } else if (number >= 10 ** -12) {
    result = (number * 10 ** 9).toFixed(3) + " n";
  } else if (number >= 10 ** -18) {
    result = (number * 10 ** 18).toFixed(0) + " a";
  } else {
    result = number.toFixed(2) + " ";
  }

  return result;
};

export const formatAmount = (amount: string) => {
  const suffixes: string[] = ["", "K", "M", "B", "T"];
  let suffixIndex: number = 0;
  let amountNumber: number = parseInt(amount.split(" ")[0]);
  while (amountNumber >= 1000 && suffixIndex < suffixes.length - 1) {
    amountNumber /= 1000;
    suffixIndex++;
  }
  const formattedAmount: string =
    amountNumber.toFixed(2) +
    suffixes[suffixIndex] +
    " " +
    amount.split(" ")[1];
  return formattedAmount;
};

export const separateNumericAndDenom = (value: any) => {
  const [numericPart, denomPart] = value
    ? value.replaceAll(",", "").split(" ")
    : ["", ""];
  return { numericPart, denomPart };
};

export const parseDollarAmount = (dollarString: any) => {
  if (dollarString) {
    const match = dollarString.match(
      /(?<=\D|\b)(\d{1,2}(?:,\d{2})*(?:,\d{3})*|\d{1,3}(?:,\d{3})*)(?:\.\d+)?(?=\b|\D)/g
    );
    let cleanedMatches = [];

    if (match) {
      // removes commas from matched result
      cleanedMatches = match.map((match: any) => match.replace(/,/g, ""));
    }

    if (cleanedMatches && cleanedMatches.length > 0) {
      return parseFloat(cleanedMatches[0]);
    }
  }
  return NaN;
};

export const parseExponential = (amount: string, decimal: number): string => {
  if (amount.includes("e")) {
    return parseFloat(amount).toFixed(decimal);
  } else {
    return amount;
  }
};

export const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return format(date, "p");
};

export const getDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  if (isToday(d)) {
    return "Today";
  }
  if (isYesterday(d)) {
    return "Yesterday";
  }
  return format(d, "dd MMMM yyyy");
};

export const formatPendingTxn = (amount: any) => {
  const curr = Number(amount) * 10 ** 18;
  return `-${curr}`;
};

export const getEnumKeyByEnumValue = <T extends Record<string, string>>(
  value: string,
  _enum: T
) => {
  return Object.keys(_enum).find(
    (key) => _enum[key as keyof typeof _enum] === value
  );
};

export const convertEpochToDate = (
  epochTime: number,
  formatType: string = "DD MMM YYYY hh:mm A"
) => {
  const date = new Date(epochTime * 1000); // Multiply by 1000 to convert seconds to milliseconds
  return moment(date).format(formatType);
};

export const isVestingExpired = (timestamp: number) =>
  Math.floor(Date.now() / 1000) > timestamp;

export const removeTrailingZeros = (number: string) => {
  const splitNumber = number.split(".");
  const countStartNumber = splitNumber[0].length;
  const decimal =
    countStartNumber > 3
      ? 2
      : countStartNumber == 3
      ? 3
      : countStartNumber > 1
      ? 4
      : 6;
  return Number(number)
    .toFixed(decimal)
    .toString()
    .replace(/([0-9]+(\.[0-9]+[1-9])?)(\.?0+$)/, "$1");
};

export const removeComma = (value: string) => value.replace(/,/g, "");

export const validateDecimalPlaces = (value: string, maxDigits = 20) => {
  const decimalRegex = new RegExp(`^\\d+(\\.\\d{0,${maxDigits}})?$`);
  return decimalRegex.test(value);
};

type FormatDisplayAmountOptions = {
  maxDecimals?: number;
  coinDecimals?: number;
  minExtraDecimalsAfterFirstSignificant?: number;
};

const MAX_TO_FIXED_DECIMALS = 100;
// Exponential normalization is intentionally clamped for `toFixed` safety.
// Very small exponent values that need precision beyond this clamp are handled
// as safe fallback display (no throw), not guaranteed non-zero preservation.

const normalizeDisplayDecimalString = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return "";

  const isNegative = trimmed.startsWith("-");
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;

  if (unsigned === "" || !/^\d*\.?\d*$/.test(unsigned)) {
    return "";
  }

  const [rawInteger = "0", rawFraction = ""] = unsigned.split(".");
  const integerPart = rawInteger.replace(/^0+(?=\d)/, "") || "0";
  const fractionPart = rawFraction.replace(/0+$/, "");

  if (!fractionPart) {
    if (integerPart === "0") {
      return "0";
    }
    return `${isNegative ? "-" : ""}${integerPart}`;
  }

  return `${isNegative ? "-" : ""}${integerPart}.${fractionPart}`;
};

const clampIntegerOption = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const isZeroDecimalString = (value: string) => {
  const normalized = normalizeDisplayDecimalString(value);
  if (normalized === "") return false;
  if (normalized === "0") return true;

  const unsigned = normalized.startsWith("-")
    ? normalized.slice(1)
    : normalized;
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  return integerPart === "0" && /^[0]*$/.test(fractionPart);
};

const addOneIntegerString = (value: string) => {
  const digits = (value || "0").split("");
  let carry = 1;

  for (let i = digits.length - 1; i >= 0; i--) {
    const current = Number(digits[i]);
    const next = current + carry;
    digits[i] = String(next % 10);
    carry = next >= 10 ? 1 : 0;
    if (!carry) break;
  }

  if (carry) {
    digits.unshift("1");
  }

  return digits.join("").replace(/^0+(?=\d)/, "") || "0";
};

const incrementDecimalString = (value: string) => {
  const [integerPart, fractionPart = ""] = value.split(".");

  if (fractionPart.length === 0) {
    return addOneIntegerString(integerPart || "0");
  }

  const combined = `${integerPart}${fractionPart}`;
  const incremented = addOneIntegerString(combined || "0");
  const targetLength = fractionPart.length;

  const padded = incremented.padStart(targetLength + 1, "0");
  const nextInteger = padded.slice(0, -targetLength) || "0";
  const nextFraction = padded.slice(-targetLength);
  return `${nextInteger}.${nextFraction}`;
};

const roundDownDecimalString = (value: string, decimals: number) => {
  if (decimals <= 0) {
    return value.split(".")[0];
  }

  const [integerPart, fractionPart = ""] = value.split(".");
  const truncatedFraction = fractionPart
    .slice(0, decimals)
    .padEnd(decimals, "0");
  return `${integerPart}.${truncatedFraction}`;
};

const roundHalfUpDecimalString = (value: string, decimals: number) => {
  const normalized = normalizeDisplayDecimalString(value);
  if (normalized === "") return "";

  const isNegative = normalized.startsWith("-");
  const unsigned = isNegative ? normalized.slice(1) : normalized;
  const [integerPart, fractionPart = ""] = unsigned.split(".");

  if (decimals <= 0) {
    if (!fractionPart) return normalized;
    const roundedInt =
      Number(fractionPart[0] || "0") >= 5
        ? addOneIntegerString(integerPart || "0")
        : integerPart || "0";
    return `${isNegative ? "-" : ""}${roundedInt}`;
  }

  if (fractionPart.length <= decimals) {
    return normalized;
  }

  const nextDigit = Number(fractionPart[decimals] || "0");
  let rounded = roundDownDecimalString(unsigned, decimals);
  if (nextDigit >= 5) {
    rounded = incrementDecimalString(rounded);
  }

  return normalizeDisplayDecimalString(`${isNegative ? "-" : ""}${rounded}`);
};

export const formatDisplayAmount = (
  amount: string,
  options: FormatDisplayAmountOptions = {}
) => {
  const actualCoinDecimals = clampIntegerOption(options.coinDecimals ?? 18, 18);
  const toFixedCoinDecimals = Math.min(
    actualCoinDecimals,
    MAX_TO_FIXED_DECIMALS
  );
  const maxDecimals = clampIntegerOption(options.maxDecimals ?? 6, 6);
  const minExtraDecimalsAfterFirstSignificant = clampIntegerOption(
    options.minExtraDecimalsAfterFirstSignificant ?? 2,
    2
  );

  if (amount == null) return "";

  const normalizedInput = amount.trim();
  if (normalizedInput === "") return "";

  const parsedAmount = /e/i.test(normalizedInput)
    ? parseExponential(normalizedInput.toLowerCase(), toFixedCoinDecimals)
    : normalizedInput;
  const normalized = normalizeDisplayDecimalString(parsedAmount);
  if (normalized === "") return "";

  const isNegative = normalized.startsWith("-");
  const unsigned = isNegative ? normalized.slice(1) : normalized;
  const [, fractionPart = ""] = unsigned.split(".");

  if (!fractionPart) return normalized;

  const safeMaxDecimals = Math.max(
    0,
    Math.min(maxDecimals, actualCoinDecimals)
  );
  const roundedDefault = roundHalfUpDecimalString(normalized, safeMaxDecimals);
  const normalizedRoundedDefault =
    normalizeDisplayDecimalString(roundedDefault);

  const normalizedValue = isZeroDecimalString(normalized);
  const roundedToZero = isZeroDecimalString(normalizedRoundedDefault);

  // `maxDecimals = 0` is an explicit integer-like display mode.
  // In this mode tiny-value protection is intentionally disabled.
  if (safeMaxDecimals === 0 || normalizedValue || !roundedToZero) {
    return normalizedRoundedDefault;
  }

  const firstSignificantIndex = fractionPart.search(/[1-9]/);
  if (firstSignificantIndex < 0) {
    return normalizedRoundedDefault;
  }

  const minPrecision =
    firstSignificantIndex + 1 + minExtraDecimalsAfterFirstSignificant;
  const extendedPrecision = Math.min(
    actualCoinDecimals,
    Math.max(safeMaxDecimals, minPrecision)
  );
  const roundedExtended = roundHalfUpDecimalString(
    normalized,
    extendedPrecision
  );
  const normalizedExtended = normalizeDisplayDecimalString(roundedExtended);

  if (normalizedExtended === "0" && normalized !== "0") {
    return "0";
  }

  return normalizedExtended;
};

export const hasValidDecimals = (value: string) => {
  if (value == null || value === "") return false;
  const str = value.toString();
  const parts = str.split(".");
  return parts.length < 2 || parts[1].length <= 18;
};

export const splitBech32 = (address: string) => {
  const index = address.indexOf("1");
  if (index === -1) {
    return { prefix: address, rest: "" };
  }

  const prefix = address.slice(0, index + 1);
  const rest = address.slice(index + 1);

  return { prefix, rest };
};

export const formatAddressWithCustom = (
  address: string,
  startChars: number = 8,
  endChars: number = 8
) => {
  if (Object.values(AGENT_ADDRESS).includes(address)) return "Fetchbot";

  if (address?.length > startChars + endChars) {
    return (
      address.substring(0, startChars).toLowerCase() +
      "..." +
      address.substring(address.length - endChars).toLowerCase()
    );
  } else {
    return address;
  }
};

export const formatBalance = (
  balance: CoinPretty,
  maxDecimals = 6,
  useCoinPrettyFormatting = true
) => {
  const minimumValue = 1 / Math.pow(10, maxDecimals);

  const shrunk = useCoinPrettyFormatting
    ? balance.shrink(true).trim(true).maxDecimals(maxDecimals)
    : balance.shrink(true);

  const dec = shrunk.toDec();
  const numericValue = Number(dec.toString());

  // show minimum display value for very small non-zero amounts
  if (!dec.isZero() && numericValue < minimumValue) {
    return `< ${minimumValue.toFixed(maxDecimals)} ${
      balance.currency.coinDenom
    }`;
  }

  // if value is zero show no decimals
  if (dec.isZero()) {
    return useCoinPrettyFormatting
      ? shrunk.maxDecimals(0).toString()
      : `0 ${balance.currency.coinDenom}`;
  }

  if (useCoinPrettyFormatting) {
    return shrunk.toString();
  }

  return `${numericValue.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  })} ${balance.currency.coinDenom}`;
};
