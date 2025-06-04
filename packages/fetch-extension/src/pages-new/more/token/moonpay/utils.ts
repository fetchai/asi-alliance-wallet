import { ChainInfoInner } from "@keplr-wallet/stores";
import axios from "axios";

export const signMoonPayUrl = async (urlToSign: string): Promise<string> => {
  try {
    const BASE_URL = "https://hub.fetch.ai";
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
  if (chainId === "1" && coinDenom === "FET") return "fet_eth";
  if (chainId === "noble-1" && coinDenom === "USDC") return "usdc_noble";
  if (
    coinDenom === "USDC" ||
    chainId === "sifchain-1" ||
    chainId === "axelar-dojo-1" ||
    (chainId === "injective-1" && coinDenom === "USDT")
  )
    return undefined;
  return getCurrencyCodeForMoonpay(coinDenom);
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
