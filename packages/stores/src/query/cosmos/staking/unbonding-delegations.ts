import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";
import { KVStore } from "@keplr-wallet/common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { QueryDelegatorUnbondingDelegationsResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { computed, makeObservable } from "mobx";
import {
  ChainGetter,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";

export class ObservableQueryUnbondingDelegationsInner extends ObservableQueryTendermint<QueryDelegatorUnbondingDelegationsResponse> {
  protected bech32Address: string;
  protected readonly chainGetter: ChainGetter;
  protected readonly chainId: string;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    bech32Address: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as StakingExtension;
        const result = await client.staking.delegatorUnbondingDelegations(
          bech32Address
        );
        return result;
      },
      setupStakingExtension,
      `/cosmos/staking/v1beta1/delegators/${bech32Address}/unbonding_delegations?pagination.limit=1000`
    );
    makeObservable(this);
    this.chainId = chainId;
    this.bech32Address = bech32Address;
    this.chainGetter = chainGetter;
  }

  protected override canFetch(): boolean {
    /* If bech32 address is empty, it will always fail, so don't need to fetch it.
    also avoid fetching the endpoint for evm networks*/
    const chainInfo = this.chainGetter.getChain(this.chainId);
    return (
      this.bech32Address.length > 0 && !chainInfo?.features?.includes("evm")
    );
  }

  @computed
  get total(): CoinPretty {
    const stakeCurrency = this.chainGetter.getChain(this.chainId).stakeCurrency;

    if (
      !this.response ||
      !this.response.data ||
      !this.response.data.unbondingResponses
    ) {
      return new CoinPretty(stakeCurrency, new Int(0)).ready(false);
    }

    let totalBalance = new Int(0);
    for (const unbondingDelegation of this.response.data.unbondingResponses) {
      for (const entry of unbondingDelegation.entries) {
        totalBalance = totalBalance.add(new Int(entry.balance));
      }
    }

    return new CoinPretty(stakeCurrency, totalBalance);
  }

  @computed
  get unbondingBalances(): {
    validatorAddress: string;
    entries: {
      creationHeight: Int;
      completionTime: string;
      balance: CoinPretty;
    }[];
  }[] {
    const unbondings = this.unbondings;

    const stakeCurrency = this.chainGetter.getChain(this.chainId).stakeCurrency;

    const result = [];
    for (const unbonding of unbondings) {
      const entries = [];
      for (const entry of unbonding.entries) {
        entries.push({
          creationHeight: new Int(entry.creationHeight),
          completionTime: entry.completionTime.seconds.toString(),
          balance: new CoinPretty(stakeCurrency, new Int(entry.balance)),
        });
      }

      result.push({
        validatorAddress: unbonding.validatorAddress,
        entries,
      });
    }

    return result;
  }

  @computed
  get unbondings(): QueryDelegatorUnbondingDelegationsResponse["unbondingResponses"] {
    if (
      !this.response ||
      !this.response.data ||
      !this.response.data.unbondingResponses
    ) {
      return [];
    }

    return this.response.data.unbondingResponses;
  }
}

export class ObservableQueryUnbondingDelegations extends ObservableQueryMap<QueryDelegatorUnbondingDelegationsResponse> {
  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((bech32Address: string) => {
      return new ObservableQueryUnbondingDelegationsInner(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        bech32Address
      );
    });
  }

  getQueryBech32Address(
    bech32Address: string
  ): ObservableQueryUnbondingDelegationsInner {
    return this.get(bech32Address) as ObservableQueryUnbondingDelegationsInner;
  }
}
