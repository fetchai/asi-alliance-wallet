import {
  ObservableChainQuery,
  ObservableChainQueryMap,
} from "../../chain-query";
import { Delegation, Delegations } from "./types";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../../common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";

export class ObservableQueryDelegationsInner extends ObservableChainQuery<Delegations> {
  protected bech32Address: string;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    bech32Address: string
  ) {
    super(
      kvStore,
      chainId,
      chainGetter,
      `/cosmos/staking/v1beta1/delegations/${bech32Address}?pagination.limit=1000`
    );
    makeObservable(this);

    this.bech32Address = bech32Address;
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
      !this.response.data.delegation_responses
    ) {
      return new CoinPretty(stakeCurrency, new Int(0)).ready(false);
    }

    let totalBalance = new Int(0);
    for (const delegation of this.response.data.delegation_responses) {
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
      !this.response.data.delegation_responses
    ) {
      return [];
    }

    const stakeCurrency = this.chainGetter.getChain(this.chainId).stakeCurrency;

    const result = [];

    for (const delegation of this.response.data.delegation_responses) {
      result.push({
        validatorAddress: delegation.delegation.validator_address,
        balance: new CoinPretty(
          stakeCurrency,
          new Int(delegation.balance.amount)
        ),
      });
    }

    return result;
  }

  @computed
  get delegations(): Delegation[] {
    if (
      !this.response ||
      !this.response.data ||
      !this.response.data.delegation_responses
    ) {
      return [];
    }

    return this.response.data.delegation_responses;
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
        if (delegation.delegation.validator_address === validatorAddress) {
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

export class ObservableQueryDelegations extends ObservableChainQueryMap<Delegations> {
  constructor(
    protected override readonly kvStore: KVStore,
    protected override readonly chainId: string,
    protected override readonly chainGetter: ChainGetter
  ) {
    super(kvStore, chainId, chainGetter, (bech32Address: string) => {
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
