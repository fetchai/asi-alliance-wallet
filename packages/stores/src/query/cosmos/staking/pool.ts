import { ObservableQueryTendermint } from "../../../common";
import { computed, makeObservable } from "mobx";
import { CoinPretty } from "@keplr-wallet/unit";
import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";
import { QueryPoolResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { QuerySharedContext } from "../../../common";
import { ChainGetter } from "../../../chain";

export class ObservableQueryStakingPool extends ObservableQueryTendermint<QueryPoolResponse> {
  protected readonly chainGetter: ChainGetter;
  protected readonly chainId: string;

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

    if (!this.response && chainInfo.stakeCurrency) {
      return new CoinPretty(chainInfo.stakeCurrency, 0);
    }

    return new CoinPretty(
      chainInfo.stakeCurrency || chainInfo.currencies[0],
      this?.response?.data.pool.notBondedTokens || "0"
    );
  }

  @computed
  get bondedTokens(): CoinPretty {
    const chainInfo = this.chainGetter.getChain(this.chainId);

    if (!this.response) {
      return new CoinPretty(
        chainInfo.stakeCurrency || chainInfo.currencies[0],
        0
      );
    }

    return new CoinPretty(
      chainInfo.stakeCurrency || chainInfo.currencies[0],
      this.response.data.pool.bondedTokens
    );
  }
}
