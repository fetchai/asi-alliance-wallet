import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";
import { KVStore } from "@keplr-wallet/common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { QueryDelegatorUnbondingDelegationsResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { computed, makeObservable } from "mobx";
import {
  camelToSnake,
  ChainGetter,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";
import { UnbondingDelegation, UnbondingDelegations } from "./types";

export class ObservableQueryUnbondingDelegationsInner extends ObservableQueryTendermint<UnbondingDelegations> {
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
        const decodedResponse =
          QueryDelegatorUnbondingDelegationsResponse.toJSON(result);
        return camelToSnake(decodedResponse) as UnbondingDelegations;
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
      !this.response.data.unbonding_responses
    ) {
      return new CoinPretty(stakeCurrency, new Int(0)).ready(false);
    }

    let totalBalance = new Int(0);
    for (const unbondingDelegation of this.response.data.unbonding_responses) {
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
          creationHeight: new Int(entry.creation_height),
          completionTime: entry.completion_time,
          balance: new CoinPretty(stakeCurrency, new Int(entry.balance)),
        });
      }

      result.push({
        validatorAddress: unbonding.validator_address,
        entries,
      });
    }

    return result;
  }

  @computed
  get unbondings(): UnbondingDelegation[] {
    if (
      !this.response ||
      !this.response.data ||
      !this.response.data.unbonding_responses
    ) {
      return [];
    }

    return this.response.data.unbonding_responses;
  }
}

export class ObservableQueryUnbondingDelegations extends ObservableQueryMap<UnbondingDelegations> {
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
