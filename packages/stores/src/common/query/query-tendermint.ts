/* eslint-disable import/no-extraneous-dependencies */
import { Comet38Client, CometClient } from "@cosmjs/tendermint-rpc";
import { QueryClient } from "@cosmjs/stargate";
import { KVStore } from "@keplr-wallet/common";
import { ObservableQuery, QueryResponse } from ".";

type TendermintExtension<P> = (base: QueryClient) => P;

export class ObservableQueryTendermint<T, E = unknown> extends ObservableQuery<
  T,
  E
> {
  constructor(
    kvStore: KVStore,
    protected readonly rpc: string,
    protected readonly queryFn: (client: QueryClient) => Promise<T>,
    protected readonly extension: TendermintExtension<Record<string, any>>, // extension passed dynamically
    protected readonly cachekey: string
  ) {
    super(kvStore, null as any, ""); // URL and instance are not used
  }

  protected override async fetchResponse(
    _abortController: AbortController
  ): Promise<{
    response: QueryResponse<T>;
    headers: any;
  }> {
    const tmClient = await Comet38Client.connect(this.rpc);

    // Combine dynamically supplied extensions
    const queryClient = QueryClient.withExtensions(
      tmClient as CometClient,
      this.extension
    );

    // Run the provided function that executes the actual query
    const result = await this.queryFn(queryClient);

    return {
      headers: {},
      response: {
        data: result,
        status: 200,
        staled: false,
        timestamp: Date.now(),
      },
    };
  }

  protected override getCacheKey(): string {
    return `tendermint-${this.rpc}-${this.cachekey}`;
  }
}
