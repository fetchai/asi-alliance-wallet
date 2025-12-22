import { AGENT_ADDRESS } from "../config.ui.var";
import { isToday, isYesterday, format } from "date-fns";
import moment from "moment";

export const formatAddress = (address: string) => {
  if (Object.values(AGENT_ADDRESS).includes(address)) return "Fetchbot";
  if (address?.length > 15)
    return (
      address.substring(0, 8).toLowerCase() +
      "..." +
      address.substring(36, 44).toLowerCase()
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
