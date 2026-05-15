import { computed, makeObservable, override } from "mobx";
import { DenomHelper, KVStore } from "@keplr-wallet/common";
import { ChainGetter, QueryResponse } from "../../common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { ObservableQueryBalanceInner } from "../balances";
import { ObservableChainQuery } from "../chain-query";

/** Single asset entry from Koios /address_assets response (flat row per asset). */
export interface KoiosAddressAsset {
  address: string;
  policy_id: string;
  asset_name: string; // hex-encoded
  fingerprint: string;
  decimals: number;
  quantity: string;
}

/**
 * Fetches all native assets held by a Cardano address via Koios /address_assets.
 * Shared across all token balance queries for the same address.
 */
export class ObservableQueryCardanoTokenBalance extends ObservableChainQuery<
  KoiosAddressAsset[]
> {
  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly bech32Address: string
  ) {
    super(kvStore, chainId, chainGetter, "/address_assets");
    makeObservable(this);
  }

  protected override canFetch(): boolean {
    return !!(
      this.bech32Address &&
      this.bech32Address !== "" &&
      this.bech32Address !== "undefined" &&
      this.bech32Address.length > 0
    );
  }

  protected override getCacheKey(): string {
    return `${super.getCacheKey()}/${this.bech32Address}`;
  }

  protected override async fetchResponse(
    abortController: AbortController
  ): Promise<{ response: QueryResponse<KoiosAddressAsset[]>; headers: any }> {
    const result = await this.instance.post<KoiosAddressAsset[]>(
      "/address_assets",
      { _addresses: [this.bech32Address] },
      { signal: abortController.signal }
    );

    return {
      headers: result.headers,
      response: {
        data: result.data,
        status: result.status,
        staled: false,
        timestamp: Date.now(),
      },
    };
  }

  /** All assets held by the address (Koios returns flat array, one row per asset). */
  @computed
  get assets(): KoiosAddressAsset[] {
    const data = this.response?.data;
    if (!data || data.length === 0) return [];
    return data;
  }

  /** Map from assetId (policyId + assetName) to quantity string. */
  @computed
  get assetBalanceMap(): Map<
    string,
    {
      quantity: string;
      decimals: number;
      fingerprint: string;
      policyId: string;
      assetName: string;
    }
  > {
    const map = new Map<
      string,
      {
        quantity: string;
        decimals: number;
        fingerprint: string;
        policyId: string;
        assetName: string;
      }
    >();
    for (const asset of this.assets) {
      const assetId = asset.policy_id + asset.asset_name;
      map.set(assetId, {
        quantity: asset.quantity,
        decimals: asset.decimals ?? 0,
        fingerprint: asset.fingerprint,
        policyId: asset.policy_id,
        assetName: asset.asset_name,
      });
    }
    return map;
  }
}

/**
 * Balance inner for a specific Cardano native token identified by
 * denom format "cardanonative:{assetId}:{displayName}" (assetId = policyId + assetName hex).
 */
export class ObservableQueryCardanoTokenBalanceInner extends ObservableQueryBalanceInner {
  protected readonly queryTokenBalance: ObservableQueryCardanoTokenBalance;
  protected readonly assetId: string;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    denomHelper: DenomHelper,
    protected readonly address: string,
    queryTokenBalance: ObservableQueryCardanoTokenBalance,
    assetId: string
  ) {
    super(kvStore, chainId, chainGetter, "", denomHelper);
    makeObservable(this);
    this.queryTokenBalance = queryTokenBalance;
    this.assetId = assetId;
  }

  protected override canFetch(): boolean {
    return false; // fetching is delegated to queryTokenBalance
  }

  override get isFetching(): boolean {
    return this.queryTokenBalance.isFetching;
  }

  override get error() {
    return this.queryTokenBalance.error;
  }

  override get response() {
    return this.queryTokenBalance.response;
  }

  @override
  override *fetch() {
    yield this.queryTokenBalance.fetch();
  }

  @computed
  get balance(): CoinPretty {
    const denom = this.denomHelper.denom;
    const chainInfo = this.chainGetter.getChain(this.chainId);
    const currency = chainInfo.currencies.find(
      (cur: any) => cur.coinMinimalDenom === denom
    );

    if (!currency) {
      // Currency not yet registered; return zero not-ready
      const fallback = {
        coinDenom: this.assetId.slice(0, 8),
        coinMinimalDenom: denom,
        coinDecimals: 0,
      };
      return new CoinPretty(fallback, new Int(0)).ready(false);
    }

    const assetEntry = this.queryTokenBalance.assetBalanceMap.get(this.assetId);
    if (!assetEntry) {
      return new CoinPretty(currency, new Int(0));
    }

    const qty = assetEntry.quantity;
    if (!qty || qty === "0") {
      return new CoinPretty(currency, new Int(0));
    }

    const parsed = parseInt(qty, 10);
    if (isNaN(parsed) || parsed < 0) {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }

    return new CoinPretty(currency, new Int(parsed));
  }
}
