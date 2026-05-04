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
import { AddressType } from "@cardano-sdk/key-management";
import type { Storage } from "webextension-polyfill";
import { BlockfrostAddressDiscovery } from "../../adapters/blockfrost-address-discovery";
import { BlockfrostInputResolver } from "../../adapters/blockfrost-input-resolver";
import { initStakePoolService, type ChainName } from "./stake-pool-service";
import type { BlockfrostConfig } from "../../adapters/env-adapter";
import {
  createTelemetryTaggedClient,
  installBlockfrostRequestTelemetry,
} from "./blockfrost-request-telemetry";

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
  cardanoStakingEnabled?: boolean;
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
  cardanoStakingEnabled = false,
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
  installBlockfrostRequestTelemetry({
    blockfrostClient,
    chainName: chainName || "unknown",
    logger,
  });
  const assetClient = createTelemetryTaggedClient(
    blockfrostClient,
    "assetProvider"
  );
  const networkClient = createTelemetryTaggedClient(
    blockfrostClient,
    "networkInfoProvider"
  );
  const rewardsClient = createTelemetryTaggedClient(
    blockfrostClient,
    "rewardsProvider"
  );
  const stakePoolClient = createTelemetryTaggedClient(
    blockfrostClient,
    "stakePoolProvider"
  );
  const txSubmitClient = createTelemetryTaggedClient(
    blockfrostClient,
    "txSubmitProvider"
  );
  const chainHistoryClient = createTelemetryTaggedClient(
    blockfrostClient,
    "chainHistoryProvider"
  );
  const dRepClient = createTelemetryTaggedClient(
    blockfrostClient,
    "drepProvider"
  );
  const rewardAccountInfoClient = createTelemetryTaggedClient(
    blockfrostClient,
    "rewardAccountInfoProvider"
  );
  const addressDiscoveryClient = createTelemetryTaggedClient(
    blockfrostClient,
    "addressDiscovery"
  );
  const inputResolverClient = createTelemetryTaggedClient(
    blockfrostClient,
    "inputResolver"
  );
  const utxoClient = createTelemetryTaggedClient(
    blockfrostClient,
    "utxoProvider"
  );
  const createNoOpAsyncProvider = <T extends object>(
    base: object,
    label: string
  ): T =>
    new Proxy(base as T, {
      get(target: T, prop: string | symbol) {
        if (prop in target) return target[prop as keyof T];
        return async () => {
          logger.warn("[Cardano] no-op provider unknown method", {
            provider: label,
            method: String(prop),
          });
          if (process.env["NODE_ENV"] !== "production") {
            throw new Error(
              `[Cardano] no-op provider '${label}' called unknown method '${String(
                prop
              )}'`
            );
          }
          return null;
        };
      },
    });

  const httpProviderConfig: CreateHttpProviderConfig<Provider> = {
    baseUrl: blockfrostConfig.baseUrl,
    logger,
    adapter: undefined, // Will use default fetch adapter
  };

  const assetProvider = new BlockfrostAssetProvider(assetClient, logger);
  const networkInfoProvider = new BlockfrostNetworkInfoProvider(
    networkClient,
    logger
  );
  const rewardsProvider = cardanoStakingEnabled
    ? new BlockfrostRewardsProvider(rewardsClient, logger)
    : createNoOpAsyncProvider<RewardsProvider>(
        {
          healthCheck: async () => ({ ok: true }),
          rewardAccountBalance: async () => BigInt(0),
          rewardsHistory: async () => [],
        },
        "rewardsProvider"
      );

  const stakePoolProvider = cardanoStakingEnabled
    ? extensionLocalStorage && chainName
      ? initStakePoolService({
          blockfrostClient: stakePoolClient,
          chainName,
          extensionLocalStorage,
          networkInfoProvider,
        })
      : createNoOpAsyncProvider<StakePoolProvider>(
          {
            healthCheck: async () => ({ ok: true }),
            queryStakePools: async () => ({
              pageResults: [],
              totalResultCount: 0,
            }),
            stakePoolStats: async () => ({
              qty: { activating: 0, active: 0, retired: 0, retiring: 0 },
            }),
          },
          "stakePoolProvider"
        )
    : createNoOpAsyncProvider<StakePoolProvider>(
        {
          healthCheck: async () => ({ ok: true }),
          queryStakePools: async () => ({
            pageResults: [],
            totalResultCount: 0,
          }),
          stakePoolStats: async () => ({
            qty: { activating: 0, active: 0, retired: 0, retiring: 0 },
          }),
        },
        "stakePoolProvider"
      );

  const txSubmitProvider = createTxSubmitProvider(
    txSubmitClient,
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
    client: chainHistoryClient,
    cache: chainHistoryCache as any,
    networkInfoProvider,
    logger,
  });

  const dRepProvider = cardanoStakingEnabled
    ? new BlockfrostDRepProvider(dRepClient, logger)
    : createNoOpAsyncProvider<any>(
        {
          healthCheck: async () => ({ ok: true }),
        },
        "drepProvider"
      );

  const rewardAccountInfoProvider = cardanoStakingEnabled
    ? new BlockfrostRewardAccountInfoProvider({
        client: rewardAccountInfoClient,
        dRepProvider,
        logger,
        stakePoolProvider,
      })
    : createNoOpAsyncProvider<RewardAccountInfoProvider>(
        {
          healthCheck: async () => ({ ok: true }),
          rewardAccountInfo: async () => [],
        },
        "rewardAccountInfoProvider"
      );

  const addressDiscovery = cardanoStakingEnabled
    ? new BlockfrostAddressDiscovery(addressDiscoveryClient, logger)
    : {
        discover: async (addressManager: any) => {
          logger.debug(
            "[Cardano] minimal address discovery enabled (staking disabled)"
          );
          return [
            await addressManager.deriveAddress(
              { index: 0, type: AddressType.External },
              0
            ),
          ];
        },
      };

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
    client: inputResolverClient,
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
    client: utxoClient,
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
