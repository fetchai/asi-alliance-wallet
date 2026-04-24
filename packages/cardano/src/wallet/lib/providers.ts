/** Blockfrost providers for wallet operations. */

import { Logger } from "ts-log";
import {
  AssetProvider,
  ChainHistoryProvider,
  NetworkInfoProvider,
  Provider,
  RewardAccountInfoProvider,
  RewardsProvider,
  StakePoolProvider,
  TxSubmitProvider,
  UtxoProvider,
} from "@cardano-sdk/core";

import {
  BlockfrostClient,
  BlockfrostClientConfig,
  BlockfrostAssetProvider,
  BlockfrostChainHistoryProvider,
  BlockfrostNetworkInfoProvider,
  BlockfrostRewardAccountInfoProvider,
  BlockfrostRewardsProvider,
  BlockfrostTxSubmitProvider,
  BlockfrostUtxoProvider,
  BlockfrostDRepProvider,
  CreateHttpProviderConfig,
  RateLimiter,
  TxSubmitApiProvider,
} from "@cardano-sdk/cardano-services-client";
import Bottleneck from "bottleneck";
import { createPersistentCacheStorage } from "@cardano-sdk/web-extension";
import type { Storage } from "webextension-polyfill";
import { BlockfrostAddressDiscovery } from "../../adapters/blockfrost-address-discovery";
import { BlockfrostInputResolver } from "../../adapters/blockfrost-input-resolver";
import { initStakePoolService, type ChainName } from "./stake-pool-service";
import type { BlockfrostConfig } from "../../adapters/env-adapter";

export interface WalletProvidersDependencies {
  assetProvider: AssetProvider;
  networkInfoProvider: NetworkInfoProvider;
  txSubmitProvider: TxSubmitProvider;
  stakePoolProvider: StakePoolProvider;
  utxoProvider: UtxoProvider;
  chainHistoryProvider: ChainHistoryProvider;
  rewardAccountInfoProvider: RewardAccountInfoProvider;
  rewardsProvider: RewardsProvider;
  handleProvider?: any; // Optional for now
  addressDiscovery: any; // BlockfrostAddressDiscovery
  inputResolver?: any; // BlockfrostInputResolver
  drepProvider?: any; // Optional for now
}

interface ProvidersConfig {
  blockfrostConfig: BlockfrostConfig & { rateLimiter?: RateLimiter };
  logger: Logger;
  extensionLocalStorage?: Storage.LocalStorageArea;
  chainName?: ChainName;
}

const createTxSubmitProvider = (
  blockfrostClient: BlockfrostClient,
  httpProviderConfig: CreateHttpProviderConfig<Provider>,
  customSubmitTxUrl?: string
): TxSubmitProvider => {
  if (customSubmitTxUrl) {
    httpProviderConfig.logger.debug(
      `Using custom TxSubmit api URL ${customSubmitTxUrl}`
    );
    const url = new URL(customSubmitTxUrl);
    return new TxSubmitApiProvider(
      { baseUrl: url, path: url.pathname },
      { logger: httpProviderConfig.logger, adapter: httpProviderConfig.adapter }
    );
  }

  return new BlockfrostTxSubmitProvider(
    blockfrostClient,
    httpProviderConfig.logger
  );
};

enum CacheName {
  chainHistoryProvider = "chain-history-provider-cache",
  inputResolver = "input-resolver-cache",
  utxoProvider = "utxo-provider-cache",
}

// eslint-disable-next-line no-magic-numbers
const sizeOf1mb = 1024 * 1024;

const cacheAssignment: Record<CacheName, { count: number; size: number }> = {
  [CacheName.chainHistoryProvider]: {
    count: 5_180_160_021,
    // eslint-disable-next-line no-magic-numbers
    size: 30 * sizeOf1mb,
  },
  [CacheName.inputResolver]: {
    count: 65_529_512_340,
    // eslint-disable-next-line no-magic-numbers
    size: 30 * sizeOf1mb,
  },
  [CacheName.utxoProvider]: {
    count: 6_530_251_302,
    // eslint-disable-next-line no-magic-numbers
    size: 30 * sizeOf1mb,
  },
};

export const createBlockfrostProviders = ({
  blockfrostConfig,
  logger,
  extensionLocalStorage,
  chainName,
}: ProvidersConfig): WalletProvidersDependencies => {
  const rateLimiter: RateLimiter =
    blockfrostConfig.rateLimiter ||
    new Bottleneck({
      reservoir: 500,
      reservoirIncreaseAmount: 100,
      reservoirIncreaseInterval: 1000,
      reservoirIncreaseMaximum: 500,
    });

  const blockfrostClientConfig: BlockfrostClientConfig = {
    projectId: blockfrostConfig.projectId,
    baseUrl: blockfrostConfig.baseUrl,
  };

  const blockfrostClient = new BlockfrostClient(blockfrostClientConfig, {
    rateLimiter,
  });

  const httpProviderConfig: CreateHttpProviderConfig<Provider> = {
    baseUrl: blockfrostConfig.baseUrl,
    logger,
    adapter: undefined, // Will use default fetch adapter
  };

  const assetProvider = new BlockfrostAssetProvider(blockfrostClient, logger);
  const networkInfoProvider = new BlockfrostNetworkInfoProvider(
    blockfrostClient,
    logger
  );
  const rewardsProvider = new BlockfrostRewardsProvider(
    blockfrostClient,
    logger
  );

  const stakePoolProvider =
    extensionLocalStorage && chainName
      ? initStakePoolService({
          blockfrostClient,
          chainName,
          extensionLocalStorage,
          networkInfoProvider,
        })
      : ({
          queryStakePools: async () => {
            throw new Error(
              "Stake pool queries require extensionLocalStorage and chainName"
            );
          },
          stakePoolStats: async () => {
            throw new Error(
              "Stake pool stats require extensionLocalStorage and chainName"
            );
          },
          healthCheck: async () => ({ ok: false }),
        } as StakePoolProvider);

  const txSubmitProvider = createTxSubmitProvider(
    blockfrostClient,
    httpProviderConfig
  );

  const chainHistoryCache = extensionLocalStorage
    ? createPersistentCacheStorage({
        extensionLocalStorage,
        fallbackMaxCollectionItemsGuard:
          cacheAssignment[CacheName.chainHistoryProvider].count,
        resourceName: CacheName.chainHistoryProvider,
        quotaInBytes: cacheAssignment[CacheName.chainHistoryProvider].size,
      })
    : {
        get: async (_key: string) => undefined,
        set: async (_key: string, _value: any) => {},
        has: async (_key: string) => false,
        delete: async (_key: string) => {},
        clear: async () => {},
      };

  const chainHistoryProvider = new BlockfrostChainHistoryProvider({
    client: blockfrostClient,
    cache: chainHistoryCache as any,
    networkInfoProvider,
    logger,
  });

  const dRepProvider = new BlockfrostDRepProvider(blockfrostClient, logger);

  const rewardAccountInfoProvider = new BlockfrostRewardAccountInfoProvider({
    client: blockfrostClient,
    dRepProvider,
    logger,
    stakePoolProvider,
  });

  const addressDiscovery = new BlockfrostAddressDiscovery(
    blockfrostClient,
    logger
  );

  const inputResolverCache = extensionLocalStorage
    ? createPersistentCacheStorage({
        extensionLocalStorage,
        fallbackMaxCollectionItemsGuard:
          cacheAssignment[CacheName.inputResolver].count,
        resourceName: CacheName.inputResolver,
        quotaInBytes: cacheAssignment[CacheName.inputResolver].size,
      })
    : {
        get: async (_key: string) => undefined,
        set: async (_key: string, _value: any) => {},
        has: async (_key: string) => false,
        delete: async (_key: string) => {},
        clear: async () => {},
      };

  const inputResolver = new BlockfrostInputResolver({
    cache: inputResolverCache as any,
    client: blockfrostClient,
    logger,
  });

  const utxoCache = extensionLocalStorage
    ? createPersistentCacheStorage({
        extensionLocalStorage,
        fallbackMaxCollectionItemsGuard:
          cacheAssignment[CacheName.utxoProvider].count,
        resourceName: CacheName.utxoProvider,
        quotaInBytes: cacheAssignment[CacheName.utxoProvider].size,
      })
    : {
        get: async (_key: string) => undefined,
        set: async (_key: string, _value: any) => {},
        has: async (_key: string) => false,
        delete: async (_key: string) => {},
        clear: async () => {},
      };

  const utxoProvider = new BlockfrostUtxoProvider({
    cache: utxoCache as any,
    client: blockfrostClient,
    logger,
  });

  return {
    assetProvider,
    networkInfoProvider,
    txSubmitProvider,
    stakePoolProvider,
    utxoProvider,
    chainHistoryProvider,
    rewardAccountInfoProvider,
    rewardsProvider,
    addressDiscovery,
    inputResolver,
    drepProvider: dRepProvider,
  };
};
