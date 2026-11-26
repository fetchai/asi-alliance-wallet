import React from "react";
import { Doughnut } from "react-chartjs-2";
import { separateNumericAndDenom } from "@utils/format";

import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { AppCurrency } from "@keplr-wallet/types";
import style from "../style.module.scss";

import { useStore } from "../../../stores";
import { EmptyStake } from "./empty-stake";
import { MyStakes } from "./my-stake/my-stakes";
import { observer } from "mobx-react-lite";
import { WalletStatus } from "@keplr-wallet/stores";
import { Skeleton } from "@components-v2/skeleton-loader";
import { useLanguage } from "../../../languages";

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
  const stakedSum = delegated.add(unbonding);
  const stakableBal = stakable.toString();
  const stakedBal = stakedSum.toString();
  const rewardsBal = stakableReward.toString();

  const { numericPart: stakableBalNumber, denomPart: stakableDenom } =
    separateNumericAndDenom(stakableBal);
  const { numericPart: stakedBalNumber, denomPart: stakedDenom } =
    separateNumericAndDenom(stakedBal);
  const { numericPart: rewardsBalNumber, denomPart: rewardDenom } =
    separateNumericAndDenom(rewardsBal);

  const stakableBalInUI = parseFloat(stakableBalNumber);
  const stakedBalInUI = parseFloat(stakedBalNumber);
  const rewardsBalInUI = parseFloat(rewardsBalNumber);

  const total = stakableBalInUI + stakedBalInUI + rewardsBalInUI;

  const stakablePercentage = total ? (stakableBalInUI / total) * 100 : 0;
  const stakedPercentage = total ? (stakedBalInUI / total) * 100 : 0;
  const rewardsPercentage = total ? (rewardsBalInUI / total) * 100 : 0;

  const stakableInFiatCurrency = priceStore
    .calculatePrice(stakable, fiatCurrency)
    ?.toString();
  const stakedInFiatCurrency = priceStore
    .calculatePrice(stakedSum, fiatCurrency)
    ?.toString();
  const rewardsInFiatCurrency = priceStore
    .calculatePrice(stakableReward, fiatCurrency)
    ?.toString();

  const isLoaded =
    accountInfo.walletStatus === WalletStatus.Loaded &&
    accountInfo.bech32Address &&
    !rewards.isFetching;

  const doughnutData = {
    labels: ["Balance", "Staked", "Rewards"],
    datasets: [
      {
        data: [stakableBalInUI, stakedBalInUI, rewardsBalInUI],
        backgroundColor: ["#CFC3FE", "#5F38FB", "#F9774B"],
        hoverBackgroundColor: ["#CFC3FE", "#5F38FB", "#F9774B"],
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
  return (
    <div className={style["dashboard"]}>
      {(!isLoaded ||
        parseFloat(stakableBalNumber) > 0 ||
        parseFloat(stakedBalNumber) > 0 ||
        parseFloat(rewardsBalNumber) > 0) && (
        <div className={style["stake-container"]}>
          <div className={style["legends"]}>
            <div className={style["legend"]}>
              <img
                src={
                  stakableInFiatCurrency !== undefined &&
                  stakableInFiatCurrency > "$0"
                    ? require("@assets/svg/wireframe/legend-light-purple-long.svg")
                    : require("@assets/svg/wireframe/legend-light-purple.svg")
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
                    {stakableBalInUI.toFixed(2)} {` ${stakableDenom} `}
                    <span className={style["label"]}>
                      ({stakablePercentage.toFixed(1)}%)
                    </span>
                  </div>
                ) : (
                  <Skeleton height="17.5px" />
                )}
                {isLoaded ? (
                  stakableInFiatCurrency !== undefined &&
                  stakableInFiatCurrency > "$0" ? (
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 400,
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
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
                    ? require("@assets/svg/wireframe/legend-purple-long.svg")
                    : require("@assets/svg/wireframe/legend-purple.svg")
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
                    {stakedBalInUI.toFixed(2)} {` ${stakedDenom} `}
                    <span className={style["label"]}>
                      ({stakedPercentage.toFixed(1)}
                      %)
                    </span>
                  </div>
                ) : (
                  <Skeleton height="17.5px" />
                )}
                {isLoaded ? (
                  stakedInFiatCurrency !== undefined &&
                  stakedInFiatCurrency > "$0" ? (
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 400,
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
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
                    ? require("@assets/svg/wireframe/legend-orange-long.svg")
                    : require("@assets/svg/wireframe/legend-orange.svg")
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
                    {rewardsBalInUI.toFixed(2)} {` ${rewardDenom} `}
                    <span className={style["label"]}>
                      ({rewardsPercentage.toFixed(1)}%)
                    </span>
                  </div>
                ) : (
                  <Skeleton height="17.5px" />
                )}
                {isLoaded ? (
                  rewardsInFiatCurrency !== undefined &&
                  rewardsInFiatCurrency > "$0" ? (
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 400,
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {rewardsInFiatCurrency}
                    </div>
                  ) : null
                ) : (
                  <Skeleton height="21px" />
                )}
              </div>
            </div>
          </div>
          <div className={style["doughnut-graph"]}>
            <Doughnut data={doughnutData} options={doughnutData.options} />
          </div>
        </div>
      )}
      {isLoaded &&
        (delegations && delegations.length > 0 ? (
          <MyStakes rewards={rewards} accountInfo={accountInfo} />
        ) : (
          <div
            style={{
              paddingTop: !(
                parseFloat(stakableBalNumber) > 0 ||
                parseFloat(stakedBalNumber) > 0 ||
                parseFloat(rewardsBalNumber) > 0
              )
                ? "85px"
                : 0,
            }}
          >
            <EmptyStake />
          </div>
        ))}
    </div>
  );
});
