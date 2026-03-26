import { setupStakingExtension, StakingExtension } from "@cosmjs/stargate";
import { CoinPretty, Int, Dec } from "@keplr-wallet/unit";
import { QueryDelegatorUnbondingDelegationsResponse } from "cosmjs-types/cosmos/staking/v1beta1/query";
import { computed, makeObservable } from "mobx";
import {
  camelToSnake,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";
import { UnbondingDelegation, UnbondingDelegations } from "./types";
import { QuerySharedContext } from "../../../common";
import { ChainGetter } from "../../../chain";

export class ObservableQueryUnbondingDelegationsInner extends ObservableQueryTendermint<UnbondingDelegations> {
  protected bech32Address: string;
  protected readonly chainGetter: ChainGetter;
  protected readonly chainId: string;

  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    bech32Address: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      sharedContext,
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
    if (!this.chainGetter.getChain(this.chainId).stakeCurrency) {
      return false;
    }
    /* If bech32 address is empty, it will always fail, so don't need to fetch it.
    also avoid fetching the endpoint for evm networks*/
    const chainInfo = this.chainGetter.getChain(this.chainId);
    return (
      this.bech32Address.length > 0 &&
      !chainInfo?.features?.includes("eth-key-sign")
    );
  }

  @computed
  get total(): CoinPretty {
    const chainInfo = this.chainGetter.getChain(this.chainId);

    if (!chainInfo?.stakeCurrency) {
      return new CoinPretty(chainInfo?.currencies[0], new Int(0)).ready(false);
    }

    if (
      !this.response ||
      !this.response.data ||
      !this.response.data.unbonding_responses
    ) {
      return new CoinPretty(chainInfo.stakeCurrency, new Int(0)).ready(false);
    }

    let totalBalance = new Int(0);
    for (const unbondingDelegation of this.response.data.unbonding_responses) {
      for (const entry of unbondingDelegation.entries) {
        const amount = new Int(entry.balance);
        if (amount.gt(new Int(0))) {
          totalBalance = totalBalance.add(amount);
        }
      }
    }

    return new CoinPretty(chainInfo.stakeCurrency, totalBalance);
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

    if (!stakeCurrency) {
      return [];
    }

    const result = [];
    for (const unbonding of unbondings) {
      const entries = [];
      for (const entry of unbonding.entries) {
        const balance = new CoinPretty(stakeCurrency, new Int(entry.balance));
        if (balance.toDec().gt(new Dec(0))) {
          entries.push({
            creationHeight: new Int(entry.creation_height),
            completionTime: entry.completion_time,
            balance,
          });
        }
      }

      if (entries.length > 0) {
        result.push({
          validatorAddress: unbonding.validator_address,
          entries,
        });
      }
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

    const res: UnbondingDelegation[] = [];

    for (const unbonding of this.response.data.unbonding_responses) {
      const u = {
        ...unbonding,
      };
      u.entries = u.entries.filter((entry) => {
        return new Int(entry.balance).gt(new Int(0));
      });
      res.push(u);
    }

    return res;
  }
}

export class ObservableQueryUnbondingDelegations extends ObservableQueryMap<UnbondingDelegations> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super((bech32Address: string) => {
      return new ObservableQueryUnbondingDelegationsInner(
        sharedContext,
        chainId,
        chainGetter,
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
