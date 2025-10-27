import { CARDANO_SERVICES_URLS } from '../config/config';

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
      baseUrl: process.env['BLOCKFROST_URL_MAINNET'] || 'https://cardano-mainnet.blockfrost.io/api/v0',
      projectId: process.env['BLOCKFROST_PROJECT_ID_MAINNET'] || process.env['BLOCKFROST_API_KEY'] || ''
    },
    preview: {
      baseUrl: process.env['BLOCKFROST_URL_PREVIEW'] || 'https://cardano-preview.blockfrost.io/api/v0',
      projectId: process.env['BLOCKFROST_PROJECT_ID_PREVIEW'] || process.env['BLOCKFROST_API_KEY'] || ''
    },
    preprod: {
      baseUrl: process.env['BLOCKFROST_URL_PREPROD'] || 'https://cardano-preprod.blockfrost.io/api/v0',
      projectId: process.env['BLOCKFROST_PROJECT_ID_PREPROD'] || 'preprodyDpsILnzsmce0lq4S8NWmkEcLsgRsP3O'
    },
    sanchonet: {
      baseUrl: process.env['BLOCKFROST_URL_SANCHONET'] || 'https://cardano-sanchonet.blockfrost.io/api/v0',
      projectId: process.env['BLOCKFROST_PROJECT_ID_SANCHONET'] || process.env['BLOCKFROST_API_KEY'] || ''
    }
  };
}

export function getCardanoServicesConfigs(): CardanoServicesConfigs {
  return {
    mainnet: {
      baseUrl: process.env['CARDANO_SERVICES_URL_MAINNET'] || CARDANO_SERVICES_URLS.mainnet
    },
    preview: {
      baseUrl: process.env['CARDANO_SERVICES_URL_PREVIEW'] || CARDANO_SERVICES_URLS.preview
    },
    preprod: {
      baseUrl: process.env['CARDANO_SERVICES_URL_PREPROD'] || CARDANO_SERVICES_URLS.preprod
    },
    sanchonet: {
      baseUrl: process.env['CARDANO_SERVICES_URL_SANCHONET'] || CARDANO_SERVICES_URLS.sanchonet
    }
  };
}

export function getApiKeyForNetwork(network: 'mainnet' | 'testnet'): string | null {
  const configs = getBlockfrostConfigs();
  
  if (network === 'mainnet') {
    return configs.mainnet.projectId || null;
  } else {
    // Try preview first, then preprod, then fallback
    return configs.preview.projectId || 
           configs.preprod.projectId || 
           configs.sanchonet.projectId || 
           null;
  }
}

export function isValidApiKey(key: string | null | undefined): boolean {
  return !!(key && key !== '' && key !== '<API_KEY>' && key !== 'undefined');
}

export function getNetworkConfig(network: 'mainnet' | 'testnet'): BlockfrostConfig | null {
  const configs = getBlockfrostConfigs();
  
  if (network === 'mainnet') {
    return isValidApiKey(configs.mainnet.projectId) ? configs.mainnet : null;
  } else {
    // Try preview first, then preprod, then sanchonet
    if (isValidApiKey(configs.preview.projectId)) {
      return configs.preview;
    }
    if (isValidApiKey(configs.preprod.projectId)) {
      return configs.preprod;
    }
    if (isValidApiKey(configs.sanchonet.projectId)) {
      return configs.sanchonet;
    }
    return null;
  }
}

export function getCardanoServicesConfig(network: 'mainnet' | 'testnet'): CardanoServicesConfig | null {
  const configs = getCardanoServicesConfigs();
  
  if (network === 'mainnet') {
    return configs.mainnet;
  } else {
    return configs.preview || configs.preprod || configs.sanchonet;
  }
}

export function logApiKeyStatus(network: 'mainnet' | 'testnet'): void {
  const config = getNetworkConfig(network);
  
  if (config && isValidApiKey(config.projectId)) {
    // Blockfrost API key found
  } else {
    console.warn(`Blockfrost API key not found for ${network} network - limited functionality`);
  }
}
