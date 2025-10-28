import { Bech32Address } from "@keplr-wallet/cosmos";
import { ChainInfo } from "@keplr-wallet/types";

export const INITIAL_CHAIN_CONFIG: ChainInfo = {
  chainId: "",
  chainName: "",
  rpc: "",
  rest: "",
  bip44: { coinType: 118 },
  bech32Config: Bech32Address.defaultBech32Config(""),
  stakeCurrency: {
    coinDenom: "",
    coinMinimalDenom: "",
    coinDecimals: 6,
  },
  currencies: [
    {
      coinDenom: "",
      coinMinimalDenom: "",
      coinDecimals: 6,
    },
  ],
  feeCurrencies: [
    {
      coinDenom: "",
      coinMinimalDenom: "",
      coinDecimals: 6,
      gasPriceStep: {
        low: 0,
        average: 5000000000,
        high: 6250000000,
      },
    },
  ],
  features: [],
};
