import { AGENT_ADDRESS } from "../config.ui.var";
import { isToday, isYesterday, format } from "date-fns";

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

export const formatActivityHash = (address: string) => {
  if (address?.length > 12) return address.substring(0, 10) + "...";
  else return address;
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
  const [numericPart, denomPart] = value ? value.split(" ") : ["", ""];
  return { numericPart, denomPart };
};

export const parseDollarAmount = (dollarString: any) => {
  const match = dollarString.match(/[0-9.]+/);
  if (match) {
    return parseFloat(match[0]);
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
