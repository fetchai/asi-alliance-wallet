import {
  BUY_SELL_WHITELISTED_WALLET_ADDRESSES,
  MoonpayApiKey,
} from "../config.ui";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { fromBech32 } from "@cosmjs/encoding";

export const useMoonpayCurrency = (enabled = true) => {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const API_KEY = MoonpayApiKey;
      const { data } = await axios.get(
        `https://api.moonpay.com/v3/currencies?apiKey=${API_KEY}`
      );
      return data;
    },
    staleTime: Infinity,
    enabled,
  });
};

export const getBech32Hex = (address: string) => {
  const { data } = fromBech32(address);
  return Buffer.from(data).toString("hex");
};

export const normalizeAddress = (address: string) => {
  if (address.startsWith("0x") && address.length === 42) {
    return address.toLowerCase();
  } else {
    try {
      const { data } = fromBech32(address);
      return Buffer.from(data).toString("hex");
    } catch {
      return "";
    }
  }
};

export const checkAddressIsBuySellWhitelisted = (address: string) => {
  const whitelistedAddressesHex =
    BUY_SELL_WHITELISTED_WALLET_ADDRESSES.map(normalizeAddress);

  const currentAddressHex = normalizeAddress(address);

  return whitelistedAddressesHex.includes(currentAddressHex);
};
