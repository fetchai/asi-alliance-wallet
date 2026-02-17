import React from "react";
import { Doughnut } from "react-chartjs-2";
import { isVestingExpired, separateNumericAndDenom } from "@utils/format";

import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { AppCurrency } from "@keplr-wallet/types";
import style from "../style.module.scss";

import { useStore } from "../../../stores";
import { EmptyStake } from "./empty-stake";
import { MyStakes } from "./my-stake/my-stakes";
import { observer } from "mobx-react-lite";
import { VestingType, WalletStatus } from "@keplr-wallet/stores";
import { Skeleton } from "@components-v2/skeleton-loader";
import { useLanguage } from "../../../languages";
import { clearDecimals } from "../../sign/decimals";
import { MyUnbondingValidators } from "./my-stake/my-unbonding-balances";

export const Dashboard = observer(() => {
  const { chainStore, accountStore, queriesStore, priceStore } = useStore();

  const current = chainStore.current;
  const queries = queriesStore.get(current.chainId);
  const accountInfo = accountStore.getAccount(current.chainId);
  const balanceQuery = queries.queryBalances.getQueryBech32Address(
    accountInfo.bech32Address
  );
  const balanceStakableQuery = balanceQuery.stakable;
  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;

  const queryDelegations =
    queries.cosmos.queryDelegations.getQueryBech32Address(
      accountInfo.bech32Address
    );
  const delegations = queryDelegations.delegations;

  const isNoble =
    ChainIdHelper.parse(chainStore.current.chainId).identifier === "noble";
  const hasUSDC = chainStore.current.currencies.find(
    (currency: AppCurrency) => currency.coinMinimalDenom === "uusdc"
  );

  const stakable = (() => {
    if (isNoble && hasUSDC) {
      return balanceQuery.getBalanceFromCurrency(hasUSDC);
    }

    return balanceStakableQuery.balance;
  })();

  const delegated = queries.cosmos.queryDelegations
    .getQueryBech32Address(accountInfo.bech32Address)
    .total.upperCase(true);

  const unbonding = queries.cosmos.queryUnbondingDelegations
    .getQueryBech32Address(accountInfo.bech32Address)
    .total.upperCase(true);

  const rewards = queries.cosmos.queryRewards.getQueryBech32Address(
    accountInfo.bech32Address
  );

  const stakableReward = rewards.stakableReward;
  const stakedSum = delegated;
  const stakableBal = stakable.toString();
  const stakedBal = stakedSum.toString();
  const rewardsBal = stakableReward.toString();
  const unbondingBal = unbonding.toString();

  const { numericPart: stakableBalNumber, denomPart: stakableDenom } =
    separateNumericAndDenom(stakableBal);
  const { numericPart: stakedBalNumber, denomPart: stakedDenom } =
    separateNumericAndDenom(stakedBal);
  const { numericPart: rewardsBalNumber, denomPart: rewardDenom } =
    separateNumericAndDenom(rewardsBal);
  const { numericPart: unbondingBalNumber, denomPart: unbondingDenom } =
    separateNumericAndDenom(unbondingBal);

  const isVesting = queries.cosmos.queryAccount.getQueryBech32Address(
    accountInfo.bech32Address
  ).isVestingAccount;

  const vestingInfo = queries.cosmos.queryAccount.getQueryBech32Address(
    accountInfo.bech32Address
  ).vestingAccount;
  const latestBlockTime = queries.cosmos.queryRPCStatus.latestBlockTime;

  const vestingEndTimeStamp = Number(
    vestingInfo.base_vesting_account?.end_time
  );
  const vestingStartTimeStamp = Number(vestingInfo.start_time);

  const spendableBalances =
    queries.cosmos.querySpendableBalances.getQueryBech32Address(
      accountInfo.bech32Address
    );

  const { numericPart: spendableNumber, denomPart: spendableDenom } =
    separateNumericAndDenom(spendableBalances.balances.toString());

  function getVestingBalance(balance: number) {
    return clearDecimals((balance / 10 ** 18).toFixed(20).toString());
  }

  const vestingBalance = () => {
    if (vestingInfo["@type"] == VestingType.Continuous.toString()) {
      if (stakableBalNumber > spendableNumber) {
        return (Number(stakableBalNumber) - Number(spendableNumber)).toString();
      } else if (
        latestBlockTime &&
        vestingEndTimeStamp > latestBlockTime &&
        spendableNumber === stakableBalNumber
      ) {
        const ov = Number(
          vestingInfo.base_vesting_account?.original_vesting[0].amount
        );
        const vested =
          ov *
          ((latestBlockTime - vestingStartTimeStamp) /
            (vestingEndTimeStamp - vestingStartTimeStamp));
        return getVestingBalance(ov - vested);
      }

      return "0";
    }
    return vestingInfo.base_vesting_account
      ? getVestingBalance(
          Number(vestingInfo.base_vesting_account?.original_vesting[0].amount)
        )
      : "0";
  };

  const stakableBalInUI = parseFloat(stakableBalNumber);
  const stakedBalInUI = parseFloat(stakedBalNumber);
  const rewardsBalInUI = parseFloat(rewardsBalNumber);
  const unbondingBalInUI = parseFloat(unbondingBalNumber);
  const vestingBalInUI =
    isVesting && !isVestingExpired(vestingEndTimeStamp)
      ? parseFloat(vestingBalance().toString())
      : 0;

  const total = stakableBalInUI + stakedBalInUI + rewardsBalInUI;

  const stakablePercentage = total ? (spendableNumber / total) * 100 : 0;
  const stakedPercentage = total ? (stakedBalInUI / total) * 100 : 0;
  const rewardsPercentage = total ? (rewardsBalInUI / total) * 100 : 0;
  const unbondingPercentage = total ? (unbondingBalInUI / total) * 100 : 0;
  const vestingPercentage =
    isVesting && !isVestingExpired(vestingEndTimeStamp)
      ? (Number(vestingBalance()) / total) * 100
      : 0;

  const stakableInFiatCurrency = priceStore
    .calculatePrice(stakable, fiatCurrency)
    ?.toString();
  const stakedInFiatCurrency = priceStore
    .calculatePrice(stakedSum, fiatCurrency)
    ?.toString();
  const rewardsInFiatCurrency = priceStore
    .calculatePrice(stakableReward, fiatCurrency)
    ?.toString();
  const unbondingInFiatCurrency = priceStore
    .calculatePrice(unbonding, fiatCurrency)
    ?.toString();

  const isLoaded =
    accountInfo.walletStatus === WalletStatus.Loaded &&
    accountInfo.bech32Address &&
    !rewards.isFetching;

  const labels = ["Balance", "Staked", "Rewards", "Vesting"];
  const data = [spendableNumber, stakedBalInUI, rewardsBalInUI, vestingBalInUI];
  const backgroundColor = ["#B1FCAB", "#2DA6CF", "#3A5638", "#FAB29B"];

  // add unbonding if available
  if (unbondingBalInUI > 0) {
    labels.push("Unbonding");
    data.push(unbondingBalInUI);
    backgroundColor.push("#F4B400");
  }

  const doughnutData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor,
        hoverBackgroundColor: backgroundColor,
        borderColor: "transparent",
      },
    ],
    options: {
      legend: {
        display: false,
      },
      tooltips: {
        enabled: false,
      },
    },
  };

  const hasDelegations = delegations && delegations.length > 0;
  const hasUnbonding = parseFloat(unbondingBalNumber) > 0;
  const hasStakableOrRewards =
    parseFloat(stakableBalNumber) > 0 ||
    parseFloat(stakedBalNumber) > 0 ||
    parseFloat(rewardsBalNumber) > 0 ||
    parseFloat(unbondingBalNumber) > 0;

  return (
    <div className={style["dashboard"]}>
      {(!isLoaded || hasStakableOrRewards) && (
        <div className={style["stake-container"]}>
          <div className={style["legends"]}>
            <div className={style["legend"]}>
              <img
                src={
                  stakableInFiatCurrency !== undefined &&
                  stakableInFiatCurrency > "$0"
                    ? require("@assets/svg/wireframe/legend-light-green-long.svg")
                    : require("@assets/svg/wireframe/legend-light-green.svg")
                }
                alt=""
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                }}
              >
                <div className={style["label"]}>Available</div>
                {isLoaded ? (
                  <div className={style["value"]}>
                    {Number(stakableBalInUI.toFixed(2)).toLocaleString("en-US")}{" "}
                    {` ${stakableDenom} `}
                    <span className={style["label"]}>
                      ({stakablePercentage.toFixed(2)}%)
                    </span>
                  </div>
                ) : (
                  <Skeleton height="17.5px" />
                )}
                {isLoaded ? (
                  stakableInFiatCurrency !== undefined &&
                  stakableInFiatCurrency > "$0" ? (
                    <div className={style["amountInUSD"]}>
                      {stakableInFiatCurrency}
                    </div>
                  ) : null
                ) : (
                  <Skeleton height="21px" />
                )}
              </div>
            </div>
            <div className={style["legend"]}>
              <img
                src={
                  stakedInFiatCurrency !== undefined &&
                  stakedInFiatCurrency > "$0"
                    ? require("@assets/svg/wireframe/legend-sky-long.svg")
                    : require("@assets/svg/wireframe/legend-sky.svg")
                }
                alt=""
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                }}
              >
                <div className={style["label"]}>Staked</div>
                {isLoaded ? (
                  <div className={style["value"]}>
                    {Number(stakedBalInUI.toFixed(2)).toLocaleString("en-US")}{" "}
                    {` ${stakedDenom} `}
                    <span className={style["label"]}>
                      ({stakedPercentage.toFixed(2)}
                      %)
                    </span>
                  </div>
                ) : (
                  <Skeleton height="17.5px" />
                )}
                {isLoaded ? (
                  stakedInFiatCurrency !== undefined &&
                  stakedInFiatCurrency > "$0" ? (
                    <div className={style["amountInUSD"]}>
                      {stakedInFiatCurrency}
                    </div>
                  ) : null
                ) : (
                  <Skeleton height="21px" />
                )}
              </div>
            </div>
            <div className={style["legend"]}>
              <img
                src={
                  rewardsInFiatCurrency !== undefined &&
                  rewardsInFiatCurrency > "$0"
                    ? require("@assets/svg/wireframe/legend-dark-green-long.svg")
                    : require("@assets/svg/wireframe/legend-dark-green.svg")
                }
                alt=""
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                }}
              >
                <div className={style["label"]}>Staking rewards</div>
                {isLoaded ? (
                  <div className={style["value"]}>
                    {Number(rewardsBalInUI.toFixed(2)).toLocaleString("en-US")}{" "}
                    {` ${rewardDenom} `}
                    <span className={style["label"]}>
                      ({rewardsPercentage.toFixed(2)}%)
                    </span>
                  </div>
                ) : (
                  <Skeleton height="17.5px" />
                )}
                {isLoaded ? (
                  rewardsInFiatCurrency !== undefined &&
                  rewardsInFiatCurrency > "$0" ? (
                    <div className={style["amountInUSD"]}>
                      {rewardsInFiatCurrency}
                    </div>
                  ) : null
                ) : (
                  <Skeleton height="21px" />
                )}
              </div>
            </div>
            {isVesting && !isVestingExpired(vestingEndTimeStamp) && (
              <div className={style["legend"]}>
                <img
                  src={
                    rewardsInFiatCurrency !== undefined &&
                    rewardsInFiatCurrency > "$0"
                      ? require("@assets/svg/wireframe/legend-light-orange.svg")
                      : require("@assets/svg/wireframe/legend-light-orange.svg")
                  }
                  alt=""
                />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  <div className={style["label"]}>Vesting</div>
                  {isLoaded ? (
                    <div className={style["value"]}>
                      {Number(vestingBalance()).toFixed(2)}{" "}
                      {` ${spendableDenom} `}
                      <span className={style["label"]}>
                        ({vestingPercentage.toFixed(2)}%)
                      </span>
                    </div>
                  ) : (
                    <Skeleton height="17.5px" />
                  )}
                </div>
              </div>
            )}
            {unbondingBalInUI > 0 && (
              <div className={style["legend"]}>
                <img
                  src={
                    unbondingInFiatCurrency !== undefined &&
                    unbondingInFiatCurrency > "$0"
                      ? require("@assets/svg/wireframe/legend-yellow-long.svg")
                      : require("@assets/svg/wireframe/legend-yellow.svg")
                  }
                  alt=""
                />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  <div className={style["label"]}>Unbonding</div>
                  {isLoaded ? (
                    <div className={style["value"]}>
                      {Number(unbondingBalInUI.toFixed(2)).toLocaleString(
                        "en-US"
                      )}{" "}
                      {` ${unbondingDenom} `}
                      <span className={style["label"]}>
                        ({unbondingPercentage.toFixed(2)}%)
                      </span>
                    </div>
                  ) : (
                    <Skeleton height="17.5px" />
                  )}
                  {isLoaded ? (
                    unbondingInFiatCurrency !== undefined &&
                    unbondingInFiatCurrency > "$0" ? (
                      <div className={style["amountInUSD"]}>
                        {unbondingInFiatCurrency}
                      </div>
                    ) : null
                  ) : (
                    <Skeleton height="21px" />
                  )}
                </div>
              </div>
            )}
          </div>
          <div className={style["doughnut-graph"]}>
            <Doughnut data={doughnutData} options={doughnutData.options} />
          </div>
        </div>
      )}
      {isLoaded && (hasDelegations || hasUnbonding) ? (
        <React.Fragment>
          {delegations && delegations.length > 0 && (
            <MyStakes rewards={rewards} accountInfo={accountInfo} />
          )}
          {hasUnbonding && (
            <MyUnbondingValidators hasDelegations={hasDelegations} />
          )}
        </React.Fragment>
      ) : (
        <div
          style={{
            paddingTop: !hasStakableOrRewards ? "85px" : 0,
          }}
        >
          <EmptyStake />
        </div>
      )}
    </div>
  );
});
