import { computed, makeObservable } from "mobx";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter, QueryResponse } from "../../common";
import { ObservableChainQuery } from "../chain-query";

/** Token registry metadata from Koios /asset_info. */
export interface KoiosTokenRegistryMetadata {
  name?: string;
  description?: string;
  ticker?: string;
  url?: string;
  logo?: string; // base64 png
  decimals?: number;
}

/** CIP-68 metadata from Koios /asset_info. */
export interface KoiosCip68Metadata {
  name?: string;
  image?: string;
  [key: string]: unknown;
}

/** Single asset info entry from Koios /asset_info response. */
export interface KoiosAssetInfoItem {
  policy_id: string;
  asset_name: string; // hex-encoded
  asset_name_ascii: string;
  fingerprint: string;
  minting_tx_hash: string;
  total_supply: string;
  mint_cnt: number;
  burn_cnt: number;
  creation_time: string;
  minting_tx_metadata?: Record<string, unknown> | null;
  token_registry_metadata?: KoiosTokenRegistryMetadata | null;
  cip68_metadata?: KoiosCip68Metadata | null;
}

/**
 * Fetches metadata for a batch of Cardano native assets via Koios /asset_info.
 * Keyed by a stable string derived from the requested asset list so we can cache.
 */
export class ObservableQueryCardanoAssetInfo extends ObservableChainQuery<
  KoiosAssetInfoItem[]
> {
  // asset list as [policyId, assetName] tuples
  private readonly assetList: Array<[string, string]>;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    assetList: Array<[string, string]>
  ) {
    super(kvStore, chainId, chainGetter, "/asset_info");
    this.assetList = assetList;
    makeObservable(this);
  }

  protected override canFetch(): boolean {
    return this.assetList.length > 0;
  }

  protected override getCacheKey(): string {
    const sorted = [...this.assetList].sort((a, b) =>
      (a[0] + a[1]).localeCompare(b[0] + b[1])
    );
    const key = sorted.map((a) => a[0] + a[1]).join(",");
    return `${super.getCacheKey()}/${key}`;
  }

  protected override async fetchResponse(
    abortController: AbortController
  ): Promise<{ response: QueryResponse<KoiosAssetInfoItem[]>; headers: any }> {
    const result = await this.instance.post<KoiosAssetInfoItem[]>(
      "/asset_info",
      { _asset_list: this.assetList },
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

  /** Map from assetId (policyId+assetName) to its metadata. */
  @computed
  get infoMap(): Map<string, KoiosAssetInfoItem> {
    const map = new Map<string, KoiosAssetInfoItem>();
    const items = this.response?.data;
    if (!items) return map;
    for (const item of items) {
      const assetId = item.policy_id + item.asset_name;
      map.set(assetId, item);
    }
    return map;
  }

  /** Check if a given asset is likely an NFT. */
  static isNft(info: KoiosAssetInfoItem): boolean {
    // total_supply === "1" is a strong NFT signal
    if (info.total_supply === "1") return true;

    // CIP-67 label 222 detection from assetName hex prefix
    // Label 222 encodes as "000de140" prefix in hex
    if (info.asset_name.startsWith("000de140")) return true;

    // Has CIP-68 metadata (NFT standard)
    if (info.cip68_metadata && typeof info.cip68_metadata === "object") {
      return true;
    }

    return false;
  }
}
