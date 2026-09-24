import { ObservableQueryTendermint } from "../../../common";
import { computed, makeObservable } from "mobx";
import { RatePretty, Dec } from "@keplr-wallet/unit";
import {
  DistributionExtension,
  setupDistributionExtension,
} from "@cosmjs/stargate";
import { QueryParamsResponse } from "cosmjs-types/cosmos/distribution/v1beta1/query";
import { QuerySharedContext } from "../../../common";
import { ChainGetter } from "../../../chain";

export class ObservableQueryDistributionParams extends ObservableQueryTendermint<QueryParamsResponse> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as DistributionExtension;
        const result = await client.distribution.params();
        const normalize = (val: string): string => {
          if (!val) return "0";
          return new Dec(val, 18).toString();
        };
        return {
          params: {
            communityTax: normalize(result.params.communityTax),
            baseProposerReward: normalize(result.params.baseProposerReward),
            bonusProposerReward: normalize(result.params.bonusProposerReward),
            withdrawAddrEnabled: result.params.withdrawAddrEnabled,
          },
        };
      },
      setupDistributionExtension,
      "/cosmos/distribution/v1beta1/params"
    );
    makeObservable(this);
  }

  @computed
  get communityTax(): RatePretty {
    if (!this.response) {
      return new RatePretty(0);
    }

    return new RatePretty(this.response.data.params.communityTax);
  }
}
