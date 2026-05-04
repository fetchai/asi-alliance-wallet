import { CARDANO_SERVICES_URLS } from "../config/config";
import type { CardanoNetwork } from "../utils/network";

export interface BlockfrostConfig {
  baseUrl: string;
  projectId: string;
}

export interface CardanoServicesConfig {
  baseUrl: string;
}

export interface NetworkConfigs {
  mainnet: BlockfrostConfig;
  preview: BlockfrostConfig;
  preprod: BlockfrostConfig;
  sanchonet: BlockfrostConfig;
}

export interface CardanoServicesConfigs {
  mainnet: CardanoServicesConfig;
  preview: CardanoServicesConfig;
  preprod: CardanoServicesConfig;
  sanchonet: CardanoServicesConfig;
}

export function getBlockfrostConfigs(): NetworkConfigs {
  return {
    mainnet: {
      baseUrl:
        process.env["BLOCKFROST_URL_MAINNET"] ||
        "https://cardano-mainnet.blockfrost.io/api/v0",
      projectId:
        process.env["BLOCKFROST_PROJECT_ID_MAINNET"] ||
        process.env["BLOCKFROST_API_KEY"] ||
        "",
    },
    preview: {
      baseUrl:
        process.env["BLOCKFROST_URL_PREVIEW"] ||
        "https://cardano-preview.blockfrost.io/api/v0",
      projectId:
        process.env["BLOCKFROST_PROJECT_ID_PREVIEW"] ||
        process.env["BLOCKFROST_API_KEY"] ||
        "",
    },
    preprod: {
      baseUrl:
        process.env["BLOCKFROST_URL_PREPROD"] ||
        "https://cardano-preprod.blockfrost.io/api/v0",
      projectId:
        process.env["BLOCKFROST_PROJECT_ID_PREPROD"] ||
        process.env["BLOCKFROST_API_KEY"] ||
        "",
    },
    sanchonet: {
      baseUrl:
        process.env["BLOCKFROST_URL_SANCHONET"] ||
        "https://cardano-sanchonet.blockfrost.io/api/v0",
      projectId:
        process.env["BLOCKFROST_PROJECT_ID_SANCHONET"] ||
        process.env["BLOCKFROST_API_KEY"] ||
        "",
    },
  };
}

export function getCardanoServicesConfigs(): CardanoServicesConfigs {
  return {
    mainnet: {
      baseUrl:
        process.env["CARDANO_SERVICES_URL_MAINNET"] ||
        CARDANO_SERVICES_URLS.mainnet,
    },
    preview: {
      baseUrl:
        process.env["CARDANO_SERVICES_URL_PREVIEW"] ||
        CARDANO_SERVICES_URLS.preview,
    },
    preprod: {
      baseUrl:
        process.env["CARDANO_SERVICES_URL_PREPROD"] ||
        CARDANO_SERVICES_URLS.preprod,
    },
    sanchonet: {
      baseUrl:
        process.env["CARDANO_SERVICES_URL_SANCHONET"] ||
        CARDANO_SERVICES_URLS.sanchonet,
    },
  };
}

export function getApiKeyForNetwork(network: CardanoNetwork): string | null {
  const configs = getBlockfrostConfigs();

  const config = configs[network];
  return config?.projectId || null;
}

export function isValidApiKey(key: string | null | undefined): boolean {
  return !!(key && key !== "" && key !== "<API_KEY>" && key !== "undefined");
}

export function getNetworkConfig(
  network: CardanoNetwork
): BlockfrostConfig | null {
  const configs = getBlockfrostConfigs();

  const config = configs[network];
  return config && isValidApiKey(config.projectId) ? config : null;
}

export function getCardanoServicesConfig(
  network: CardanoNetwork
): CardanoServicesConfig | null {
  const configs = getCardanoServicesConfigs();

  return configs[network] ?? null;
}

export function logApiKeyStatus(network: CardanoNetwork): void {
  const config = getNetworkConfig(network);

  if (config && isValidApiKey(config.projectId)) {
    // Blockfrost API key found
  } else {
    console.warn(
      `Blockfrost API key not found for ${network} network - limited functionality`
    );
  }
}

export function isCardanoStakingEnabled(): boolean {
  return process.env["CARDANO_STAKING_ENABLED"] === "true";
}
