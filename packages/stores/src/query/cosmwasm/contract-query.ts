import { ChainGetter } from "../../chain";
import { QuerySharedContext } from "../../common";
import { QueryClient } from "@cosmjs/stargate";
// eslint-disable-next-line import/no-extraneous-dependencies
import { setupWasmExtension } from "@cosmjs/cosmwasm-stargate";
import { ObservableQueryTendermint } from "../../common";

export class ObservableCosmwasmContractChainQuery<
  T
> extends ObservableQueryTendermint<T> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    contractAddress: string,
    // eslint-disable-next-line @typescript-eslint/ban-types
    msg: object,
    cacheKey: string = ""
  ) {
    const rpc = chainGetter.getChain(chainId).rpc;
    const wasmQueryFn = async (client: QueryClient) => {
      const wasm = (client as any).wasm;

      if (!wasm?.queryContractSmart) {
        throw new Error("Wasm extension not available in QueryClient");
      }
      const result = await wasm.queryContractSmart(contractAddress, msg);
      return result as T;
    };

    super(sharedContext, rpc, wasmQueryFn, setupWasmExtension, cacheKey);
  }
}
