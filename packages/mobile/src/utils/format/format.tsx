import { Buffer } from "buffer/";
import { AGENT_ADDRESS } from "../../config";

export const separateNumericAndDenom = (value: any) => {
  const data = value ? value.split(" ") : ["", ""];
  let numericPart = data[0].replace(/,/g, "");
  numericPart = numericPart.length > 0 ? numericPart : "0";
  const denomPart = data[1];
  return { numericPart, denomPart };
};

export const parseDollarAmount = (dollarString: any) => {
  if (dollarString) {
    const match = dollarString.match(/[0-9.]+/);
    if (match) {
      return parseFloat(match[0]);
    }
  }
  return 0;
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
export function trimWordsStr(str: string): string {
  str = str.trim();
  // Split on the whitespace or new line.
  const splited = str.split(/\s+/);
  const words = splited
    .map((word) => word.trim())
    .filter((word) => word.trim().length > 0);
  return words.join(" ");
}

export function isPrivateKey(str: string): boolean {
  if (str.startsWith("0x")) {
    return true;
  }

  if (str.length === 64) {
    try {
      return Buffer.from(str, "hex").length === 32;
    } catch {
      return false;
    }
  }
  return false;
}

export function validatePrivateKey(value: string): boolean {
  if (isPrivateKey(value)) {
    value = value.replace("0x", "");
    if (value.length !== 64) {
      return false;
    }
    return (
      Buffer.from(value, "hex").toString("hex").toLowerCase() ===
      value.toLowerCase()
    );
  }
  return false;
}

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

export const removeEmojis = (text: string) => {
  const emojiRegex =
    /([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2B50}-\u{2B55}]|[\u{2300}-\u{23FF}]|[\u{2C60}-\u{2C7F}]|[\u{2B06}-\u{2B07}]|[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2B50}-\u{2B55}]|[\u{2300}-\u{23FF}]|[\u{2C60}-\u{2C7F}]|[\u{2B06}-\u{2B07}])/gu;

  return text.replace(emojiRegex, "");
};

export function enumFromStringValue<T>(
  enm: { [s: string]: T },
  value: string
): T | undefined {
  return (Object.values(enm) as unknown as string[]).includes(value)
    ? (value as unknown as T)
    : undefined;
}

export const getEnumKeyByEnumValue = <T extends Record<string, string>>(
  value: string,
  _enum: T
) => {
  return Object.keys(_enum).find(
    (key) => _enum[key as keyof typeof _enum] === value
  );
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
