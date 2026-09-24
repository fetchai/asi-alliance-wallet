import { CoinPretty, Int } from "@keplr-wallet/unit";
import { computed, makeObservable } from "mobx";
import { QuerySharedContext } from "../../../../common";
import { ChainGetter } from "../../../../chain";
import { ObservableChainQuery } from "../../../chain-query";
import { EpochProvisions } from "../types";

export class ObservableQueryStrideEpochProvisions extends ObservableChainQuery<EpochProvisions> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super(kvStore, chainId, chainGetter, `/mint/v1beta1/epoch_provisions`);

    makeObservable(this);
  }

  @computed
  get epochProvisions(): CoinPretty {
    const chainInfo = this.chainGetter.getChain(this.chainId);
    const stakeCurrency = chainInfo.stakeCurrency || chainInfo.currencies[0];
    if (!this.response) {
      return new CoinPretty(stakeCurrency, new Int(0));
    }

    let provision = this.response.data.epoch_provisions;
    if (provision.includes(".")) {
      provision = provision.slice(0, provision.indexOf("."));
    }
    return new CoinPretty(stakeCurrency, new Int(provision));
  }
}
