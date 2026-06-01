import { QueriesSetBase } from "../queries";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { ObservableQueryCardanoBalanceRegistry } from "./balance-registry";
import {
  ObservableQueryCardanoTokenBalanceRegistry,
  CARDANO_NATIVE_TOKEN_TYPE,
} from "./token-balance-registry";
import { ObservableQueryCardanoTokenBalance } from "./token-balance";
import { ObservableQueryCardanoAssetInfo } from "./asset-info";
import type { KoiosAssetInfoItem } from "./asset-info";
import { runInAction } from "mobx";
import type { ChainInfoInner } from "../../chain";

export interface CardanoQueries {
  cardano: CardanoQueriesImpl;
}

export class CardanoQueriesImpl {
  public readonly cardanoBalanceRegistry: ObservableQueryCardanoBalanceRegistry;
  public readonly cardanoTokenBalanceRegistry: ObservableQueryCardanoTokenBalanceRegistry;

  // Shared token balance queries per address (used by both discovery and balance registry)
  private tokenBalanceQueries: Map<string, ObservableQueryCardanoTokenBalance> =
    new Map();
  private assetInfoQueries: Map<string, ObservableQueryCardanoAssetInfo> =
    new Map();
  private registeredTokenDenoms: Set<string> = new Set();

  private readonly kvStore: KVStore;

  constructor(
    queriesSetBase: QueriesSetBase,
    kvStore: KVStore,
    private readonly chainId: string,
    private readonly chainGetter: ChainGetter
  ) {
    this.kvStore = kvStore;

    // ADA balance registry auto-triggers token discovery when an address is first accessed.
    // This mirrors lace behavior where the SDK wallet automatically discovers tokens from UTXOs.
    this.cardanoBalanceRegistry = new ObservableQueryCardanoBalanceRegistry(
      kvStore,
      (_chainId, address) => this.discoverTokensForAddress(address)
    );

    // Token balance registry shares query instances with discovery to avoid duplicate Koios calls.
    this.cardanoTokenBalanceRegistry =
      new ObservableQueryCardanoTokenBalanceRegistry(kvStore, (cId, address) =>
        this.getOrCreateTokenBalanceQuery(cId, address)
      );

    queriesSetBase.queryBalances.addBalanceRegistry(
      this.cardanoBalanceRegistry
    );
    queriesSetBase.queryBalances.addBalanceRegistry(
      this.cardanoTokenBalanceRegistry
    );
  }

  /**
   * Returns a shared ObservableQueryCardanoTokenBalance for a given address.
   * Reused by both token discovery and the balance registry.
   */
  private getOrCreateTokenBalanceQuery(
    chainId: string,
    address: string
  ): ObservableQueryCardanoTokenBalance {
    const key = `${chainId}/${address}`;
    let query = this.tokenBalanceQueries.get(key);
    if (!query) {
      query = new ObservableQueryCardanoTokenBalance(
        this.kvStore,
        chainId,
        this.chainGetter,
        address
      );
      this.tokenBalanceQueries.set(key, query);
    }
    return query;
  }

  /**
   * Triggers token discovery for a given address.
   * Fetches the token list from Koios, then fetches metadata, then registers
   * each discovered token as a currency so it appears in queryBalances.
   * Idempotent: subsequent calls for the same address are no-ops (the shared query is reused).
   * Runs asynchronously: tokens appear in the list after fetchAndRegisterTokens completes successfully.
   * On failure we log and do not register; UI is not blocked.
   */
  discoverTokensForAddress(address: string): void {
    const chainId = this.chainId;
    const key = `${chainId}/${address}`;
    // Use shared query; check if discovery was already started for this key
    if (this.tokenBalanceQueries.has(key)) return;

    const tokenBalanceQuery = this.getOrCreateTokenBalanceQuery(
      chainId,
      address
    );
    this.fetchAndRegisterTokens(tokenBalanceQuery, chainId);
  }

  /**
   * Forces re-discovery by re-fetching native token list for the given address.
   * This is needed for cases when new tokens arrive after the initial discovery.
   */
  refreshTokenBalancesForAddress(address: string): void {
    if (!address) return;

    const chainId = this.chainId;
    const tokenBalanceQuery = this.getOrCreateTokenBalanceQuery(
      chainId,
      address
    );
    this.fetchAndRegisterTokens(tokenBalanceQuery, chainId, {
      forceRefresh: true,
    });
  }

  /**
   * Fetches address assets and metadata, then registers new token currencies.
   * On error we log (and could plug in a central error reporter if available); no currencies are registered.
   */
  private async fetchAndRegisterTokens(
    tokenBalanceQuery: ObservableQueryCardanoTokenBalance,
    chainId: string,
    options?: { forceRefresh?: boolean }
  ): Promise<void> {
    try {
      const tokenResponse = options?.forceRefresh
        ? await tokenBalanceQuery.waitFreshResponse()
        : await tokenBalanceQuery.waitResponse();
      if (!tokenResponse?.data) return;

      const assets = tokenBalanceQuery.assets;
      if (!assets || assets.length === 0) return;

      const newAssetTuples: Array<[string, string]> = [];
      for (const asset of assets) {
        const assetId = asset.policy_id + asset.asset_name;
        const denom = `${CARDANO_NATIVE_TOKEN_TYPE}:${assetId}:${
          asset.asset_name || assetId
        }`;
        if (!this.registeredTokenDenoms.has(denom)) {
          newAssetTuples.push([asset.policy_id, asset.asset_name]);
        }
      }

      if (newAssetTuples.length === 0) return;

      const infoKey = newAssetTuples
        .map((t) => t[0] + t[1])
        .sort()
        .join(",");
      let infoQuery = this.assetInfoQueries.get(infoKey);
      if (!infoQuery) {
        infoQuery = new ObservableQueryCardanoAssetInfo(
          this.kvStore,
          chainId,
          this.chainGetter,
          newAssetTuples
        );
        this.assetInfoQueries.set(infoKey, infoQuery);
      }

      const infoResponse = await infoQuery.waitResponse();
      const infoMap = infoResponse?.data ? infoQuery.infoMap : new Map();

      runInAction(() => {
        this.registerTokenCurrencies(assets, infoMap);
      });
    } catch (error) {
      // Log only; could plug in central error reporting (e.g. Sentry) here if available
      console.warn("[CardanoQueries] Token discovery failed:", error);
    }
  }

  private registerTokenCurrencies(
    assets: Array<{
      policy_id: string;
      asset_name: string;
      fingerprint: string;
      decimals: number;
      quantity: string;
    }>,
    infoMap: Map<string, KoiosAssetInfoItem>
  ) {
    const chainInfo = this.chainGetter.getChain(this.chainId);
    const newCurrencies: Array<{
      coinDenom: string;
      coinMinimalDenom: string;
      coinDecimals: number;
      coinGeckoId?: string;
      coinImageUrl?: string;
      isNft?: boolean;
    }> = [];

    for (const asset of assets) {
      const assetId = asset.policy_id + asset.asset_name;
      const denom = `${CARDANO_NATIVE_TOKEN_TYPE}:${assetId}:${
        asset.asset_name || assetId
      }`;
      if (this.registeredTokenDenoms.has(denom)) continue;

      const info = infoMap.get(assetId);
      const isNft = info ? ObservableQueryCardanoAssetInfo.isNft(info) : false;

      const ticker = info?.token_registry_metadata?.ticker;
      const registryName = info?.token_registry_metadata?.name;
      const asciiName = info?.asset_name_ascii;
      const displayName =
        ticker ||
        registryName ||
        asciiName ||
        asset.fingerprint ||
        assetId.slice(0, 12);

      const decimals =
        info?.token_registry_metadata?.decimals ?? asset.decimals ?? 0;
      const logo = info?.token_registry_metadata?.logo;

      newCurrencies.push({
        coinDenom: displayName,
        coinMinimalDenom: denom,
        coinDecimals: decimals,
        coinImageUrl: logo ? `data:image/png;base64,${logo}` : undefined,
        isNft,
      });

      this.registeredTokenDenoms.add(denom);
    }

    if (newCurrencies.length > 0) {
      // getChain returns chain store inner (ChainInfoInner) which has addCurrencies
      const chainInfoInner = chainInfo as ChainInfoInner;
      if (chainInfoInner.addCurrencies) {
        chainInfoInner.addCurrencies(...newCurrencies);
      }
    }
  }
}

export const CardanoQueries = {
  use(): (
    queriesSetBase: QueriesSetBase,
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter
  ) => CardanoQueries {
    return (
      queriesSetBase: QueriesSetBase,
      kvStore: KVStore,
      chainId: string,
      chainGetter: ChainGetter
    ) => {
      return {
        cardano: new CardanoQueriesImpl(
          queriesSetBase,
          kvStore,
          chainId,
          chainGetter
        ),
      };
    };
  },
};
