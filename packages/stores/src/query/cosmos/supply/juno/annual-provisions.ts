import { ChainGetter, ObservableQueryTendermint } from "../../../../common";
import { AnnualProvisions } from "./types";
import { KVStore } from "@keplr-wallet/common";
import { computed, makeObservable } from "mobx";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { MintExtension, setupMintExtension } from "@cosmjs/stargate";

export class ObservableQueryJunoAnnualProvisions extends ObservableQueryTendermint<AnnualProvisions> {
  protected readonly chainId: string;
  protected readonly chainGetter: ChainGetter;

  constructor(kvStore: KVStore, chainId: string, chainGetter: ChainGetter) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as MintExtension;
        const response = await client.mint.annualProvisions();
        return { annual_provisions: response.toString() };
      },
      setupMintExtension,
      "/cosmos/mint/v1beta1/annual_provisions"
    );
    makeObservable(this);
    this.chainId = chainId;
    this.chainGetter = chainGetter;
  }

  @computed
  get annualProvisions(): CoinPretty | undefined {
    if (!this.response) {
      return;
    }

    const chainInfo = this.chainGetter.getChain(this.chainId);

    return new CoinPretty(
      chainInfo.stakeCurrency,
      new Dec(this.response.data.annual_provisions)
    );
  }

  @computed
  get annualProvisionsRaw(): Dec | undefined {
    if (!this.response) {
      return;
    }

    return new Dec(this.response.data.annual_provisions);
  }
}
