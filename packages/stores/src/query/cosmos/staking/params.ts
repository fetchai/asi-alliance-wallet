import { ObservableQueryTendermint } from "../../../common";
import { computed, makeObservable } from "mobx";
import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";
import { QueryParamsResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { QuerySharedContext } from "../../../common";
import { ENDPOINT_BY_CHAIN_ID } from "./endpoint-by-chain-id";
import { ChainGetter } from "../../../chain";

export class ObservableQueryStakingParams extends ObservableQueryTendermint<QueryParamsResponse> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      sharedContext,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as StakingExtension;
        const result = await client.staking.params();
        return result;
      },
      setupStakingExtension,
      ENDPOINT_BY_CHAIN_ID[chainId]?.["params"] ??
        "/cosmos/staking/v1beta1/params"
    );
    makeObservable(this);
  }

  @computed
  get unbondingTimeSec(): number {
    if (!this.response) {
      return 0;
    }

    return parseInt(this.response.data.params.unbondingTime.seconds.toString());
  }

  get maxValidators(): number {
    return this.response?.data.params.maxValidators ?? 0;
  }

  get maxEntries(): number {
    return this.response?.data.params.maxEntries ?? 0;
  }

  get historicalEntries(): number {
    return this.response?.data.params.historicalEntries ?? 0;
  }

  get bondDenom(): string {
    return this.response?.data.params.bondDenom ?? "";
  }
}
