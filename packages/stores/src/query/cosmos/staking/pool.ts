import { KVStore } from "@keplr-wallet/common";
import { ChainGetter, ObservableQueryTendermint } from "../../../common";
import { computed, makeObservable } from "mobx";
import { CoinPretty } from "@keplr-wallet/unit";
import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";
import { QueryPoolResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";

export class ObservableQueryStakingPool extends ObservableQueryTendermint<QueryPoolResponse> {
  protected readonly chainGetter: ChainGetter;
  protected readonly chainId: string;

  constructor(kvStore: KVStore, chainId: string, chainGetter: ChainGetter) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as StakingExtension;
        const result = await client.staking.pool();
        return result;
      },
      setupStakingExtension,
      "/cosmos/staking/v1beta1/pool"
    );
    makeObservable(this);
    this.chainId = chainId;
    this.chainGetter = chainGetter;
  }

  @computed
  get notBondedTokens(): CoinPretty {
    const chainInfo = this.chainGetter.getChain(this.chainId);

    if (!this.response) {
      return new CoinPretty(chainInfo.stakeCurrency, 0);
    }

    return new CoinPretty(
      chainInfo.stakeCurrency,
      this.response.data.pool.notBondedTokens
    );
  }

  @computed
  get bondedTokens(): CoinPretty {
    const chainInfo = this.chainGetter.getChain(this.chainId);

    if (!this.response) {
      return new CoinPretty(chainInfo.stakeCurrency, 0);
    }

    return new CoinPretty(
      chainInfo.stakeCurrency,
      this.response.data.pool.bondedTokens
    );
  }
}
