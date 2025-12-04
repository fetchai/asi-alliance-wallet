import { KVStore } from "@keplr-wallet/common";
import { ChainGetter, ObservableQueryTendermint } from "../../../common";
import { computed, makeObservable } from "mobx";
import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";
import { QueryParamsResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";

export class ObservableQueryStakingParams extends ObservableQueryTendermint<QueryParamsResponse> {
  constructor(kvStore: KVStore, chainId: string, chainGetter: ChainGetter) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as StakingExtension;
        const result = await client.staking.params();
        return result;
      },
      setupStakingExtension,
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
