import {
  DistributionExtension,
  setupDistributionExtension,
} from "@cosmjs/stargate";
import { KVStore } from "@keplr-wallet/common";
import { Currency } from "@keplr-wallet/types";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";
import {
  camelToSnake,
  ChainGetter,
  ObservableQueryMap,
  ObservableQueryTendermint,
  StoreUtils,
} from "../../../common";
import { QueryDelegationTotalRewardsResponse } from "cosmjs-types/cosmos/distribution/v1beta1/query";
import { Rewards } from "./types";

export class ObservableQueryRewardsInner extends ObservableQueryTendermint<Rewards> {
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
        const client = queryClient as unknown as DistributionExtension;
        const result = await client.distribution.delegationTotalRewards(
          bech32Address
        );
        const decodedResponse =
          QueryDelegationTotalRewardsResponse.toJSON(result);
        const converted = {
          rewards: decodedResponse?.rewards?.map((r) => ({
            ...r,
            reward: r.reward?.map((coin) => ({
              ...coin,
              amount: new Dec(
                coin.amount,
                chainInfo?.currencies?.[0]?.coinDecimals
              ).toString(),
            })),
          })),
          total: result?.total?.map((coin) => ({
            ...coin,
            amount: new Dec(
              coin.amount,
              chainInfo?.currencies?.[0]?.coinDecimals
            ).toString(),
          })),
        };
        return camelToSnake(converted) as Rewards;
      },
      setupDistributionExtension,
      `/cosmos/distribution/v1beta1/delegators/${bech32Address}/rewards`
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
  get rewards(): CoinPretty[] {
    const chainInfo = this.chainGetter.getChain(this.chainId);

    const currenciesMap = chainInfo.currencies.reduce<{
      [denom: string]: Currency;
    }>((obj, currency) => {
      // TODO: Handle the contract tokens.
      if (!("type" in currency)) {
        obj[currency.coinMinimalDenom] = currency;
      }
      return obj;
    }, {});

    return StoreUtils.getBalancesFromCurrencies(
      currenciesMap,
      this.response?.data.total ?? []
    );
  }

  readonly getRewardsOf = computedFn(
    (validatorAddress: string): CoinPretty[] => {
      const chainInfo = this.chainGetter.getChain(this.chainId);

      const currenciesMap = chainInfo.currencies.reduce<{
        [denom: string]: Currency;
      }>((obj, currency) => {
        // TODO: Handle the contract tokens.
        if (!("type" in currency)) {
          obj[currency.coinMinimalDenom] = currency;
        }
        return obj;
      }, {});

      const reward = this.response?.data.rewards?.find((r) => {
        return r.validator_address === validatorAddress;
      });

      return StoreUtils.getBalancesFromCurrencies(
        currenciesMap,
        reward?.reward ?? []
      );
    }
  );

  @computed
  get stakableReward(): CoinPretty {
    const chainInfo = this.chainGetter.getChain(this.chainId);

    return StoreUtils.getBalanceFromCurrency(
      chainInfo.stakeCurrency,
      this.response?.data.total ?? []
    );
  }

  readonly getStakableRewardOf = computedFn(
    (validatorAddress: string): CoinPretty => {
      const chainInfo = this.chainGetter.getChain(this.chainId);

      const reward = this.response?.data.rewards?.find((r) => {
        return r.validator_address === validatorAddress;
      });

      return StoreUtils.getBalanceFromCurrency(
        chainInfo.stakeCurrency,
        reward?.reward ?? []
      );
    }
  );

  @computed
  get unstakableRewards(): CoinPretty[] {
    const chainInfo = this.chainGetter.getChain(this.chainId);

    const currenciesMap = chainInfo.currencies.reduce<{
      [denom: string]: Currency;
    }>((obj, currency) => {
      // TODO: Handle the contract tokens.
      if (
        !("type" in currency) &&
        currency.coinMinimalDenom !== chainInfo.stakeCurrency.coinMinimalDenom
      ) {
        obj[currency.coinMinimalDenom] = currency;
      }
      return obj;
    }, {});

    return StoreUtils.getBalancesFromCurrencies(
      currenciesMap,
      this.response?.data.total ?? []
    );
  }

  readonly getUnstakableRewardsOf = computedFn(
    (validatorAddress: string): CoinPretty[] => {
      const chainInfo = this.chainGetter.getChain(this.chainId);

      const currenciesMap = chainInfo.currencies.reduce<{
        [denom: string]: Currency;
      }>((obj, currency) => {
        // TODO: Handle the contract tokens.
        if (
          !("type" in currency) &&
          currency.coinMinimalDenom !== chainInfo.stakeCurrency.coinMinimalDenom
        ) {
          obj[currency.coinMinimalDenom] = currency;
        }
        return obj;
      }, {});

      const reward = this.response?.data.rewards?.find((r) => {
        return r.validator_address === validatorAddress;
      });

      return StoreUtils.getBalancesFromCurrencies(
        currenciesMap,
        reward?.reward ?? []
      );
    }
  );

  @computed
  get pendingRewardValidatorAddresses(): string[] {
    if (!this.response) {
      return [];
    }

    const result: string[] = [];

    for (const reward of this.response.data.rewards ?? []) {
      if (reward.reward) {
        for (const r of reward.reward) {
          const dec = new Dec(r.amount);
          if (dec.truncate().gt(new Int(0))) {
            result.push(reward.validator_address);
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * getDescendingPendingRewardValidatorAddresses returns the validator addresses in descending order by stakable asset.
   */
  // ComputeFn doesn't support the default argument.
  readonly getDescendingPendingRewardValidatorAddresses = computedFn(
    (maxValiadtors: number): string[] => {
      if (!this.response) {
        return [];
      }

      const chainInfo = this.chainGetter.getChain(this.chainId);

      const rewards = this.response.data.rewards?.slice() ?? [];
      rewards.sort((reward1, reward2) => {
        const amount1 = StoreUtils.getBalanceFromCurrency(
          chainInfo.stakeCurrency,
          reward1.reward ?? []
        );

        const amount2 = StoreUtils.getBalanceFromCurrency(
          chainInfo.stakeCurrency,
          reward2.reward ?? []
        );

        if (amount1.toDec().gt(amount2.toDec())) {
          return -1;
        } else {
          return 1;
        }
      });

      return rewards
        .filter((reward) => {
          if (reward.reward) {
            for (const r of reward.reward) {
              const dec = new Dec(r.amount);
              if (dec.truncate().gt(new Int(0))) {
                return true;
              }
            }
          }

          return false;
        })
        .slice(0, maxValiadtors)
        .map((r) => r.validator_address);
    }
  );
}

export class ObservableQueryRewards extends ObservableQueryMap<Rewards> {
  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((bech32Address: string) => {
      return new ObservableQueryRewardsInner(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        bech32Address
      );
    });
  }

  getQueryBech32Address(bech32Address: string): ObservableQueryRewardsInner {
    return this.get(bech32Address) as ObservableQueryRewardsInner;
  }
}
