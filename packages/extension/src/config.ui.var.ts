import { IntlMessages } from "./languages";
import { RegisterOption } from "@keplr-wallet/hooks";

export const PROD_AMPLITUDE_API_KEY = "3fd2416e2a9b3cd13ed4770582995f89";
export const DEV_AMPLITUDE_API_KEY = "a0e2158ca8a12e72ef78e36414212d24";
export const ETHEREUM_ENDPOINT =
  "https://mainnet.infura.io/v3/eeb00e81cdb2410098d5a270eff9b341";

export const ADDITIONAL_SIGN_IN_PREPEND:
  | RegisterOption[]
  | undefined = undefined;

export const ADDITIONAL_INTL_MESSAGES: IntlMessages = {};

// export const MESSAGING_SERVER = "http://localhost:4000/graphql";
export const MESSAGING_SERVER = "https://messaging.fetch-ai.network/graphql";
// export const MESSAGING_SERVER =
//   "https://messaging-server.sandbox-london-b.fetch-ai.com/graphql";

// export const SUBSCRIPTION_SERVER = "ws://localhost:4000/subscription";
export const SUBSCRIPTION_SERVER =
  "wss://messaging.fetch-ai.network/subscription";
// export const SUBSCRIPTION_SERVER =
//   "wss://messaging-server.sandbox-london-b.fetch-ai.com/subscription";

export const AUTH_SERVER = "https://auth-attila.sandbox-london-b.fetch-ai.com";

export const CHAIN_ID_DORADO = "dorado-1";
export const CHAIN_ID_FETCHHUB = "fetchhub-4";
