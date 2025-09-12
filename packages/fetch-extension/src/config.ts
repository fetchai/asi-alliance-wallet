import { Bech32Address } from "@keplr-wallet/cosmos";
import { ChainInfo } from "@keplr-wallet/types";

const LOCAL_TEST_NETWORK_CONFIG: ChainInfo = {
  rpc: "http://localhost:26657",
  rest: "http://localhost:1317",
  chainId: "test-local",
  chainName: "Local Test Network",
  hideInUI: true,
  stakeCurrency: {
    coinDenom: "stake",
    coinMinimalDenom: "stake",
    coinDecimals: 18,
    coinGeckoId: "fetch-ai",
  },
  bip44: {
    coinType: 118,
  },
  bech32Config: Bech32Address.defaultBech32Config("fetch"),
  type: "testnet",
  currencies: [
    {
      coinDenom: "stake",
      coinMinimalDenom: "stake",
      coinDecimals: 18,
      coinGeckoId: "fetch-ai",
    },
  ],
  feeCurrencies: [
    {
      coinDenom: "stake",
      coinMinimalDenom: "stake",
      coinDecimals: 18,
      coinGeckoId: "fetch-ai",
      gasPriceStep: {
        low: 0,
        average: 5000000000,
        high: 6250000000,
      },
    },
  ],
  features: ["cosmwasm"],
  walletUrlForStaking: "https://browse-dorado.fetch.ai/validators",
  govUrl: "http://localhost:1317/cosmos/gov/v1beta1/proposals",
  chainSymbolImageUrl: require("./public/assets/svg/wireframe/dorado.svg"),
};

const REMOTE_TEST_NETWORK_CONFIG: ChainInfo = {
  rpc: "http://34.34.58.246:26657",
  rest: "http://34.34.58.246:1317",
  chainId: "test",
  chainName: "Remote Test Network",
  hideInUI: true,
  stakeCurrency: {
    coinDenom: "stake",
    coinMinimalDenom: "stake",
    coinDecimals: 18,
    coinGeckoId: "fetch-ai",
  },
  bip44: {
    coinType: 118,
  },
  bech32Config: Bech32Address.defaultBech32Config("fetch"),
  type: "testnet",
  currencies: [
    {
      coinDenom: "stake",
      coinMinimalDenom: "stake",
      coinDecimals: 18,
      coinGeckoId: "fetch-ai",
    },
  ],
  feeCurrencies: [
    {
      coinDenom: "stake",
      coinMinimalDenom: "stake",
      coinDecimals: 18,
      coinGeckoId: "fetch-ai",
      gasPriceStep: {
        low: 0,
        average: 5000000000,
        high: 6250000000,
      },
    },
  ],
  features: ["cosmwasm"],
  walletUrlForStaking: "https://browse-dorado.fetch.ai/validators",
  govUrl: "http://34.34.58.246:1317/cosmos/gov/v1beta1/proposals",
  chainSymbolImageUrl: require("./public/assets/svg/wireframe/dorado.svg"),
};

const EmbedChainInfos: ChainInfo[] = [
  {
    rpc: "https://rpc-fetchhub.fetch-ai.com",
    rest: "https://rest-fetchhub.fetch-ai.com",
    chainId: "fetchhub-4",
    chainName: "fetch",
    stakeCurrency: {
      coinDenom: "FET",
      coinMinimalDenom: "afet",
      coinDecimals: 18,
      coinGeckoId: "fetch-ai",
      coinImageUrl:
        "https://assets.coingecko.com/coins/images/5681/thumb/Fetch.jpg?1572098136",
    },
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("fetch"),
    currencies: [
      {
        coinDenom: "FET",
        coinMinimalDenom: "afet",
        coinDecimals: 18,
        coinGeckoId: "fetch-ai",
        coinImageUrl:
          "https://assets.coingecko.com/coins/images/5681/thumb/Fetch.jpg?1572098136",
      },
      {
        coinDenom: "MOBX",
        coinMinimalDenom: "nanomobx",
        coinDecimals: 9,
      },
      {
        coinDenom: "NOMX",
        coinMinimalDenom: "nanonomx",
        coinDecimals: 9,
      },
      {
        coinDenom: "LRN",
        coinMinimalDenom: "ulrn",
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "FET",
        coinMinimalDenom: "afet",
        coinDecimals: 18,
        coinGeckoId: "fetch-ai",
        coinImageUrl:
          "https://assets.coingecko.com/coins/images/5681/thumb/Fetch.jpg?1572098136",
        gasPriceStep: {
          low: 0,
          average: 5000000000,
          high: 6250000000,
        },
      },
    ],
    features: ["cosmwasm"],
    walletUrlForStaking: "https://browse-fetchhub.fetch.ai/validators",
    govUrl: "https://www.mintscan.io/fetchai/proposals/",
  },
  {
    rpc: "https://mainnet.infura.io/v3/f40158f0c03842f5a18e409ffe09192c",
    rest: "https://mainnet.infura.io/v3/f40158f0c03842f5a18e409ffe09192c/",
    chainId: "1",
    chainName: "Ethereum",
    explorerUrl: "https://etherscan.io",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "ETH",
      coinMinimalDenom: "eth",
      coinDecimals: 18,
      coinGeckoId: "ethereum",
    },
    bip44: {
      coinType: 60,
    },
    bech32Config: Bech32Address.defaultBech32Config("fetch"),
    currencies: [
      {
        coinDenom: "ETH",
        coinMinimalDenom: "eth",
        coinDecimals: 18,
        coinGeckoId: "ethereum",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/_non-cosmos/ethereum/images/eth-white.png",
      },
      {
        coinDenom: "FET",
        coinMinimalDenom:
          "erc20:0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85:Fetch.ai",
        coinDecimals: 18,
        coinGeckoId: "fetch-ai",
        contractAddress: "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85",
        type: "erc20",
        coinImageUrl:
          "https://assets.coingecko.com/coins/images/5681/thumb/Fetch.jpg?1572098136",
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/_non-cosmos/ethereum/images/eth-white.png",
    feeCurrencies: [
      {
        coinDenom: "ETH",
        coinMinimalDenom: "eth",
        coinDecimals: 18,
        coinGeckoId: "ethereum",
        gasPriceStep: {
          low: 40000000000,
          average: 40000000000,
          high: 40000000000,
        },
      },
    ],
    features: ["evm"],
    // walletUrlForStaking: "https://browse-bnbhub.bnb.ai/validators",
    // govUrl: "https://bnbstation.azoyalabs.com/mainnet/governance/",
  },
  {
    rpc: "https://bsc-dataseed.binance.org",
    rest: "https://bsc-dataseed.binance.org/",
    chainId: "56",
    chainName: "Binance Smart Chain",
    explorerUrl: "https://bscscan.com",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "BNB",
      coinMinimalDenom: "bnb",
      coinDecimals: 18,
      coinGeckoId: "binancecoin",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/_non-cosmos/binancesmartchain/images/bnb.png",
    },
    bip44: {
      coinType: 60,
    },
    bech32Config: Bech32Address.defaultBech32Config("fetch"),
    currencies: [
      {
        coinDenom: "BNB",
        coinMinimalDenom: "bnb",
        coinDecimals: 18,
        coinGeckoId: "binancecoin",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/_non-cosmos/binancesmartchain/images/bnb.png",
      },
      // {
      // coinDenom: "USDT",
      // coinMinimalDenom: "erc20:0x55d398326f99059fF775485246999027B3197955:Tether USD",
      // coinDecimals: 18,
      // coinGeckoId: "binancecoin",
      // contractAddress: "0x55d398326f99059fF775485246999027B3197955",
      // type: "erc20"
      // },
    ],
    feeCurrencies: [
      {
        coinDenom: "BNB",
        coinMinimalDenom: "bnb",
        coinDecimals: 18,
        coinGeckoId: "binancecoin",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/_non-cosmos/binancesmartchain/images/bnb.png",
        gasPriceStep: {
          low: 3000000000,
          average: 3000000000,
          high: 3000000000,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/_non-cosmos/binancesmartchain/images/bnb.png",
    features: ["evm"],
    // walletUrlForStaking: "https://browse-bnbhub.bnb.ai/validators",
    // govUrl: "https://bnbstation.azoyalabs.com/mainnet/governance/",
  },
  {
    rpc: "https://goerli.infura.io/v3/f40158f0c03842f5a18e409ffe09192c",
    rest: "https://goerli.infura.io/v3/f40158f0c03842f5a18e409ffe09192c/",
    chainId: "5",
    chainName: "Goerli-eth (Testnet)",

    stakeCurrency: {
      coinDenom: "ETH",
      coinMinimalDenom: "eth",
      coinDecimals: 18,
      coinGeckoId: "ethereum",
    },
    type: "testnet",
    hideInUI: true,
    bip44: {
      coinType: 60,
    },
    bech32Config: Bech32Address.defaultBech32Config("fetch"),
    currencies: [
      {
        coinDenom: "ETH",
        coinMinimalDenom: "eth",
        coinDecimals: 18,
      },
      // {
      //   coinDenom: "FET",
      //   coinMinimalDenom:
      //     "erc20:0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85:Fetch.ai",
      //   coinDecimals: 18,
      //   coinGeckoId: "fetch-ai",
      //   contractAddress: "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85",
      //   type: "erc20",
      //   coinImageUrl:
      //     "https://assets.coingecko.com/coins/images/5681/thumb/Fetch.jpg?1572098136",
      // },
    ],
    feeCurrencies: [
      {
        coinDenom: "ETH",
        coinMinimalDenom: "eth",
        coinDecimals: 18,
        coinGeckoId: "ethereum",
        gasPriceStep: {
          low: 40000000000,
          average: 40000000000,
          high: 40000000000,
        },
      },
    ],
    features: ["evm"],
    explorerUrl: "https://goerli.etherscan.io",
  },
  {
    rpc: "https://rpc-cosmoshub.keplr.app",
    rest: "https://lcd-cosmoshub.keplr.app",
    chainId: "cosmoshub-4",
    chainName: "Cosmos Hub",
    stakeCurrency: {
      coinDenom: "ATOM",
      coinMinimalDenom: "uatom",
      coinDecimals: 6,
      coinGeckoId: "cosmos",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/cosmos-hub"
        : "http://localhost:8080/chains/cosmos-hub",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/cosmos-hub"
        : "http://localhost:8080/chains/cosmos-hub",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("cosmos"),
    currencies: [
      {
        coinDenom: "ATOM",
        coinMinimalDenom: "uatom",
        coinDecimals: 6,
        coinGeckoId: "cosmos",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "ATOM",
        coinMinimalDenom: "uatom",
        coinDecimals: 6,
        coinGeckoId: "cosmos",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png",
      },
    ],
    features: ["ibc-transfer", "ibc-go"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png",
    txExplorer: {
      name: "Mintscan",
      txUrl: "https://www.mintscan.io/cosmos/txs/{txHash}",
    },
  },
  {
    rpc: "https://rpc-osmosis.keplr.app",
    rest: "https://lcd-osmosis.keplr.app",
    chainId: "osmosis-1",
    chainName: "Osmosis",
    stakeCurrency: {
      coinDenom: "OSMO",
      coinMinimalDenom: "uosmo",
      coinDecimals: 6,
      coinGeckoId: "osmosis",
      coinImageUrl: "https://dhj8dql1kzq2v.cloudfront.net/white/osmo.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://app.osmosis.zone"
        : "https://app.osmosis.zone",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/osmosis"
        : "http://localhost:8080/chains/osmosis",
    bip44: { coinType: 118 },
    bech32Config: Bech32Address.defaultBech32Config("osmo"),
    currencies: [
      {
        coinDenom: "OSMO",
        coinMinimalDenom: "uosmo",
        coinDecimals: 6,
        coinGeckoId: "osmosis",
        coinImageUrl: "https://dhj8dql1kzq2v.cloudfront.net/white/osmo.png",
      },
      {
        coinDenom: "ION",
        coinMinimalDenom: "uion",
        coinDecimals: 6,
        coinGeckoId: "ion",
        coinImageUrl:
          "https://dhj8dql1kzq2v.cloudfront.net/white/osmosis-ion.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "OSMO",
        coinMinimalDenom: "uosmo",
        coinDecimals: 6,
        coinGeckoId: "osmosis",
        coinImageUrl: "https://dhj8dql1kzq2v.cloudfront.net/white/osmo.png",
        gasPriceStep: {
          low: 0,
          average: 0.025,
          high: 0.04,
        },
      },
    ],
    features: [
      "ibc-transfer",
      "ibc-go",
      "cosmwasm",
      "wasmd_0.24+",
      "osmosis-txfees",
    ],
    // chainSymbolImageUrl: "https://dhj8dql1kzq2v.cloudfront.net/white/osmo.png",
    chainSymbolImageUrl: require("./public/assets/svg/wireframe/osmosis.svg"),
    txExplorer: {
      name: "Mintscan",
      txUrl: "https://www.mintscan.io/osmosis/txs/{txHash}",
    },
  },
  {
    rpc: "https://rpc.osmotest5.osmosis.zone",
    rest: "https://lcd.osmotest5.osmosis.zone/",
    chainId: "osmo-test-5",
    chainName: "Osmosis testnet",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "OSMO",
      coinMinimalDenom: "uosmo",
      coinDecimals: 6,
      coinGeckoId: "osmosis",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://rpc.osmotest5.osmosis.zone"
        : "https://rpc.osmotest5.osmosis.zone",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/osmosis"
        : "http://localhost:8080/chains/osmosis",
    bip44: { coinType: 118 },
    type: "testnet",
    bech32Config: Bech32Address.defaultBech32Config("osmo"),
    currencies: [
      {
        coinDenom: "OSMO",
        coinMinimalDenom: "uosmo",
        coinDecimals: 6,
        coinGeckoId: "osmosis",
      },
      {
        coinDenom: "ION",
        coinMinimalDenom: "uion",
        coinDecimals: 6,
        coinGeckoId: "ion",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "OSMO",
        coinMinimalDenom: "uosmo",
        coinDecimals: 6,
        coinGeckoId: "osmosis",
        gasPriceStep: {
          low: 0,
          average: 0.025,
          high: 0.04,
        },
      },
    ],
    features: [
      "ibc-transfer",
      "ibc-go",
      "cosmwasm",
      "wasmd_0.24+",
      "osmosis-txfees",
    ],
  },
  {
    rpc: "https://rpc-secret.keplr.app",
    rest: "https://lcd-secret.keplr.app",
    chainId: "secret-4",
    chainName: "Secret Network",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "SCRT",
      coinMinimalDenom: "uscrt",
      coinDecimals: 6,
      coinGeckoId: "secret",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/secretnetwork/images/scrt.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/secret-network"
        : "http://localhost:8080/chains/secret-network",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/secret-network"
        : "http://localhost:8080/chains/secret-network",
    bip44: {
      coinType: 529,
    },
    alternativeBIP44s: [
      {
        coinType: 118,
      },
    ],
    bech32Config: Bech32Address.defaultBech32Config("secret"),
    currencies: [
      {
        coinDenom: "SCRT",
        coinMinimalDenom: "uscrt",
        coinDecimals: 6,
        coinGeckoId: "secret",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/secretnetwork/images/scrt.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "SCRT",
        coinMinimalDenom: "uscrt",
        coinDecimals: 6,
        coinGeckoId: "secret",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/secretnetwork/images/scrt.png",
        gasPriceStep: {
          low: 0.2,
          average: 0.25,
          high: 0.3,
        },
      },
    ],
    features: ["secretwasm", "ibc-go", "ibc-transfer"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/secretnetwork/images/scrt.png",
  },
  {
    rpc: "https://rpc-akash.keplr.app",
    rest: "https://lcd-akash.keplr.app",
    chainId: "akashnet-2",
    chainName: "Akash",
    stakeCurrency: {
      coinDenom: "AKT",
      coinMinimalDenom: "uakt",
      coinDecimals: 6,
      coinGeckoId: "akash-network",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/akash/images/akt.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/akash"
        : "http://localhost:8080/chains/akash",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/akash"
        : "http://localhost:8080/chains/akash",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("akash"),
    currencies: [
      {
        coinDenom: "AKT",
        coinMinimalDenom: "uakt",
        coinDecimals: 6,
        coinGeckoId: "akash-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/akash/images/akt.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "AKT",
        coinMinimalDenom: "uakt",
        coinDecimals: 6,
        coinGeckoId: "akash-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/akash/images/akt.png",
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/akash/images/akt.png",
    features: ["ibc-transfer"],
  },
  {
    rpc: "https://rpc-mars.keplr.app",
    rest: "https://lcd-mars.keplr.app",
    chainId: "mars-1",
    chainName: "Mars Hub",
    stakeCurrency: {
      coinDenom: "MARS",
      coinMinimalDenom: "umars",
      coinDecimals: 6,
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/mars/images/mars-protocol.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/mars"
        : "http://localhost:8080/chains/mars",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/mars"
        : "http://localhost:8080/chains/mars",
    bip44: {
      coinType: 118,
    },
    alternativeBIP44s: [
      {
        coinType: 330,
      },
    ],
    bech32Config: Bech32Address.defaultBech32Config("mars"),
    currencies: [
      {
        coinDenom: "MARS",
        coinMinimalDenom: "umars",
        coinDecimals: 6,
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/mars/images/mars-protocol.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "MARS",
        coinMinimalDenom: "umars",
        coinDecimals: 6,
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/mars/images/mars-protocol.png",
        gasPriceStep: {
          low: 0,
          average: 0,
          high: 0.01,
        },
      },
    ],
    features: [],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/mars/images/mars-protocol.png",
  },
  {
    rpc: "https://rpc-crypto-org.keplr.app",
    rest: "https://lcd-crypto-org.keplr.app",
    chainId: "crypto-org-chain-mainnet-1",
    chainName: "Crypto.org",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "CRO",
      coinMinimalDenom: "basecro",
      coinDecimals: 8,
      coinGeckoId: "crypto-com-chain",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/cryptoorgchain/images/cronos.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/crypto-org"
        : "http://localhost:8080/chains/crypto-org",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/crypto-org"
        : "http://localhost:8080/chains/crypto-org",
    bip44: {
      coinType: 394,
    },
    bech32Config: {
      bech32PrefixAccAddr: "cro",
      bech32PrefixAccPub: "cropub",
      bech32PrefixValAddr: "crocncl",
      bech32PrefixValPub: "crocnclpub",
      bech32PrefixConsAddr: "crocnclcons",
      bech32PrefixConsPub: "crocnclconspub",
    },
    currencies: [
      {
        coinDenom: "CRO",
        coinMinimalDenom: "basecro",
        coinDecimals: 8,
        coinGeckoId: "crypto-com-chain",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/cryptoorgchain/images/cronos.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "CRO",
        coinMinimalDenom: "basecro",
        coinDecimals: 8,
        coinGeckoId: "crypto-com-chain",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/cryptoorgchain/images/cronos.png",
        gasPriceStep: {
          low: 0.025,
          average: 0.03,
          high: 0.04,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/cryptoorgchain/images/cronos.png",
    features: ["ibc-transfer"],
  },
  {
    rpc: "https://rpc-iov.keplr.app",
    rest: "https://lcd-iov.keplr.app",
    chainId: "iov-mainnet-ibc",
    chainName: "Starname",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "IOV",
      coinMinimalDenom: "uiov",
      coinDecimals: 6,
      coinGeckoId: "starname",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/starname/images/iov.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/starname"
        : "http://localhost:8080/chains/starname",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/starname"
        : "http://localhost:8080/chains/starname",
    bip44: {
      coinType: 234,
    },
    bech32Config: Bech32Address.defaultBech32Config("star"),
    currencies: [
      {
        coinDenom: "IOV",
        coinMinimalDenom: "uiov",
        coinDecimals: 6,
        coinGeckoId: "starname",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/starname/images/iov.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "IOV",
        coinMinimalDenom: "uiov",
        coinDecimals: 6,
        coinGeckoId: "starname",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/starname/images/iov.png",
        gasPriceStep: {
          low: 1,
          average: 2,
          high: 3,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/starname/images/iov.png",
    features: ["ibc-transfer"],
  },
  {
    rpc: "https://rpc-sifchain.keplr.app",
    rest: "https://lcd-sifchain.keplr.app",
    chainId: "sifchain-1",
    chainName: "Sifchain",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "ROWAN",
      coinMinimalDenom: "rowan",
      coinDecimals: 18,
      coinGeckoId: "sifchain",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/sifchain/images/rowan.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/sifchain"
        : "http://localhost:8080/chains/sifchain",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/sifchain"
        : "http://localhost:8080/chains/sifchain",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("sif"),
    currencies: [
      {
        coinDenom: "ROWAN",
        coinMinimalDenom: "rowan",
        coinDecimals: 18,
        coinGeckoId: "sifchain",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/sifchain/images/rowan.png",
      },
      {
        coinDenom: "Tether USDT",
        coinMinimalDenom: "cusdt",
        coinDecimals: 6,
      },
      {
        coinDenom: "Ethereum",
        coinMinimalDenom: "ceth",
        coinDecimals: 18,
      },
      {
        coinDenom: "Basic Attention Token",
        coinMinimalDenom: "cbat",
        coinDecimals: 18,
      },
      {
        coinDenom: "Aragon",
        coinMinimalDenom: "cant",
        coinDecimals: 18,
      },
      {
        coinDenom: "Bancor Network Token",
        coinMinimalDenom: "cbnt",
        coinDecimals: 18,
      },
      {
        coinDenom: "0x",
        coinMinimalDenom: "czrx",
        coinDecimals: 18,
      },
      {
        coinDenom: "Chainlink",
        coinMinimalDenom: "clink",
        coinDecimals: 18,
      },
      {
        coinDenom: "Decentraland",
        coinMinimalDenom: "cmana",
        coinDecimals: 18,
      },
      {
        coinDenom: "Loopring",
        coinMinimalDenom: "clrc",
        coinDecimals: 18,
      },
      {
        coinDenom: "Enjin Coin",
        coinMinimalDenom: "cenj",
        coinDecimals: 18,
      },
      {
        coinDenom: "Synthetix Network Token",
        coinMinimalDenom: "csnx",
        coinDecimals: 18,
      },
      {
        coinDenom: "TrueUSD",
        coinMinimalDenom: "ctusd",
        coinDecimals: 18,
      },
      {
        coinDenom: "Ocean Protocol",
        coinMinimalDenom: "cocean",
        coinDecimals: 18,
      },
      {
        coinDenom: "Fantom",
        coinMinimalDenom: "cftm",
        coinDecimals: 18,
      },
      {
        coinDenom: "sUSD",
        coinMinimalDenom: "csusd",
        coinDecimals: 18,
      },
      {
        coinDenom: "USD Coin",
        coinMinimalDenom: "cusdc",
        coinDecimals: 6,
      },
      {
        coinDenom: "Crypto com Coin",
        coinMinimalDenom: "ccro",
        coinDecimals: 8,
      },
      {
        coinDenom: "Wrapped Bitcoin",
        coinMinimalDenom: "cwbtc",
        coinDecimals: 8,
      },
      {
        coinDenom: "Swipe",
        coinMinimalDenom: "csxp",
        coinDecimals: 18,
      },
      {
        coinDenom: "Band Protocol",
        coinMinimalDenom: "cband",
        coinDecimals: 18,
      },
      {
        coinDenom: "Dai Stablecoin",
        coinMinimalDenom: "cdai",
        coinDecimals: 18,
      },
      {
        coinDenom: "Compound",
        coinMinimalDenom: "ccomp",
        coinDecimals: 18,
      },
      {
        coinDenom: "UMA",
        coinMinimalDenom: "cuma",
        coinDecimals: 18,
      },
      {
        coinDenom: "Balancer",
        coinMinimalDenom: "cbal",
        coinDecimals: 18,
      },
      {
        coinDenom: "Yearn finance",
        coinMinimalDenom: "cyfi",
        coinDecimals: 18,
      },
      {
        coinDenom: "Serum",
        coinMinimalDenom: "csrm",
        coinDecimals: 6,
      },
      {
        coinDenom: "Cream",
        coinMinimalDenom: "ccream",
        coinDecimals: 18,
      },
      {
        coinDenom: "SAND",
        coinMinimalDenom: "csand",
        coinDecimals: 18,
      },
      {
        coinDenom: "Sushi",
        coinMinimalDenom: "csushi",
        coinDecimals: 18,
      },
      {
        coinDenom: "Empty Set Dollar",
        coinMinimalDenom: "cesd",
        coinDecimals: 18,
      },
      {
        coinDenom: "Uniswap",
        coinMinimalDenom: "cuni",
        coinDecimals: 18,
      },
      {
        coinDenom: "Aave",
        coinMinimalDenom: "caave",
        coinDecimals: 18,
      },
      {
        coinDenom: "BarnBridge",
        coinMinimalDenom: "cbond",
        coinDecimals: 18,
      },
      {
        coinDenom: "Wrapped Filecoin",
        coinMinimalDenom: "cwfil",
        coinDecimals: 18,
      },
      {
        coinDenom: "The Graph",
        coinMinimalDenom: "cgrt",
        coinDecimals: 18,
      },
      {
        coinDenom: "Tokenlon",
        coinMinimalDenom: "clon",
        coinDecimals: 18,
      },
      {
        coinDenom: "1inch",
        coinMinimalDenom: "c1inch",
        coinDecimals: 18,
      },
      {
        coinDenom: "THORChain ERC20",
        coinMinimalDenom: "crune",
        coinDecimals: 18,
      },
      {
        coinDenom: "Secret ERC20",
        coinMinimalDenom: "cwscrt",
        coinDecimals: 6,
      },
      {
        coinDenom: "IoTeX",
        coinMinimalDenom: "ciotx",
        coinDecimals: 18,
      },
      {
        coinDenom: "Reef Finance",
        coinMinimalDenom: "creef",
        coinDecimals: 18,
      },
      {
        coinDenom: "COCOS BCX",
        coinMinimalDenom: "ccocos",
        coinDecimals: 18,
      },
      {
        coinDenom: "Keep Network",
        coinMinimalDenom: "ckeep",
        coinDecimals: 18,
      },
      {
        coinDenom: "Origin Protocol",
        coinMinimalDenom: "cogn",
        coinDecimals: 18,
      },
      {
        coinDenom: "ODAOfi",
        coinMinimalDenom: "cdaofi",
        coinDecimals: 18,
      },
      {
        coinDenom: "Linear",
        coinMinimalDenom: "clina",
        coinDecimals: 18,
      },
      {
        coinDenom: "12Ships",
        coinMinimalDenom: "ctshp",
        coinDecimals: 18,
      },
      {
        coinDenom: "B.20",
        coinMinimalDenom: "cb20",
        coinDecimals: 18,
      },
      {
        coinDenom: "Akropolis",
        coinMinimalDenom: "cakro",
        coinDecimals: 18,
      },
      {
        coinDenom: "Rio Fuel Token",
        coinMinimalDenom: "crfuel",
        coinDecimals: 18,
      },
      {
        coinDenom: "Rally",
        coinMinimalDenom: "crly",
        coinDecimals: 18,
      },
      {
        coinDenom: "Convergence",
        coinMinimalDenom: "cconv",
        coinDecimals: 18,
      },
      {
        coinDenom: "Render Token",
        coinMinimalDenom: "crndr",
        coinDecimals: 18,
      },
      {
        coinDenom: "PAID Network",
        coinMinimalDenom: "cpaid",
        coinDecimals: 18,
      },
      {
        coinDenom: "Tidal",
        coinMinimalDenom: "ctidal",
        coinDecimals: 18,
      },
      {
        coinDenom: "Axie Infinity",
        coinMinimalDenom: "caxs",
        coinDecimals: 18,
      },
      {
        coinDenom: "BitSong",
        coinMinimalDenom: "cbtsg",
        coinDecimals: 18,
      },
      {
        coinDenom: "Cosmostarter",
        coinMinimalDenom: "ccsms",
        coinDecimals: 18,
      },
      {
        coinDenom: "Dfyn Network",
        coinMinimalDenom: "cdfyn",
        coinDecimals: 18,
      },
      {
        coinDenom: "DinoSwap",
        coinMinimalDenom: "cdino",
        coinDecimals: 18,
      },
      {
        coinDenom: "DinoX",
        coinMinimalDenom: "cdnxc",
        coinDecimals: 18,
      },
      {
        coinDenom: "Don-key",
        coinMinimalDenom: "cdon",
        coinDecimals: 18,
      },
      {
        coinDenom: "Ethernity Chain",
        coinMinimalDenom: "cern",
        coinDecimals: 18,
      },
      {
        coinDenom: "Frax",
        coinMinimalDenom: "cfrax",
        coinDecimals: 18,
      },
      {
        coinDenom: "Frax Share",
        coinMinimalDenom: "cfxs",
        coinDecimals: 18,
      },
      {
        coinDenom: "Knit Finance",
        coinMinimalDenom: "ckft",
        coinDecimals: 18,
      },
      {
        coinDenom: "Lido DAO",
        coinMinimalDenom: "cldo",
        coinDecimals: 18,
      },
      {
        coinDenom: "Doge Killer",
        coinMinimalDenom: "cleash",
        coinDecimals: 18,
      },
      {
        coinDenom: "LGCY Network",
        coinMinimalDenom: "clgcy",
        coinDecimals: 18,
      },
      {
        coinDenom: "Polygon",
        coinMinimalDenom: "cmatic",
        coinDecimals: 18,
      },
      {
        coinDenom: "Metis Token",
        coinMinimalDenom: "cmetis",
        coinDecimals: 18,
      },
      {
        coinDenom: "Oh! Finance",
        coinMinimalDenom: "coh",
        coinDecimals: 18,
      },
      {
        coinDenom: "Polkastarter",
        coinMinimalDenom: "cpols",
        coinDecimals: 18,
      },
      {
        coinDenom: "Marlin",
        coinMinimalDenom: "cpond",
        coinDecimals: 18,
      },
      {
        coinDenom: "Quickswap",
        coinMinimalDenom: "cquick",
        coinDecimals: 18,
      },
      {
        coinDenom: "Railgun",
        coinMinimalDenom: "crail",
        coinDecimals: 18,
      },
      {
        coinDenom: "StaFi rATOM",
        coinMinimalDenom: "cratom",
        coinDecimals: 18,
      },
      {
        coinDenom: "Saito",
        coinMinimalDenom: "csaito",
        coinDecimals: 18,
      },
      {
        coinDenom: "Shiba Inu",
        coinMinimalDenom: "cshib",
        coinDecimals: 18,
      },
      {
        coinDenom: "Tokemak",
        coinMinimalDenom: "ctoke",
        coinDecimals: 18,
      },
      {
        coinDenom: "UFO Gaming",
        coinMinimalDenom: "cufo",
        coinDecimals: 18,
      },
      {
        coinDenom: "UST (ERC-20)",
        coinMinimalDenom: "cust",
        coinDecimals: 18,
      },
      {
        coinDenom: "0chain",
        coinMinimalDenom: "czcn",
        coinDecimals: 18,
      },
      {
        coinDenom: "Unizen",
        coinMinimalDenom: "czcx",
        coinDecimals: 18,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "ROWAN",
        coinMinimalDenom: "rowan",
        coinDecimals: 18,
        coinGeckoId: "sifchain",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/sifchain/images/rowan.png",
        gasPriceStep: {
          low: 1000000000000,
          average: 1500000000000,
          high: 2000000000000,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/sifchain/images/rowan.png",
    features: [],
  },
  {
    rpc: "https://rpc-certik.keplr.app",
    rest: "https://lcd-certik.keplr.app",
    chainId: "shentu-2.2",
    chainName: "Shentu",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "CTK",
      coinMinimalDenom: "uctk",
      coinDecimals: 6,
      coinGeckoId: "certik",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/shentu"
        : "http://localhost:8080/chains/shentu",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/shentu"
        : "http://localhost:8080/chains/shentu",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("certik"),
    currencies: [
      {
        coinDenom: "CTK",
        coinMinimalDenom: "uctk",
        coinDecimals: 6,
        coinGeckoId: "certik",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/shentu/images/ctk.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "CTK",
        coinMinimalDenom: "uctk",
        coinDecimals: 6,
        coinGeckoId: "certik",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/shentu/images/ctk.png",
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/shentu/images/ctk.png",
    features: ["ibc-transfer", "ibc-go"],
  },
  {
    rpc: "https://rpc-iris.keplr.app",
    rest: "https://lcd-iris.keplr.app",
    chainId: "irishub-1",
    chainName: "IRISnet",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "IRIS",
      coinMinimalDenom: "uiris",
      coinDecimals: 6,
      coinGeckoId: "iris-network",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/irisnet/images/iris.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/irisnet"
        : "http://localhost:8080/chains/irisnet",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/irisnet"
        : "http://localhost:8080/chains/irisnet",
    bip44: {
      coinType: 118,
    },
    alternativeBIP44s: [
      {
        coinType: 566,
      },
    ],
    bech32Config: {
      bech32PrefixAccAddr: "iaa",
      bech32PrefixAccPub: "iap",
      bech32PrefixValAddr: "iva",
      bech32PrefixValPub: "ivp",
      bech32PrefixConsAddr: "ica",
      bech32PrefixConsPub: "icp",
    },
    currencies: [
      {
        coinDenom: "IRIS",
        coinMinimalDenom: "uiris",
        coinDecimals: 6,
        coinGeckoId: "iris-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/irisnet/images/iris.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "IRIS",
        coinMinimalDenom: "uiris",
        coinDecimals: 6,
        coinGeckoId: "iris-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/irisnet/images/iris.png",
        gasPriceStep: {
          low: 0.2,
          average: 0.3,
          high: 0.4,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/irisnet/images/iris.png",
    features: ["ibc-transfer", "ibc-go"],
  },
  {
    rpc: "https://rpc-regen.keplr.app",
    rest: "https://lcd-regen.keplr.app",
    chainId: "regen-1",
    chainName: "Regen",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "REGEN",
      coinMinimalDenom: "uregen",
      coinDecimals: 6,
      coinGeckoId: "regen",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/regen/images/regen.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/regen"
        : "http://localhost:8080/chains/regen",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/regen"
        : "http://localhost:8080/chains/regen",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("regen"),
    currencies: [
      {
        coinDenom: "REGEN",
        coinMinimalDenom: "uregen",
        coinDecimals: 6,
        coinGeckoId: "regen",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/regen/images/regen.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "REGEN",
        coinMinimalDenom: "uregen",
        coinDecimals: 6,
        coinGeckoId: "regen",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/regen/images/regen.png",
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/regen/images/regen.png",
    features: ["ibc-go", "ibc-transfer"],
  },
  {
    rpc: "https://rpc-persistence.keplr.app",
    rest: "https://lcd-persistence.keplr.app",
    chainId: "core-1",
    chainName: "Persistence",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "XPRT",
      coinMinimalDenom: "uxprt",
      coinDecimals: 6,
      coinGeckoId: "persistence",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/persistence"
        : "http://localhost:8080/chains/persistence",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/persistence"
        : "http://localhost:8080/chains/persistence",
    bip44: {
      coinType: 118,
    },
    alternativeBIP44s: [
      {
        coinType: 750,
      },
    ],
    bech32Config: Bech32Address.defaultBech32Config("persistence"),
    currencies: [
      {
        coinDenom: "XPRT",
        coinMinimalDenom: "uxprt",
        coinDecimals: 6,
        coinGeckoId: "persistence",
      },
      {
        coinDenom: "STKATOM",
        coinMinimalDenom: "stk/uatom",
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "XPRT",
        coinMinimalDenom: "uxprt",
        coinDecimals: 6,
        coinGeckoId: "persistence",
        gasPriceStep: {
          low: 0,
          average: 0.025,
          high: 0.04,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/persistence/images/xprt.png",
    features: ["ibc-transfer", "ibc-go"],
  },
  {
    rpc: "https://rpc-sentinel.keplr.app",
    rest: "https://lcd-sentinel.keplr.app",
    chainId: "sentinelhub-2",
    chainName: "Sentinel",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "DVPN",
      coinMinimalDenom: "udvpn",
      coinDecimals: 6,
      coinGeckoId: "sentinel",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/sentinel/images/dvpn.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/sentinel"
        : "http://localhost:8080/chains/sentinel",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/sentinel"
        : "http://localhost:8080/chains/sentinel",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("sent"),
    currencies: [
      {
        coinDenom: "DVPN",
        coinMinimalDenom: "udvpn",
        coinDecimals: 6,
        coinGeckoId: "sentinel",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/sentinel/images/dvpn.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "DVPN",
        coinMinimalDenom: "udvpn",
        coinDecimals: 6,
        coinGeckoId: "sentinel",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/sentinel/images/dvpn.png",
        gasPriceStep: {
          low: 0.1,
          average: 0.25,
          high: 0.4,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/sentinel/images/dvpn.png",
    features: ["ibc-transfer"],
  },
  {
    rpc: "https://rpc-ixo.keplr.app",
    rest: "https://lcd-ixo.keplr.app",
    chainId: "ixo-4",
    chainName: "ixo",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "IXO",
      coinMinimalDenom: "uixo",
      coinDecimals: 6,
      coinGeckoId: "ixo",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/ixo"
        : "http://localhost:8080/chains/ixo",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/ixo"
        : "http://localhost:8080/chains/ixo",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("ixo"),
    currencies: [
      {
        coinDenom: "IXO",
        coinMinimalDenom: "uixo",
        coinDecimals: 6,
        coinGeckoId: "ixo",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "IXO",
        coinMinimalDenom: "uixo",
        coinDecimals: 6,
        coinGeckoId: "ixo",
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/impacthub/images/ixo.png",
    features: ["ibc-transfer"],
  },
  {
    rpc: "https://rpc-emoney.keplr.app",
    rest: "https://lcd-emoney.keplr.app",
    chainId: "emoney-3",
    chainName: "e-Money",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "NGM",
      coinMinimalDenom: "ungm",
      coinDecimals: 6,
      coinGeckoId: "e-money",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/e-money"
        : "http://localhost:8080/chains/e-money",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/e-money"
        : "http://localhost:8080/chains/e-money",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("emoney"),
    currencies: [
      {
        coinDenom: "NGM",
        coinMinimalDenom: "ungm",
        coinDecimals: 6,
        coinGeckoId: "e-money",
      },
      {
        coinDenom: "EEUR",
        coinMinimalDenom: "eeur",
        coinDecimals: 6,
        coinGeckoId: "e-money-eur",
      },
      {
        coinDenom: "EDKK",
        coinMinimalDenom: "edkk",
        coinDecimals: 6,
      },
      {
        coinDenom: "ESEK",
        coinMinimalDenom: "esek",
        coinDecimals: 6,
      },
      {
        coinDenom: "ENOK",
        coinMinimalDenom: "enok",
        coinDecimals: 6,
      },
      {
        coinDenom: "ECHF",
        coinMinimalDenom: "echf",
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "NGM",
        coinMinimalDenom: "ungm",
        coinDecimals: 6,
        coinGeckoId: "e-money",
        gasPriceStep: {
          low: 1,
          average: 1,
          high: 1,
        },
      },
      {
        coinDenom: "EEUR",
        coinMinimalDenom: "eeur",
        coinDecimals: 6,
        coinGeckoId: "e-money-eur",
        gasPriceStep: {
          low: 1,
          average: 1,
          high: 1,
        },
      },
      {
        coinDenom: "ECHF",
        coinMinimalDenom: "echf",
        coinDecimals: 6,
        gasPriceStep: {
          low: 1,
          average: 1,
          high: 1,
        },
      },
      {
        coinDenom: "ESEK",
        coinMinimalDenom: "esek",
        coinDecimals: 6,
        gasPriceStep: {
          low: 1,
          average: 1,
          high: 1,
        },
      },
      {
        coinDenom: "ENOK",
        coinMinimalDenom: "enok",
        coinDecimals: 6,
        gasPriceStep: {
          low: 1,
          average: 1,
          high: 1,
        },
      },
      {
        coinDenom: "EDKK",
        coinMinimalDenom: "edkk",
        coinDecimals: 6,
        gasPriceStep: {
          low: 1,
          average: 1,
          high: 1,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/emoney/images/ngm.png",
    features: ["ibc-transfer"],
  },
  {
    rpc: "https://rpc-agoric.keplr.app",
    rest: "https://lcd-agoric.keplr.app",
    chainId: "agoric-3",
    chainName: "Agoric",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "BLD",
      coinMinimalDenom: "ubld",
      coinDecimals: 6,
      coinGeckoId: "agoric",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/agoric"
        : "http://localhost:8080/chains/agoric",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/agoric"
        : "http://localhost:8080/chains/agoric",
    bip44: {
      coinType: 564,
    },
    bech32Config: Bech32Address.defaultBech32Config("agoric"),
    currencies: [
      {
        coinDenom: "BLD",
        coinMinimalDenom: "ubld",
        coinDecimals: 6,
        coinGeckoId: "agoric",
      },
      {
        coinDenom: "IST",
        coinMinimalDenom: "uist",
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "BLD",
        coinMinimalDenom: "ubld",
        coinDecimals: 6,
        coinGeckoId: "agoric",
        gasPriceStep: {
          low: 0.012,
          average: 0.024,
          high: 0.071,
        },
      },
      {
        coinDenom: "IST",
        coinMinimalDenom: "uist",
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.0034,
          average: 0.007,
          high: 0.02,
        },
      },
    ],
    features: ["ibc-go"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/agoric/images/Agoric-logo-color.png",
  },
  {
    rpc: "https://rpc-cyber.keplr.app",
    rest: "https://lcd-cyber.keplr.app",
    chainId: "bostrom",
    chainName: "Bostrom",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "BOOT",
      coinMinimalDenom: "boot",
      coinDecimals: 0,
      coinGeckoId: "bostrom",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/bostrom"
        : "http://localhost:8080/chains/bostrom",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/bostrom"
        : "http://localhost:8080/chains/bostrom",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("bostrom"),
    currencies: [
      {
        coinDenom: "BOOT",
        coinMinimalDenom: "boot",
        coinDecimals: 0,
        coinGeckoId: "bostrom",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/bostrom/images/boot.png",
      },
      {
        coinDenom: "H",
        coinMinimalDenom: "hydrogen",
        coinDecimals: 0,
      },
      {
        coinDenom: "V",
        coinMinimalDenom: "millivolt",
        coinDecimals: 3,
      },
      {
        coinDenom: "A",
        coinMinimalDenom: "milliampere",
        coinDecimals: 3,
      },
      {
        coinDenom: "TOCYB",
        coinMinimalDenom: "tocyb",
        coinDecimals: 0,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "BOOT",
        coinMinimalDenom: "boot",
        coinDecimals: 0,
        coinGeckoId: "bostrom",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/bostrom/images/boot.png",
        gasPriceStep: {
          low: 0,
          average: 0,
          high: 0.01,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/bostrom/images/boot.png",
    features: ["ibc-transfer", "cosmwasm", "ibc-go"],
  },
  {
    rpc: "https://rpc-juno.keplr.app",
    rest: "https://lcd-juno.keplr.app",
    chainId: "juno-1",
    chainName: "Juno",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "JUNO",
      coinMinimalDenom: "ujuno",
      coinDecimals: 6,
      coinGeckoId: "juno-network",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/juno/images/juno.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/juno"
        : "http://localhost:8080/chains/juno",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/juno"
        : "http://localhost:8080/chains/juno",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("juno"),
    currencies: [
      {
        coinDenom: "JUNO",
        coinMinimalDenom: "ujuno",
        coinDecimals: 6,
        coinGeckoId: "juno-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/juno/images/juno.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "JUNO",
        coinMinimalDenom: "ujuno",
        coinDecimals: 6,
        coinGeckoId: "juno-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/juno/images/juno.png",
        gasPriceStep: {
          low: 0.001,
          average: 0.0025,
          high: 0.004,
        },
      },
      {
        coinDenom: "ATOM",
        coinMinimalDenom:
          "ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9",
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.001 * 0.33,
          average: 0.0025 * 0.33,
          high: 0.004 * 0.33,
        },
      },
    ],
    features: ["cosmwasm", "ibc-transfer", "ibc-go", "wasmd_0.24+"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/juno/images/juno.png",
    txExplorer: {
      name: "Mintscan",
      txUrl: "https://www.mintscan.io/juno/txs/{txHash}",
    },
  },
  {
    rpc: "https://rpc-stargaze.keplr.app",
    rest: "https://lcd-stargaze.keplr.app",
    chainId: "stargaze-1",
    chainName: "Stargaze",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "STARS",
      coinMinimalDenom: "ustars",
      coinDecimals: 6,
      coinGeckoId: "stargaze",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/stargaze/images/stars.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/stargaze"
        : "http://localhost:8080/chains/stargaze",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/stargaze"
        : "http://localhost:8080/chains/stargaze",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("stars"),
    currencies: [
      {
        coinDenom: "STARS",
        coinMinimalDenom: "ustars",
        coinDecimals: 6,
        coinGeckoId: "stargaze",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/stargaze/images/stars.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "STARS",
        coinMinimalDenom: "ustars",
        coinDecimals: 6,
        coinGeckoId: "stargaze",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/stargaze/images/stars.png",
      },
    ],
    features: ["ibc-transfer", "ibc-go"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/stargaze/images/stars.png",
    txExplorer: {
      name: "Mintscan",
      txUrl: "https://www.mintscan.io/stargaze/txs/{txHash}",
    },
  },
  {
    rpc: "https://rpc-axelar.keplr.app",
    rest: "https://lcd-axelar.keplr.app",
    chainId: "axelar-dojo-1",
    chainName: "Axelar",
    stakeCurrency: {
      coinDenom: "AXL",
      coinMinimalDenom: "uaxl",
      coinDecimals: 6,
      coinGeckoId: "axelar",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/axelar/images/axl.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/axelar"
        : "http://localhost:8080/chains/axelar",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/axelar"
        : "http://localhost:8080/chains/axelar",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("axelar"),
    currencies: [
      {
        coinDenom: "AXL",
        coinMinimalDenom: "uaxl",
        coinDecimals: 6,
        coinGeckoId: "axelar",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/axelar/images/axl.png",
      },
      {
        coinDenom: "WETH",
        coinMinimalDenom: "weth-wei",
        coinDecimals: 18,
        coinGeckoId: "weth",
      },
      {
        coinDenom: "USDC",
        coinMinimalDenom: "uusdc",
        coinDecimals: 6,
        coinGeckoId: "usd-coin",
      },
      {
        coinDenom: "FRAX",
        coinMinimalDenom: "frax-wei",
        coinDecimals: 18,
        coinGeckoId: "frax",
      },
      {
        coinDenom: "DAI",
        coinMinimalDenom: "dai-wei",
        coinDecimals: 18,
        coinGeckoId: "dai",
      },
      {
        coinDenom: "USDT",
        coinMinimalDenom: "uusdt",
        coinDecimals: 6,
        coinGeckoId: "tether",
      },
      {
        coinDenom: "WBTC",
        coinMinimalDenom: "wbtc-satoshi",
        coinDecimals: 8,
        coinGeckoId: "wrapped-bitcoin",
      },
      {
        coinDenom: "LINK",
        coinMinimalDenom: "link-wei",
        coinDecimals: 18,
        coinGeckoId: "chainlink",
      },
      {
        coinDenom: "AAVE",
        coinMinimalDenom: "aave-wei",
        coinDecimals: 18,
        coinGeckoId: "aave",
      },
      {
        coinDenom: "APE",
        coinMinimalDenom: "ape-wei",
        coinDecimals: 18,
        coinGeckoId: "apecoin",
      },
      {
        coinDenom: "AXS",
        coinMinimalDenom: "axs-wei",
        coinDecimals: 18,
        coinGeckoId: "axie-infinity",
      },
      {
        coinDenom: "MKR",
        coinMinimalDenom: "mkr-wei",
        coinDecimals: 18,
        coinGeckoId: "maker",
      },
      {
        coinDenom: "RAI",
        coinMinimalDenom: "rai-wei",
        coinDecimals: 18,
        coinGeckoId: "rai",
      },
      {
        coinDenom: "SHIB",
        coinMinimalDenom: "shib-wei",
        coinDecimals: 18,
        coinGeckoId: "shiba-inu",
      },
      {
        coinDenom: "stETH",
        coinMinimalDenom: "steth-wei",
        coinDecimals: 18,
        coinGeckoId: "staked-ether",
      },
      {
        coinDenom: "UNI",
        coinMinimalDenom: "uni-wei",
        coinDecimals: 18,
        coinGeckoId: "uniswap",
      },
      {
        coinDenom: "XCN",
        coinMinimalDenom: "xcn-wei",
        coinDecimals: 18,
        coinGeckoId: "chain-2",
      },
      {
        coinDenom: "WGLMR",
        coinMinimalDenom: "wglmr-wei",
        coinDecimals: 18,
        coinGeckoId: "wrapped-moonbeam",
      },
      {
        coinDenom: "DOT",
        coinMinimalDenom: "dot-planck",
        coinDecimals: 10,
        coinGeckoId: "polkadot",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "AXL",
        coinMinimalDenom: "uaxl",
        coinDecimals: 6,
        coinGeckoId: "axelar",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/axelar/images/axl.png",
        gasPriceStep: {
          low: 0.007,
          average: 0.007,
          high: 0.01,
        },
      },
    ],
    features: ["ibc-transfer", "ibc-go", "axelar-evm-bridge"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/axelar/images/axl.png",
  },
  {
    rpc: "https://rpc-sommelier.keplr.app",
    rest: "https://lcd-sommelier.keplr.app",
    chainId: "sommelier-3",
    chainName: "Sommelier",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "SOMM",
      coinMinimalDenom: "usomm",
      coinDecimals: 6,
      coinGeckoId: "sommelier",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/sommelier/images/somm.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/sommelier"
        : "http://localhost:8080/chains/sommelier",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/sommelier"
        : "http://localhost:8080/chains/sommelier",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("somm"),
    currencies: [
      {
        coinDenom: "SOMM",
        coinMinimalDenom: "usomm",
        coinDecimals: 6,
        coinGeckoId: "sommelier",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/sommelier/images/somm.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "SOMM",
        coinMinimalDenom: "usomm",
        coinDecimals: 6,
        coinGeckoId: "sommelier",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/sommelier/images/somm.png",
      },
    ],
    features: ["ibc-transfer", "ibc-go"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/sommelier/images/somm.png",
  },
  {
    rpc: "https://rpc-umee.keplr.app",
    rest: "https://lcd-umee.keplr.app",
    chainId: "umee-1",
    chainName: "Umee",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "UMEE",
      coinMinimalDenom: "uumee",
      coinDecimals: 6,
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/umee/images/umee.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/umee"
        : "http://localhost:8080/chains/umee",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/umee"
        : "http://localhost:8080/chains/umee",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("umee"),
    currencies: [
      {
        coinDenom: "UMEE",
        coinMinimalDenom: "uumee",
        coinDecimals: 6,
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/umee/images/umee.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "UMEE",
        coinMinimalDenom: "uumee",
        coinDecimals: 6,
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/umee/images/umee.png",
        gasPriceStep: {
          low: 0.05,
          average: 0.06,
          high: 0.1,
        },
      },
    ],
    features: ["ibc-transfer", "ibc-go"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/umee/images/umee.png",
  },
  {
    rpc: "https://rpc-gravity-bridge.keplr.app",
    rest: "https://lcd-gravity-bridge.keplr.app",
    chainId: "gravity-bridge-3",
    chainName: "Gravity Bridge",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "GRAV",
      coinMinimalDenom: "ugraviton",
      coinDecimals: 6,
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/gravitybridge/images/grav.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/gravity-bridge"
        : "http://localhost:8080/chains/gravity-bridge",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/gravity-bridge"
        : "http://localhost:8080/chains/gravity-bridge",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("gravity"),
    currencies: [
      {
        coinDenom: "GRAV",
        coinMinimalDenom: "ugraviton",
        coinDecimals: 6,
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/gravitybridge/images/grav.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "GRAV",
        coinMinimalDenom: "ugraviton",
        coinDecimals: 6,
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/gravitybridge/images/grav.png",
      },
      {
        coinDenom: "USDC",
        coinMinimalDenom: "gravity0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.01 * 0.02,
          average: 0.025 * 0.02,
          high: 0.04 * 0.02,
        },
      },
      {
        coinDenom: "USDT",
        coinMinimalDenom: "gravity0xdAC17F958D2ee523a2206206994597C13D831ec7",
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.01 * 0.02,
          average: 0.025 * 0.02,
          high: 0.04 * 0.02,
        },
      },
    ],
    features: ["ibc-transfer", "ibc-go"],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/gravitybridge/images/grav.png",
  },
  {
    rpc: "https://rpc-tgrade.keplr.app",
    rest: "https://lcd-tgrade.keplr.app",
    chainId: "tgrade-mainnet-1",
    chainName: "Tgrade",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "TGD",
      coinMinimalDenom: "utgd",
      coinDecimals: 6,
      coinGeckoId: "tgrade",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/tgrade/images/tgrade-logo-gradient_h.png",
    },
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("tgrade"),
    currencies: [
      {
        coinDenom: "TGD",
        coinMinimalDenom: "utgd",
        coinDecimals: 6,
        coinGeckoId: "tgrade",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/tgrade/images/tgrade-logo-gradient_h.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "TGD",
        coinMinimalDenom: "utgd",
        coinDecimals: 6,
        coinGeckoId: "tgrade",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/tgrade/images/tgrade-logo-gradient_h.png",
        gasPriceStep: {
          low: 0.05,
          average: 0.05,
          high: 0.075,
        },
      },
    ],
    walletUrlForStaking:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/tgrade/images/tgrade-logo-gradient_h.png",
    features: ["cosmwasm", "ibc-transfer", "ibc-go", "wasmd_0.24+"],
  },
  {
    rpc: "https://rpc-stride.keplr.app",
    rest: "https://lcd-stride.keplr.app",
    chainId: "stride-1",
    chainName: "Stride",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "STRD",
      coinMinimalDenom: "ustrd",
      coinDecimals: 6,
      coinGeckoId: "stride",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/stride/images/strd.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/stride"
        : "http://localhost:8080/chains/stride",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/stride"
        : "http://localhost:8080/chains/stride",
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("stride"),
    currencies: [
      {
        coinDenom: "STRD",
        coinMinimalDenom: "ustrd",
        coinDecimals: 6,
        coinGeckoId: "stride",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/stride/images/strd.png",
      },
      {
        coinDenom: "stATOM",
        coinMinimalDenom: "stuatom",
        coinDecimals: 6,
      },
      {
        coinDenom: "stOSMO",
        coinMinimalDenom: "stuosmo",
        coinDecimals: 6,
      },
      {
        coinDenom: "stJUNO",
        coinMinimalDenom: "stujuno",
        coinDecimals: 6,
      },
      {
        coinDenom: "stSTARS",
        coinMinimalDenom: "stustars",
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "STRD",
        coinMinimalDenom: "ustrd",
        coinDecimals: 6,
        coinGeckoId: "stride",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/stride/images/strd.png",
        gasPriceStep: {
          low: 0,
          average: 0,
          high: 0.04,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/stride/images/strd.png",
    features: ["ibc-transfer", "ibc-go"],
  },
  {
    rpc: "https://rpc-evmos.keplr.app",
    rest: "https://lcd-evmos.keplr.app",
    chainId: "evmos_9001-2",
    chainName: "Evmos",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "EVMOS",
      coinMinimalDenom: "aevmos",
      coinDecimals: 18,
      coinGeckoId: "evmos",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/evmos/images/evmos.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/evmos"
        : "http://localhost:8080/chains/evmos",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/evmos"
        : "http://localhost:8080/chains/evmos",
    bip44: {
      coinType: 60,
    },
    bech32Config: Bech32Address.defaultBech32Config("evmos"),
    currencies: [
      {
        coinDenom: "EVMOS",
        coinMinimalDenom: "aevmos",
        coinDecimals: 18,
        coinGeckoId: "evmos",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/evmos/images/evmos.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "EVMOS",
        coinMinimalDenom: "aevmos",
        coinDecimals: 18,
        coinGeckoId: "evmos",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/evmos/images/evmos.png",
        gasPriceStep: {
          low: 25000000000,
          average: 25000000000,
          high: 40000000000,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/evmos/images/evmos.png",
    features: ["ibc-transfer", "ibc-go", "eth-address-gen", "eth-key-sign"],
  },
  {
    rpc: "https://rpc-injective.keplr.app",
    rest: "https://lcd-injective.keplr.app",
    chainId: "injective-1",
    chainName: "Injective",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "INJ",
      coinMinimalDenom: "inj",
      coinDecimals: 18,
      coinGeckoId: "injective-protocol",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/injective"
        : "http://localhost:8080/chains/injective",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/injective"
        : "http://localhost:8080/chains/injective",
    bip44: {
      coinType: 60,
    },
    bech32Config: Bech32Address.defaultBech32Config("inj"),
    currencies: [
      {
        coinDenom: "INJ",
        coinMinimalDenom: "inj",
        coinDecimals: 18,
        coinGeckoId: "injective-protocol",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "INJ",
        coinMinimalDenom: "inj",
        coinDecimals: 18,
        coinGeckoId: "injective-protocol",
        gasPriceStep: {
          low: 5000000000,
          average: 25000000000,
          high: 50000000000,
        },
      },
    ],
    features: ["ibc-transfer", "ibc-go", "eth-address-gen", "eth-key-sign"],
    chainSymbolImageUrl: require("./public/assets/svg/wireframe/Injective-logo 2.svg"),
  },
  {
    rpc: "https://rpc-kava.keplr.app",
    rest: "https://lcd-kava.keplr.app",
    chainId: "kava_2222-10",
    chainName: "Kava",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "KAVA",
      coinMinimalDenom: "ukava",
      coinDecimals: 6,
      coinGeckoId: "kava",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/kava/images/kava.png",
    },
    walletUrl:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/kava"
        : "http://localhost:8080/chains/kava",
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/kava"
        : "http://localhost:8080/chains/kava",
    bip44: { coinType: 459 },
    alternativeBIP44s: [{ coinType: 118 }],
    bech32Config: Bech32Address.defaultBech32Config("kava"),
    currencies: [
      {
        coinDenom: "KAVA",
        coinMinimalDenom: "ukava",
        coinDecimals: 6,
        coinGeckoId: "kava",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/kava/images/kava.png",
      },
      {
        coinDenom: "SWP",
        coinMinimalDenom: "swp",
        coinDecimals: 6,
        coinGeckoId: "kava-swap",
      },
      {
        coinDenom: "USDX",
        coinMinimalDenom: "usdx",
        coinDecimals: 6,
        coinGeckoId: "usdx",
      },
      {
        coinDenom: "HARD",
        coinMinimalDenom: "hard",
        coinDecimals: 6,
      },
      {
        coinDenom: "BNB",
        coinMinimalDenom: "bnb",
        coinDecimals: 8,
      },
      {
        coinDenom: "BTCB",
        coinMinimalDenom: "btcb",
        coinDecimals: 8,
      },
      {
        coinDenom: "BUSD",
        coinMinimalDenom: "busd",
        coinDecimals: 8,
      },
      {
        coinDenom: "XRPB",
        coinMinimalDenom: "xrpb",
        coinDecimals: 8,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "KAVA",
        coinMinimalDenom: "ukava",
        coinDecimals: 6,
        coinGeckoId: "kava",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/kava/images/kava.png",
        gasPriceStep: {
          low: 0.05,
          average: 0.1,
          high: 0.25,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/kava/images/kava.png",
  },
  {
    rpc: "https://rpc-quicksilver.keplr.app",
    rest: "https://lcd-quicksilver.keplr.app",
    chainId: "quicksilver-1",
    chainName: "Quicksilver",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "QCK",
      coinMinimalDenom: "uqck",
      coinDecimals: 6,
      coinGeckoId: "quicksilver",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/quicksilver/images/qck.png",
    },
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/quicksilver"
        : "http://localhost:8080/chains/quicksilver",
    bip44: {
      coinType: 118,
    },
    bech32Config: {
      bech32PrefixAccAddr: "quick",
      bech32PrefixAccPub: "quickpub",
      bech32PrefixValAddr: "quickvaloper",
      bech32PrefixValPub: "quickvaloperpub",
      bech32PrefixConsAddr: "quickvalcons",
      bech32PrefixConsPub: "quickvalconspub",
    },
    currencies: [
      {
        coinDenom: "QCK",
        coinMinimalDenom: "uqck",
        coinDecimals: 6,
        coinGeckoId: "quicksilver",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/quicksilver/images/qck.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "QCK",
        coinMinimalDenom: "uqck",
        coinDecimals: 6,
        coinGeckoId: "quicksilver",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/quicksilver/images/qck.png",
        gasPriceStep: {
          low: 0,
          average: 0.0001,
          high: 0.00025,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/quicksilver/images/qck.png",
    features: [],
  },
  {
    rpc: "https://rpc-phoenix.keplr.app",
    rest: "https://lcd-phoenix.keplr.app",
    chainId: "phoenix-1",
    chainName: "Terra",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "LUNA",
      coinMinimalDenom: "uluna",
      coinDecimals: 6,
      coinGeckoId: "terra-luna-2",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra2/images/luna.png",
    },
    walletUrlForStaking:
      process.env.NODE_ENV === "production"
        ? "https://wallet.keplr.app/chains/terra"
        : "http://localhost:8080/chains/terra",
    bip44: {
      coinType: 330,
    },
    bech32Config: {
      bech32PrefixAccAddr: "terra",
      bech32PrefixAccPub: "terrapub",
      bech32PrefixValAddr: "terravaloper",
      bech32PrefixValPub: "terravaloperpub",
      bech32PrefixConsAddr: "terravalcons",
      bech32PrefixConsPub: "terravalconspub",
    },
    currencies: [
      {
        coinDenom: "LUNA",
        coinMinimalDenom: "uluna",
        coinDecimals: 6,
        coinGeckoId: "terra-luna-2",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra2/images/luna.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "LUNA",
        coinMinimalDenom: "uluna",
        coinDecimals: 6,
        coinGeckoId: "terra-luna-2",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra2/images/luna.png",
        gasPriceStep: {
          low: 0.15,
          average: 0.25,
          high: 0.4,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra2/images/luna.png",
    features: [],
  },
  {
    rpc: "https://rpc-columbus.keplr.app",
    rest: "https://lcd-columbus.keplr.app",
    chainId: "columbus-5",
    chainName: "Terra Classic",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "LUNC",
      coinMinimalDenom: "uluna",
      coinDecimals: 6,
      coinGeckoId: "terra-luna",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra/images/luna.png",
    },
    bip44: {
      coinType: 330,
    },
    bech32Config: {
      bech32PrefixAccAddr: "terra",
      bech32PrefixAccPub: "terrapub",
      bech32PrefixValAddr: "terravaloper",
      bech32PrefixValPub: "terravaloperpub",
      bech32PrefixConsAddr: "terravalcons",
      bech32PrefixConsPub: "terravalconspub",
    },
    currencies: [
      {
        coinDenom: "LUNC",
        coinMinimalDenom: "uluna",
        coinDecimals: 6,
        coinGeckoId: "terra-luna",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra/images/luna.png",
      },
      {
        coinDenom: "USTC",
        coinMinimalDenom: "uusd",
        coinDecimals: 6,
        coinGeckoId: "terrausd",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "LUNC",
        coinMinimalDenom: "uluna",
        coinDecimals: 6,
        coinGeckoId: "terra-luna",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra/images/luna.png",
        gasPriceStep: {
          low: 28.325,
          average: 28.325,
          high: 28.325,
        },
      },
      {
        coinDenom: "USTC",
        coinMinimalDenom: "uusd",
        coinDecimals: 6,
        coinGeckoId: "terrausd",
        gasPriceStep: {
          low: 0.75,
          average: 0.75,
          high: 0.75,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/terra/images/luna.png",
    features: ["terra-classic-fee"],
  },
  {
    rpc: "https://rpc-quasar.keplr.app",
    rest: "https://lcd-quasar.keplr.app",
    chainId: "quasar-1",
    chainName: "Quasar",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "QSR",
      coinMinimalDenom: "uqsr",
      coinDecimals: 6,
      coinGeckoId: "quasar-2",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/quasar/images/quasar.png",
    },
    bip44: {
      coinType: 118,
    },
    bech32Config: {
      bech32PrefixAccAddr: "quasar",
      bech32PrefixAccPub: "quasarpub",
      bech32PrefixValAddr: "quasarvaloper",
      bech32PrefixValPub: "quasarvaloperpub",
      bech32PrefixConsAddr: "quasarvalcons",
      bech32PrefixConsPub: "quasarvalconspub",
    },
    currencies: [
      {
        coinDenom: "QSR",
        coinMinimalDenom: "uqsr",
        coinDecimals: 6,
        coinGeckoId: "quasar-2",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/quasar/images/quasar.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "OSMO",
        coinMinimalDenom:
          "ibc/0471F1C4E7AFD3F07702BEF6DC365268D64570F7C1FDC98EA6098DD6DE59817B",
        coinDecimals: 6,
        coinGeckoId: "quasar-2",
        gasPriceStep: {
          low: 0.01,
          average: 0.01,
          high: 0.02,
        },
      },
      {
        coinDenom: "ATOM",
        coinMinimalDenom:
          "ibc/FA0006F056DB6719B8C16C551FC392B62F5729978FC0B125AC9A432DBB2AA1A5",
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.01,
          average: 0.01,
          high: 0.02,
        },
      },
      {
        coinDenom: "USDC",
        coinMinimalDenom:
          "ibc/FA7775734CC73176B7425910DE001A1D2AD9B6D9E93129A5D0750EAD13E4E63A",
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.01,
          average: 0.01,
          high: 0.02,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/quasar/images/quasar.png",
    features: [],
  },
  {
    rpc: "https://rpc-noble.keplr.app",
    rest: "https://lcd-noble.keplr.app",
    chainId: "noble-1",
    chainName: "Noble",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "STAKE",
      coinMinimalDenom: "ustake",
      coinDecimals: 6,
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/noble/images/stake.png",
    },
    bip44: {
      coinType: 118,
    },
    bech32Config: {
      bech32PrefixAccAddr: "noble",
      bech32PrefixAccPub: "noblepub",
      bech32PrefixValAddr: "noblevaloper",
      bech32PrefixValPub: "noblevaloperpub",
      bech32PrefixConsAddr: "noblevalcons",
      bech32PrefixConsPub: "noblevalconspub",
    },
    currencies: [
      {
        coinDenom: "STAKE",
        coinMinimalDenom: "ustake",
        coinDecimals: 6,
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/noble/images/stake.png",
      },
      {
        coinDenom: "USDC",
        coinMinimalDenom: "uusdc",
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "USDC",
        coinMinimalDenom: "uusdc",
        coinDecimals: 6,
      },
      {
        coinDenom: "ATOM",
        coinMinimalDenom:
          "ibc/EF48E6B1A1A19F47ECAEA62F5670C37C0580E86A9E88498B7E393EB6F49F33C0",
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.001,
          average: 0.001,
          high: 0.001,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/noble/images/stake.png",
    features: [],
  },
  {
    rpc: "https://rpc-omniflixhub.keplr.app",
    rest: "https://lcd-omniflixhub.keplr.app",
    chainId: "omniflixhub-1",
    chainName: "OmniFlix",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "FLIX",
      coinMinimalDenom: "uflix",
      coinDecimals: 6,
      coinGeckoId: "omniflix-network",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/omniflixhub/images/flix.png",
    },
    bip44: {
      coinType: 118,
    },
    bech32Config: {
      bech32PrefixAccAddr: "omniflix",
      bech32PrefixAccPub: "omniflixpub",
      bech32PrefixValAddr: "omniflixvaloper",
      bech32PrefixValPub: "omniflixvaloperpub",
      bech32PrefixConsAddr: "omniflixvalcons",
      bech32PrefixConsPub: "omniflixvalconspub",
    },
    currencies: [
      {
        coinDenom: "FLIX",
        coinMinimalDenom: "uflix",
        coinDecimals: 6,
        coinGeckoId: "omniflix-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/omniflixhub/images/flix.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "FLIX",
        coinMinimalDenom: "uflix",
        coinDecimals: 6,
        coinGeckoId: "omniflix-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/omniflixhub/images/flix.png",
        gasPriceStep: {
          low: 0.001,
          average: 0.0025,
          high: 0.025,
        },
      },
    ],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/omniflixhub/images/flix.png",
    features: [],
  },
  {
    rpc: "https://rpc-kyve.keplr.app",
    rest: "https://lcd-kyve.keplr.app",
    chainId: "kyve-1",
    chainName: "KYVE",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "KYVE",
      coinMinimalDenom: "ukyve",
      coinDecimals: 6,
      coinGeckoId: "kyve-network",
      coinImageUrl:
        "https://raw.githubusercontent.com/cosmos/chain-registry/master/kyve/images/kyve.png",
    },
    bip44: {
      coinType: 118,
    },
    bech32Config: {
      bech32PrefixAccAddr: "kyve",
      bech32PrefixAccPub: "kyvepub",
      bech32PrefixValAddr: "kyvevaloper",
      bech32PrefixValPub: "kyvevaloperpub",
      bech32PrefixConsAddr: "kyvevalcons",
      bech32PrefixConsPub: "kyvevalconspub",
    },
    currencies: [
      {
        coinDenom: "KYVE",
        coinMinimalDenom: "ukyve",
        coinDecimals: 6,
        coinGeckoId: "kyve-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/kyve/images/kyve.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "KYVE",
        coinMinimalDenom: "ukyve",
        coinDecimals: 6,
        coinGeckoId: "kyve-network",
        coinImageUrl:
          "https://raw.githubusercontent.com/cosmos/chain-registry/master/kyve/images/kyve.png",
        gasPriceStep: {
          low: 0.02,
          average: 0.03,
          high: 0.06,
        },
      },
    ],
    features: [],
    chainSymbolImageUrl:
      "https://raw.githubusercontent.com/cosmos/chain-registry/master/kyve/images/kyve.png",
  },
  {
    rpc: "https://axelartest-rpc.quickapi.com:443",
    rest: "https://axelartest-lcd.quickapi.com:443",
    chainId: "axelar-testnet-lisbon-3",
    chainName: "Axelar Testnet",
    hideInUI: true,
    stakeCurrency: {
      coinDenom: "AXL",
      coinMinimalDenom: "uaxl",
      coinDecimals: 6,
      coinGeckoId: "axelar",
    },
    bech32Config: {
      bech32PrefixAccAddr: "axelar",
      bech32PrefixAccPub: "axelarpub",
      bech32PrefixValAddr: "axelarvaloper",
      bech32PrefixValPub: "axelarvaloperpub",
      bech32PrefixConsAddr: "axelarvalcons",
      bech32PrefixConsPub: "axelarvalconspub",
    },
    bip44: { coinType: 118 },
    type: "testnet",
    currencies: [
      {
        coinDenom: "AXL",
        coinMinimalDenom: "uaxl",
        coinDecimals: 6,
        coinGeckoId: "axelar",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "AXL",
        coinMinimalDenom: "uaxl",
        coinDecimals: 6,
        coinGeckoId: "axelar",
        gasPriceStep: { low: 0.05, average: 0.125, high: 0.2 },
      },
    ],
    features: ["stargate", "no-legacy-stdTx", "ibc-transfer"],
  },
  {
    rpc: "https://rpc-dorado.fetch.ai",
    rest: "https://rest-dorado.fetch.ai",
    chainId: "dorado-1",
    chainName: "Dorado",
    hideInUI: false,
    stakeCurrency: {
      coinDenom: "TESTFET",
      coinMinimalDenom: "atestfet",
      coinDecimals: 18,
      coinGeckoId: "fetch-ai",
    },
    bip44: {
      coinType: 118,
    },
    bech32Config: Bech32Address.defaultBech32Config("fetch"),
    type: "testnet",
    currencies: [
      {
        coinDenom: "TESTFET",
        coinMinimalDenom: "atestfet",
        coinDecimals: 18,
        coinGeckoId: "fetch-ai",
      },
      {
        coinDenom: "MOBX",
        coinMinimalDenom: "nanomobx",
        coinDecimals: 9,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "TESTFET",
        coinMinimalDenom: "atestfet",
        coinDecimals: 18,
        coinGeckoId: "fetch-ai",
        gasPriceStep: {
          low: 0,
          average: 5000000000,
          high: 6250000000,
        },
      },
    ],
    features: ["cosmwasm"],
    walletUrlForStaking: "https://browse-dorado.fetch.ai/validators",
    govUrl: "https://explore-dorado.fetch.ai/proposals/",
    chainSymbolImageUrl: require("./public/assets/svg/wireframe/dorado.svg"),
  },
  // {
  //   rpc: "https://rpc-eridanus-1.fetch.ai",
  //   rest: "https://rest-eridanus-1.fetch.ai",
  //   chainId: "eridanus-1",
  //   chainName: "Eridanus Testnet",
  //   hideInUI: true,
  //   stakeCurrency: {
  //     coinDenom: "TESTASI",
  //     coinMinimalDenom: "atestasi",
  //     coinDecimals: 18,
  //     coinGeckoId: "fetch-ai",
  //   },
  //   type: "testnet",
  //   bip44: {
  //     coinType: 118,
  //   },
  //   bech32Config: Bech32Address.defaultBech32Config("asi"),
  //   currencies: [
  //     {
  //       coinDenom: "TESTASI",
  //       coinMinimalDenom: "atestasi",
  //       coinDecimals: 18,
  //       coinGeckoId: "fetch-ai",
  //     },
  //     {
  //       coinDenom: "MOBX",
  //       coinMinimalDenom: "nanomobx",
  //       coinDecimals: 9,
  //     },
  //   ],
  //   feeCurrencies: [
  //     {
  //       coinDenom: "TESTASI",
  //       coinMinimalDenom: "atestasi",
  //       coinDecimals: 18,
  //       coinGeckoId: "fetch-ai",
  //       gasPriceStep: {
  //         low: 0,
  //         average: 5000000000,
  //         high: 6250000000,
  //       },
  //     },
  //   ],
  //   features: ["cosmwasm"],
  //   chainSymbolImageUrl: require("./public/assets/png/Black-white-circle.png"),
  //   walletUrlForStaking: "https://explore-eridanus-1.fetch.ai/validators",
  //   govUrl: "https://explore-eridanus-1.fetch.ai/proposals/",
  // },
  // Cardano Mainnet
  {
    rpc: "https://cardano-mainnet.blockfrost.io/api/v0", // Usually Cardano uses different RPCs, but for example
    rest: "https://cardano-mainnet.blockfrost.io/api/v0",
    restConfig: {
      headers: {
        'project_id': process.env.BLOCKFROST_PROJECT_ID_MAINNET || process.env.BLOCKFROST_API_KEY || ''
      }
    },
    chainId: "cardano-mainnet",
    chainName: "Cardano Mainnet",
    stakeCurrency: {
      coinDenom: "ADA",
      coinMinimalDenom: "lovelace",
      coinDecimals: 6,
      coinGeckoId: "cardano",
      coinImageUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png",
    },
    bip44: {
      coinType: 1815,
    },
    bech32Config: {
      bech32PrefixAccAddr: "addr",
      bech32PrefixAccPub: "addrpub",
      bech32PrefixValAddr: "stake",
      bech32PrefixValPub: "stakepub",
      bech32PrefixConsAddr: "",
      bech32PrefixConsPub: "",
    },
    currencies: [
      {
        coinDenom: "ADA",
        coinMinimalDenom: "lovelace",
        coinDecimals: 6,
        coinGeckoId: "cardano",
        coinImageUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "ADA",
        coinMinimalDenom: "lovelace",
        coinDecimals: 6,
        coinGeckoId: "cardano",
        coinImageUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png",
        gasPriceStep: {
          low: 0.000044,
          average: 0.0001,
          high: 0.0002,
        },
      },
    ],
    features: ["cardano"],
    chainSymbolImageUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png",
  },
  // Cardano Testnet (Sepolia/Preview)
  {
    rpc: "https://cardano-preview.blockfrost.io/api/v0",
    rest: "https://cardano-preview.blockfrost.io/api/v0",
    restConfig: {
      headers: {
        'project_id': process.env.BLOCKFROST_PROJECT_ID_PREVIEW || process.env.BLOCKFROST_API_KEY || ''
      }
    },
    chainId: "cardano-preview",
    chainName: "Cardano Testnet (Preview)",
    stakeCurrency: {
      coinDenom: "tADA",
      coinMinimalDenom: "lovelace",
      coinDecimals: 6,
      coinGeckoId: "cardano",
      coinImageUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png",
    },
    bip44: {
      coinType: 1815,
    },
    bech32Config: {
      bech32PrefixAccAddr: "addr_test",
      bech32PrefixAccPub: "addr_testpub",
      bech32PrefixValAddr: "stake_test",
      bech32PrefixValPub: "stake_testpub",
      bech32PrefixConsAddr: "",
      bech32PrefixConsPub: "",
    },
    currencies: [
      {
        coinDenom: "tADA",
        coinMinimalDenom: "lovelace",
        coinDecimals: 6,
        coinGeckoId: "cardano",
        coinImageUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png",
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "tADA",
        coinMinimalDenom: "lovelace",
        coinDecimals: 6,
        coinGeckoId: "cardano",
        coinImageUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png",
        gasPriceStep: {
          low: 0.000044,
          average: 0.0001,
          high: 0.0002,
        },
      },
    ],
    features: ["cardano"],
    chainSymbolImageUrl: "https://assets.coingecko.com/coins/images/975/thumb/cardano.png",
    type: "testnet",
  },
];

// The origins that are able to pass any permission that external webpages can have.
export const PrivilegedOrigins: string[] = [
  "https://wallet.keplr.app",
  "https://validator.keplr.app",
  "https://chains.keplr.app",
];

export const CommunityChainInfoRepo = {
  organizationName: "chainapsis",
  repoName: "keplr-chain-registry",
  branchName: "main",
};

export enum TXNTYPE {
  ibcTransfer = "ibcTransfer",
  send = "send",
  withdrawRewards = "withdrawRewards",
  delegate = "delegate",
  undelegate = "undelegate",
  redelegate = "redelegate",
  govVote = "govVote",
  nativeBridgeSend = "nativeBridgeSend",
  approval = "approval",
  createSecret20ViewingKey = "createSecret20ViewingKey",
}

if (process.env.NODE_ENV !== "production") {
  EmbedChainInfos.push(LOCAL_TEST_NETWORK_CONFIG, REMOTE_TEST_NETWORK_CONFIG);
}

export { EmbedChainInfos };
