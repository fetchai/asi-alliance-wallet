// Seperate shared config from UI config to prevent code mixup between UI and background process code.
import { RegisterOption } from "@keplr-wallet/hooks";
import {
  DEV_AMPLITUDE_API_KEY,
  DEV_AUTH_CLIENT_ID,
  DEV_MOONPAY_API_KEY,
  PROD_AMPLITUDE_API_KEY,
  PROD_AUTH_CLIENT_ID,
  PROD_MOONPAY_API_KEY,
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
    symbolName: "$",
    maxDecimals: 2,
    locale: "en-US",
    name: "United States Dollar",
  },
  {
    currency: "aed",
    symbol: "د.إ",
    symbolName: "AED",
    maxDecimals: 2,
    locale: "ar-AE",
    name: "United Arab Emirates Dirham",
  },
  {
    currency: "ars",
    symbol: "$",
    symbolName: "ARS",
    maxDecimals: 2,
    locale: "es-AR",
    name: "Argentine Peso",
  },
  {
    currency: "aud",
    symbol: "AU$",
    symbolName: "AU$",
    maxDecimals: 2,
    locale: "en-AU",
    name: "Australian Dollar",
  },
  {
    currency: "bdt",
    symbol: "৳",
    symbolName: "BDT",
    maxDecimals: 2,
    locale: "bn-BD",
    name: "Bangladeshi Taka",
  },
  {
    currency: "bhd",
    symbol: ".د.ب",
    symbolName: "BHD",
    maxDecimals: 3,
    locale: "ar-BH",
    name: "Bahraini Dinar",
  },
  {
    currency: "bmd",
    symbol: "BD$",
    symbolName: "BD$",
    maxDecimals: 2,
    locale: "en-BM",
    name: "Bermudian Dollar",
  },
  {
    currency: "brl",
    symbol: "R$",
    symbolName: "R$",
    maxDecimals: 2,
    locale: "pt-BR",
    name: "Brazilian Real",
  },
  {
    currency: "cad",
    symbol: "CA$",
    symbolName: "CA$",
    maxDecimals: 2,
    locale: "en-CA",
    name: "Canadian Dollar",
  },
  {
    currency: "chf",
    symbol: "CHF",
    symbolName: "CHF",
    maxDecimals: 2,
    locale: "de-CH",
    name: "Swiss Franc",
  },
  {
    currency: "clp",
    symbol: "$",
    symbolName: "CLP",
    maxDecimals: 2,
    locale: "es-CL",
    name: "Chilean Peso",
  },
  {
    currency: "cny",
    symbol: "¥",
    symbolName: "CN¥",
    maxDecimals: 1,
    locale: "zh-CN",
    name: "Chinese Yuan",
  },
  {
    currency: "czk",
    symbol: "Kč",
    symbolName: "CZK",
    maxDecimals: 2,
    locale: "cs-CZ",
    name: "Czech Koruna",
  },
  {
    currency: "dkk",
    symbol: "kr",
    symbolName: "DKK",
    maxDecimals: 2,
    locale: "da-DK",
    name: "Danish Krone",
  },
  {
    currency: "eur",
    symbol: "€",
    symbolName: "€",
    maxDecimals: 2,
    locale: "en-IE",
    name: "Euro",
  },
  {
    currency: "gbp",
    symbol: "£",
    symbolName: "£",
    maxDecimals: 2,
    locale: "en-GB",
    name: "British Pound Sterling",
  },
  {
    currency: "gel",
    symbol: "₾",
    symbolName: "GEL",
    maxDecimals: 2,
    locale: "ka-GE",
    name: "Georgian Lari",
  },
  {
    currency: "hkd",
    symbol: "HK$",
    symbolName: "HK$",
    maxDecimals: 1,
    locale: "en-HK",
    name: "Hong Kong Dollar",
  },
  {
    currency: "huf",
    symbol: "Ft",
    symbolName: "HUF",
    maxDecimals: 2,
    locale: "hu-HU",
    name: "Hungarian Forint",
  },
  {
    currency: "idr",
    symbol: "Rp",
    symbolName: "IDR",
    maxDecimals: 2,
    locale: "id-ID",
    name: "Indonesian Rupiah",
  },
  {
    currency: "ils",
    symbol: "₪",
    symbolName: "₪",
    maxDecimals: 2,
    locale: "he-IL",
    name: "Israeli New Shekel",
  },
  {
    currency: "inr",
    symbol: "₹",
    symbolName: "₹",
    maxDecimals: 1,
    locale: "en-IN",
    name: "Indian Rupee",
  },
  {
    currency: "jpy",
    symbol: "¥",
    symbolName: "¥",
    maxDecimals: 2,
    locale: "ja-JP",
    name: "Japanese Yen",
  },
  {
    currency: "krw",
    symbol: "₩",
    symbolName: "₩",
    maxDecimals: 2,
    locale: "ko-KR",
    name: "South Korean Won",
  },
  {
    currency: "kwd",
    symbol: "د.ك",
    symbolName: "KWD",
    maxDecimals: 3,
    locale: "ar-KW",
    name: "Kuwaiti Dinar",
  },
  {
    currency: "lkr",
    symbol: "Rs",
    symbolName: "LKR",
    maxDecimals: 2,
    locale: "si-LK",
    name: "Sri Lankan Rupee",
  },
  {
    currency: "mmk",
    symbol: "K",
    symbolName: "MMK",
    maxDecimals: 0,
    locale: "my-MM",
    name: "Myanmar Kyat",
  },
  {
    currency: "mxn",
    symbol: "MX$",
    symbolName: "MX$",
    maxDecimals: 2,
    locale: "es-MX",
    name: "Mexican Peso",
  },
  {
    currency: "myr",
    symbol: "RM",
    symbolName: "RM",
    maxDecimals: 2,
    locale: "ms-MY",
    name: "Malaysian Ringgit",
  },
  {
    currency: "ngn",
    symbol: "₦",
    symbolName: "NGN",
    maxDecimals: 2,
    locale: "en-NG",
    name: "Nigerian Naira",
  },
  {
    currency: "nok",
    symbol: "kr",
    symbolName: "NOK",
    maxDecimals: 2,
    locale: "nb-NO",
    name: "Norwegian Krone",
  },
  {
    currency: "nzd",
    symbol: "NZ$",
    symbolName: "NZ$",
    maxDecimals: 2,
    locale: "en-NZ",
    name: "New Zealand Dollar",
  },
  {
    currency: "php",
    symbol: "₱",
    symbolName: "₱",
    maxDecimals: 2,
    locale: "en-PH",
    name: "Philippine Peso",
  },
  {
    currency: "pkr",
    symbol: "₨",
    symbolName: "PKR",
    maxDecimals: 2,
    locale: "en-PK",
    name: "Pakistani Rupee",
  },
  {
    currency: "pln",
    symbol: "zł",
    symbolName: "PLN",
    maxDecimals: 2,
    locale: "pl-PL",
    name: "Polish Zloty",
  },
  {
    currency: "rub",
    symbol: "₽",
    symbolName: "RUB",
    maxDecimals: 2,
    locale: "ru-RU",
    name: "Russian Ruble",
  },
  {
    currency: "sar",
    symbol: "ر.س",
    symbolName: "SAR",
    maxDecimals: 2,
    locale: "ar-SA",
    name: "Saudi Riyal",
  },
  {
    currency: "sek",
    symbol: "kr",
    symbolName: "SEK",
    maxDecimals: 2,
    locale: "sv-SE",
    name: "Swedish Krona",
  },
  {
    currency: "sgd",
    symbol: "S$",
    symbolName: "S$",
    maxDecimals: 2,
    locale: "en-SG",
    name: "Singapore Dollar",
  },
  {
    currency: "thb",
    symbol: "฿",
    symbolName: "THB",
    maxDecimals: 2,
    locale: "th-TH",
    name: "Thai Baht",
  },
  {
    currency: "try",
    symbol: "₺",
    symbolName: "TRY",
    maxDecimals: 2,
    locale: "tr-TR",
    name: "Turkish Lira",
  },
  {
    currency: "twd",
    symbol: "NT$",
    symbolName: "NT$",
    maxDecimals: 2,
    locale: "zh-TW",
    name: "New Taiwan Dollar",
  },
  {
    currency: "uah",
    symbol: "₴",
    symbolName: "UAH",
    maxDecimals: 2,
    locale: "uk-UA",
    name: "Ukrainian Hryvnia",
  },
  {
    currency: "vef",
    symbol: "Bs",
    symbolName: "VEF",
    maxDecimals: 2,
    locale: "es-VE",
    name: "Venezuelan Bolívar",
  },
  {
    currency: "vnd",
    symbol: "₫",
    symbolName: "VND",
    maxDecimals: 2,
    locale: "vi-VN",
    name: "Vietnamese Dong",
  },
  {
    currency: "zar",
    symbol: "R",
    symbolName: "ZAR",
    maxDecimals: 2,
    locale: "en-ZA",
    name: "South African Rand",
  },
];

export const SUPPORTED_LOCALE_FIAT_CURRENCIES = [
  "usd",
  "aed",
  "ars",
  "aud",
  "bdt",
  "bhd",
  "bmd",
  "brl",
  "cad",
  "chf",
  "clp",
  "cny",
  "czk",
  "dkk",
  "eur",
  "gbp",
  "gel",
  "hkd",
  "huf",
  "idr",
  "ils",
  "inr",
  "jpy",
  "krw",
  "kwd",
  "lkr",
  "mmk",
  "mxn",
  "mvr",
  "nyr",
  "ngn",
  "nok",
  "nzk",
  "php",
  "pkr",
  "pln",
  "rub",
  "sar",
  "sek",
  "sgd",
  "thb",
  "try",
  "twd",
  "uah",
  "vef",
  "vnd",
  "zar",
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

export const MoonpayApiKey =
  process.env.NODE_ENV === "production"
    ? PROD_MOONPAY_API_KEY
    : DEV_MOONPAY_API_KEY;

export const MOONPAY_ONRAMP_PROD_URL = "https://buy.moonpay.com";
export const MOONPAY_ONRAMP_SANDBOX_URL = "https://buy-sandbox.moonpay.com";

export const MOONPAY_OFFRAMP_PROD_URL = "https://sell.moonpay.com";
export const MOONPAY_OFFRAMP_SANDBOX_URL = "https://sell-sandbox.moonpay.com";

export const MoonpayOnRampApiURL =
  process.env.NODE_ENV === "production"
    ? MOONPAY_ONRAMP_PROD_URL
    : MOONPAY_ONRAMP_SANDBOX_URL;

export const MoonpayOffRampApiURL =
  process.env.NODE_ENV === "production"
    ? MOONPAY_OFFRAMP_PROD_URL
    : MOONPAY_OFFRAMP_SANDBOX_URL;

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

export const BUY_SELL_WHITELISTED_WALLET_ADDRESSES = [
  "fetch1pmqwfm96llz08df8jnuvyaan2fge9tjl5zs6j8",
  "fetch12tzfwqmwfde0el0pxqw62ty99x7uf4x8ltmena",
  "fetch15yy05xnpcjm2hpetxr5rsxt0z7hgl2qxtm9el6",
  "fetch1f9jjgtaqftn3vcwgg56la7mkr5zmduvpzm7jl5",
  "fetch10n6jssmvcg0rw0mhxt69kaenw05xq9x4n6q2uv",
  "fetch14aazuuxuahlq8fdwxa0gsl57hz6qpx5chthz8t",
  "fetch1pneh5rcwhtfk3zttq3ntuwzejaucmzzdpeqe8z",
  "0x1E7e88a90cC34DD5F5d3680604ea21ABfd289D3B",
  "0xfef84804FeB802B2442FdB301F61Dfc31934bFeD",
  "0xF1709925D4f78e63fA27f9F5b0Dc922b56834925",
  "0x4cc668edd509877722c6024f71e23F9B9b73829b",
  "0x4f43FcEe5e06Be34Ca141EfcE2dC91C2EDD7119B",
  "0xe66f5f2b6ac421aBD911278289C4e05316fb4DA5",
  "0x887F0e059e95bf7573E49a9374eEEeE72c89A13c",
];

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
