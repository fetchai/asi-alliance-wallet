import { computed, makeObservable } from "mobx";
import { ObservableJsonRPCQuery, QuerySharedContext } from "../../common";
import { ChainGetter } from "../../chain";
import { BigNumber } from "@ethersproject/bignumber";

export class ObservableQueryLatestBlock extends ObservableJsonRPCQuery<string> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super(
      kvStore,
      chainGetter.getChain(chainId).rpc,
      "",
      "eth_blockNumber",
      []
    );

    makeObservable(this);
  }

  @computed
  get block(): string | undefined {
    if (!this.response || !this.response.data) {
      return undefined;
    }

    return BigNumber.from(this.response.data).toString();
  }
}
