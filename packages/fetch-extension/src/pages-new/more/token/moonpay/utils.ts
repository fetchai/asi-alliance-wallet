import crypto from "crypto";
import axios from "axios";
import { ChainInfoInner } from "@keplr-wallet/stores";

export const generateSignature = (url: string, secretKey: string) => {
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(new URL(url).search) // Use the query string part of the URL
    .digest("base64"); // Convert the result to a base64 string
  return signature; // Return the signature
};

export const signMoonPayUrl = async (urlToSign: string): Promise<string> => {
  try {
    const BASE_URL = "https://companion.sandbox-london-b.fetch-ai.com/";
    const response = await axios.get(`${BASE_URL}/api/moonpay-sign-url`, {
      params: { url: urlToSign },
    });

    return response.data.url;
  } catch (error) {
    console.error("Failed to sign MoonPay URL:", error);
    throw error;
  }
};

export const getCurrencyCodeForMoonpay = (coinDenom: string | undefined) => {
  if (!coinDenom) {
    return undefined;
  }

  switch (coinDenom) {
    case "DYDX":
      return "dydx_dydx";
    case "INJ":
      return "inj_inj";
    default:
      return coinDenom.toLowerCase();
  }
};

export const moonpayTokenCode = (chainId: string, coinDenom: string) => {
  return chainId === "1" && coinDenom === "FET"
    ? "fet_eth"
    : getCurrencyCodeForMoonpay(coinDenom);
};

export const moonpaySupportedTokensByChainId = (
  chainId: string,
  allowedTokenList: any,
  chainInfo: ChainInfoInner[]
) => {
  const allowedTokensCode = allowedTokenList?.map((item: any) => item.code);
  const moonpaySupportedTokens =
    chainInfo
      .find((chainInfo) => chainInfo.chainId === chainId)
      ?.currencies?.filter((item) => {
        const moonpayCurrencyCode = moonpayTokenCode(chainId, item.coinDenom);
        return allowedTokensCode?.includes(moonpayCurrencyCode);
      }) || [];
  return moonpaySupportedTokens;
};
