/* eslint-disable import/no-extraneous-dependencies */
import { Comet38Client, CometClient } from "@cosmjs/tendermint-rpc";
import { QueryClient } from "@cosmjs/stargate";
import { ObservableQuery, QuerySharedContext } from ".";

type TendermintExtension<P> = (base: QueryClient) => P;

export class ObservableQueryTendermint<T, E = unknown> extends ObservableQuery<
  T,
  E
> {
  constructor(
    kvStore: QuerySharedContext,
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
    data: T;
    headers: any;
  }> {
    try {
      const tmClient = await Comet38Client.connect(this.rpc);

      // Combine dynamically supplied extensions
      const queryClient = QueryClient.withExtensions(
        tmClient as CometClient,
        this.extension
      );

      // Run the provided function that executes the actual query
      const result = await this.queryFn(queryClient);

      if (result == null) {
        throw new Error("Unknown Tendermint RPC result");
      }

      return {
        headers: {},
        data: result as T,
      };
    } catch (err: any) {
      throw new Error(err?.message || "Tendermint RPC error");
    }
  }

  protected override getCacheKey(): string {
    return `tendermint-${this.rpc}-${this.cachekey}`;
  }
}
