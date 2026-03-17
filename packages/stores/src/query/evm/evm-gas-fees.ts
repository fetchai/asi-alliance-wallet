import { computed, makeObservable } from "mobx";
import { ObservableJsonRPCQuery, QuerySharedContext } from "../../common";
import { ChainGetter } from "../../chain";
import { EtherscanGasFeeResponse } from "./types";
import { BigNumber } from "@ethersproject/bignumber";

export class ObservableQueryEvmGasPrice extends ObservableJsonRPCQuery<EtherscanGasFeeResponse> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super(kvStore, chainGetter.getChain(chainId).rpc, "", "eth_gasPrice", [], {
      fetchingInterval: 15000,
    });

    makeObservable(this);
  }

  @computed
  get gasPrice(): string | undefined {
    console.log(this.response);
    if (!this.response || !this.response.data || !this.response.data) {
      return undefined;
    }

    return BigNumber.from(this.response.data).toString();
  }
}
