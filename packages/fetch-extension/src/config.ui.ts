// Seperate shared config from UI config to prevent code mixup between UI and background process code.
import { RegisterOption } from "@keplr-wallet/hooks";
import {
  DEV_AMPLITUDE_API_KEY,
  DEV_AUTH_CLIENT_ID,
  PROD_AMPLITUDE_API_KEY,
  PROD_AUTH_CLIENT_ID,
} from "./config.ui.var";
import {
  IntlMessages,
  LanguageToFiatCurrency as TypeLanguageToFiatCurrency,
} from "./languages";
import { FiatCurrency } from "@keplr-wallet/types";
import {
  ADDITIONAL_INTL_MESSAGES,
  ADDITIONAL_SIGN_IN_PREPEND,
} from "alt-sign-in";

export const KeplrExtMoonPayAPIKey =
  process.env["KEPLR_EXT_MOONPAY_API_KEY"] || "";
export const KeplrExtTransakAPIKey =
  process.env["KEPLR_EXT_TRANSAK_API_KEY"] || "";
export const KeplrExtKadoAPIKey = process.env["KEPLR_EXT_KADO_API_KEY"] || "";

export const CoinGeckoAPIEndPoint =
  process.env["KEPLR_EXT_COINGECKO_ENDPOINT"] ||
  "https://api.coingecko.com/api/v3";
export const CoinGeckoGetPrice =
  process.env["KEPLR_EXT_COINGECKO_GETPRICE"] || "/simple/price";
export const AutoFetchingFiatValueInterval = 300 * 1000; // 5min

export const AutoFetchingAssetsInterval = 15 * 1000; // 15sec

export const DefaultGasMsgWithdrawRewards = 240000; // Gas per messages.

// Endpoint for Ethereum node.
// This is used for ENS.
export const EthereumEndpoint =
  process.env["KEPLR_EXT_ETHEREUM_ENDPOINT"] || "";

export const FiatCurrencies: FiatCurrency[] = [
  {
    currency: "usd",
    symbol: "$",
    maxDecimals: 2,
    locale: "en-US",
  },
  {
    currency: "eur",
    symbol: "€",
    maxDecimals: 2,
    locale: "en-IE",
  },
  {
    currency: "gbp",
    symbol: "£",
    maxDecimals: 2,
    locale: "en-GB",
  },
  {
    currency: "cad",
    symbol: "CA$",
    maxDecimals: 2,
    locale: "en-CA",
  },
  {
    currency: "aud",
    symbol: "AU$",
    maxDecimals: 2,
    locale: "en-AU",
  },
  {
    currency: "rub",
    symbol: "₽",
    maxDecimals: 0,
    locale: "ru-RU",
  },
  {
    currency: "krw",
    symbol: "₩",
    maxDecimals: 0,
    locale: "ko-KR",
  },
  {
    currency: "hkd",
    symbol: "HK$",
    maxDecimals: 1,
    locale: "en-HK",
  },
  {
    currency: "cny",
    symbol: "¥",
    maxDecimals: 1,
    locale: "zh-CN",
  },
  {
    currency: "jpy",
    symbol: "¥",
    maxDecimals: 0,
    locale: "ja-JP",
  },
  {
    currency: "inr",
    symbol: "₹",
    maxDecimals: 1,
    locale: "en-IN",
  },
  {
    currency: "ars",
    symbol: "$",
    maxDecimals: 2,
    locale: "es-AR",
  },
  {
    currency: "bmd",
    symbol: "BD$",
    maxDecimals: 2,
    locale: "en-BM",
  },
  {
    currency: "brl",
    symbol: "R$",
    maxDecimals: 2,
    locale: "pt-BR",
  },
  {
    currency: "chf",
    symbol: "CHF",
    maxDecimals: 2,
    locale: "de-CH",
  },
  {
    currency: "clp",
    symbol: "$",
    maxDecimals: 0,
    locale: "es-CL",
  },
  {
    currency: "czk",
    symbol: "Kč",
    maxDecimals: 2,
    locale: "cs-CZ",
  },
  {
    currency: "dkk",
    symbol: "kr",
    maxDecimals: 2,
    locale: "da-DK",
  },
  {
    currency: "gel",
    symbol: "₾",
    maxDecimals: 2,
    locale: "ka-GE",
  },
  {
    currency: "huf",
    symbol: "Ft",
    maxDecimals: 2,
    locale: "hu-HU",
  },
  {
    currency: "idr",
    symbol: "Rp",
    maxDecimals: 2,
    locale: "id-ID",
  },
  {
    currency: "ils",
    symbol: "₪",
    maxDecimals: 2,
    locale: "he-IL",
  },
  {
    currency: "kwd",
    symbol: "د.ك",
    maxDecimals: 3,
    locale: "ar-KW",
  },
  {
    currency: "lkr",
    symbol: "Rs",
    maxDecimals: 2,
    locale: "si-LK",
  },
  {
    currency: "mmk",
    symbol: "K",
    maxDecimals: 0,
    locale: "my-MM",
  },
  {
    currency: "mxn",
    symbol: "MX$",
    maxDecimals: 2,
    locale: "es-MX",
  },
  {
    currency: "myr",
    symbol: "RM",
    maxDecimals: 2,
    locale: "ms-MY",
  },
  {
    currency: "ngn",
    symbol: "₦",
    maxDecimals: 2,
    locale: "en-NG",
  },
  {
    currency: "nok",
    symbol: "kr",
    maxDecimals: 2,
    locale: "nb-NO",
  },
  {
    currency: "nzd",
    symbol: "NZ$",
    maxDecimals: 2,
    locale: "en-NZ",
  },
  {
    currency: "php",
    symbol: "₱",
    maxDecimals: 2,
    locale: "en-PH",
  },
  {
    currency: "pkr",
    symbol: "₨",
    maxDecimals: 2,
    locale: "en-PK",
  },
  {
    currency: "pln",
    symbol: "zł",
    maxDecimals: 2,
    locale: "pl-PL",
  },
  {
    currency: "sar",
    symbol: "ر.س",
    maxDecimals: 2,
    locale: "ar-SA",
  },
  {
    currency: "sek",
    symbol: "kr",
    maxDecimals: 2,
    locale: "sv-SE",
  },
  {
    currency: "sgd",
    symbol: "S$",
    maxDecimals: 2,
    locale: "en-SG",
  },
  {
    currency: "thb",
    symbol: "฿",
    maxDecimals: 2,
    locale: "th-TH",
  },
  {
    currency: "try",
    symbol: "₺",
    maxDecimals: 2,
    locale: "tr-TR",
  },
  {
    currency: "twd",
    symbol: "NT$",
    maxDecimals: 2,
    locale: "zh-TW",
  },
  {
    currency: "uah",
    symbol: "₴",
    maxDecimals: 2,
    locale: "uk-UA",
  },
  {
    currency: "vef",
    symbol: "Bs",
    maxDecimals: 2,
    locale: "es-VE",
  },
  {
    currency: "vnd",
    symbol: "₫",
    maxDecimals: 0,
    locale: "vi-VN",
  },
  {
    currency: "zar",
    symbol: "R",
    maxDecimals: 2,
    locale: "en-ZA",
  },
  {
    currency: "aed",
    symbol: "د.إ",
    maxDecimals: 2,
    locale: "ar-AE",
  },
];

export const SUPPORTED_LOCALE_FIAT_CURRENCIES = [
  "usd",
  "eur",
  "gbp",
  "cad",
  "aud",
  "hkd",
  "jpy",
  "cny",
  "inr",
  "krw",
  "nzd",
  "pkr",
  "myr",
  "sgd",
  "thb",
  "mxn",
];

export const LanguageToFiatCurrency: TypeLanguageToFiatCurrency = {
  default: "usd",
  ko: "krw",
};

export const AdditionalSignInPrepend: RegisterOption[] | undefined =
  ADDITIONAL_SIGN_IN_PREPEND;

export const AdditionalIntlMessages: IntlMessages = ADDITIONAL_INTL_MESSAGES;

export const AmplitudeApiKey =
  process.env.NODE_ENV === "production"
    ? PROD_AMPLITUDE_API_KEY
    : DEV_AMPLITUDE_API_KEY;

export const AuthApiKey =
  process.env.NODE_ENV === "production"
    ? PROD_AUTH_CLIENT_ID
    : DEV_AUTH_CLIENT_ID;

export const ICNSInfo = {
  chainId: "osmosis-1",
  resolverContractAddress:
    "osmo1xk0s8xgktn9x5vwcgtjdxqzadg88fgn33p8u9cnpdxwemvxscvast52cdd",
};

// If not needed, just set as empty string ("")
export const ICNSFrontendLink: string = "https://app.icns.xyz";

export interface FiatOnRampServiceInfo {
  serviceId: string;
  serviceName: string;
  buyOrigin: string;
  buySupportCoinDenomsByChainId: Record<string, string[] | undefined>;
  apiKey?: string;
}

export const FiatOnRampServiceInfos: FiatOnRampServiceInfo[] = [
  {
    serviceId: "kado",
    serviceName: "Kado",
    buyOrigin: "https://app.kado.money",
    buySupportCoinDenomsByChainId: {
      "osmosis-1": ["USDC"],
      "juno-1": ["USDC"],
      "phoenix-1": ["USDC"],
      "cosmoshub-4": ["ATOM"],
      "injective-1": ["USDT"],
    },
  },
  {
    serviceId: "transak",
    serviceName: "Transak",
    buyOrigin: "https://global.transak.com",
    buySupportCoinDenomsByChainId: {
      "osmosis-1": ["OSMO"],
      "cosmoshub-4": ["ATOM"],
      "secret-4": ["SCRT"],
      "injective-1": ["INJ"],
    },
  },
  {
    serviceId: "moonpay",
    serviceName: "Moonpay",
    buyOrigin: "https://buy.moonpay.com",
    buySupportCoinDenomsByChainId: {
      "cosmoshub-4": ["ATOM"],
      "kava_2222-10": ["KAVA"],
    },
  },
];
