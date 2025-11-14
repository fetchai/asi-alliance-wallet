import { KVStore } from "@keplr-wallet/common";
import {
  ChainGetter,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";
import { QueryDelegatorDelegationsResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";

export class ObservableQueryDelegationsInner extends ObservableQueryTendermint<QueryDelegatorDelegationsResponse> {
  protected bech32Address: string;
  protected duplicatedFetchCheck: boolean = false;
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
        const result = await client.staking.delegatorDelegations(bech32Address);
        return result;
      },
      setupStakingExtension,
      `/cosmos/staking/v1beta1/delegations/${bech32Address}?pagination.limit=1000`
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
      !this.response.data.delegationResponses
    ) {
      return new CoinPretty(stakeCurrency, new Int(0)).ready(false);
    }

    let totalBalance = new Int(0);
    for (const delegation of this.response.data.delegationResponses) {
      totalBalance = totalBalance.add(new Int(delegation.balance.amount));
    }

    return new CoinPretty(stakeCurrency, totalBalance);
  }

  @computed
  get delegationBalances(): {
    validatorAddress: string;
    balance: CoinPretty;
  }[] {
    if (
      !this.response ||
      !this.response.data ||
      !this.response.data.delegationResponses
    ) {
      return [];
    }

    const stakeCurrency = this.chainGetter.getChain(this.chainId).stakeCurrency;

    const result = [];

    for (const delegation of this.response.data.delegationResponses) {
      result.push({
        validatorAddress: delegation.delegation.validatorAddress,
        balance: new CoinPretty(
          stakeCurrency,
          new Int(delegation.balance.amount)
        ),
      });
    }

    return result;
  }

  @computed
  get delegations(): QueryDelegatorDelegationsResponse["delegationResponses"] {
    if (
      !this.response ||
      !this.response.data ||
      !this.response.data.delegationResponses
    ) {
      return [];
    }

    return this.response.data.delegationResponses;
  }

  readonly getDelegationTo = computedFn(
    (validatorAddress: string): CoinPretty => {
      const delegations = this.delegations;

      const stakeCurrency = this.chainGetter.getChain(
        this.chainId
      ).stakeCurrency;

      if (!this.response || !this.response.data) {
        return new CoinPretty(stakeCurrency, new Int(0)).ready(false);
      }

      for (const delegation of delegations) {
        if (delegation.delegation.validatorAddress === validatorAddress) {
          return new CoinPretty(
            stakeCurrency,
            new Int(delegation.balance.amount)
          );
        }
      }

      return new CoinPretty(stakeCurrency, new Int(0));
    }
  );
}

export class ObservableQueryDelegations extends ObservableQueryMap<QueryDelegatorDelegationsResponse> {
  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((bech32Address: string) => {
      return new ObservableQueryDelegationsInner(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        bech32Address
      );
    });
  }

  getQueryBech32Address(
    bech32Address: string
  ): ObservableQueryDelegationsInner {
    return this.get(bech32Address) as ObservableQueryDelegationsInner;
  }
}
