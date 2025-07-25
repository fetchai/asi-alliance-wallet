import React, { FunctionComponent } from "react";
import { Text, View, ViewStyle } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { useStyle } from "styles/index";
import { CardDivider } from "components/card";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { AppCurrency } from "@keplr-wallet/types";
import { useStore } from "stores/index";
import { isVestingExpired, separateNumericAndDenom } from "utils/format/format";
import { AnimatedNumber } from "components/new/animations/animated-number";
import Skeleton from "react-native-reanimated-skeleton";
import { VestingType } from "@keplr-wallet/stores";
import { clearDecimals } from "modals/sign/messages";

export const StakeCard: FunctionComponent = () => {
  const style = useStyle();

  const { chainStore, accountStore, queriesStore, priceStore } = useStore();
  const current = chainStore.current;
  const queries = queriesStore.get(current.chainId);
  const accountInfo = accountStore.getAccount(current.chainId);
  const balanceQuery = queries.queryBalances.getQueryBech32Address(
    accountInfo.bech32Address
  );
  const balanceStakableQuery = balanceQuery.stakable;

  const isVesting = queries.cosmos.queryAccount.getQueryBech32Address(
    accountInfo.bech32Address
  ).isVestingAccount;

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
  const stakableBal = stakable.shrink(true).trim(true).toString();
  const stakedBal = stakedSum.shrink(true).trim(true).toString();
  const rewardsBal = stakableReward.shrink(true).trim(true).toString();

  const { numericPart: stakableBalNumber, denomPart: stakableDenom } =
    separateNumericAndDenom(stakableBal);
  const { numericPart: stakedBalNumber, denomPart: stakedDenom } =
    separateNumericAndDenom(stakedBal);
  const { numericPart: rewardsBalNumber, denomPart: rewardDenom } =
    separateNumericAndDenom(rewardsBal);

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

  const { numericPart: spendableNumber, denomPart: _spendableDenom } =
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

  const total =
    parseFloat(stakableBalNumber) +
    parseFloat(stakedBalNumber) +
    parseFloat(rewardsBalNumber);

  let stakablePercentage = 0;
  let stakedPercentage = 0;
  let rewardsPercentage = 0;
  let vestingPercentage = 0;
  if (total > 0) {
    stakablePercentage =
      total >= spendableNumber
        ? (parseFloat(clearDecimals(spendableNumber)) / total) * 100
        : 100;
    stakedPercentage = (parseFloat(stakedBalNumber) / total) * 100;
    rewardsPercentage = (parseFloat(rewardsBalNumber) / total) * 100;
    vestingPercentage =
      isVesting && !isVestingExpired(vestingEndTimeStamp)
        ? (parseFloat(vestingBalance()) / total) * 100
        : 0;
  }
  const pieData = [
    {
      color: "#F9774B",
      value: rewardsPercentage,
      focused:
        Math.round(stakablePercentage) == 0 &&
        Math.round(rewardsPercentage) > 0,
    },

    {
      color: "#5F38FB",
      value: stakedPercentage,
      focused: Math.round(stakedPercentage) > 0,
    },
    {
      color: "#CFC3FE",
      value: stakablePercentage,
      focused:
        Math.round(rewardsPercentage) == 0 &&
        Math.round(stakedPercentage) == 0 &&
        Math.round(stakablePercentage) == 0 &&
        Math.round(stakablePercentage) > 0,
    },
    {
      color: "#9F88FD",
      value: vestingPercentage,
      focused:
        Math.round(stakedPercentage) == 0 &&
        Math.round(stakablePercentage) == 0 &&
        Math.round(vestingPercentage) > 0,
    },
  ];

  const renderLine = (color: string) => {
    return (
      <CardDivider
        vertical={true}
        style={
          [
            style.flatten(["width-4", "border-radius-4"]),
            { backgroundColor: color },
          ] as ViewStyle
        }
      />
    );
  };

  const legendComponentItem = [
    {
      title: "Available",
      lineColor: "#CFC3FE",
      balance: spendableNumber,
      denom: stakableDenom,
      percentageValue: stakablePercentage,
      dollarValue: stakable,
    },
    {
      title: "Staked",
      lineColor: "#5F38FB",
      balance: stakedBalNumber,
      denom: stakedDenom,
      percentageValue: stakedPercentage,
      dollarValue: stakedSum,
    },
    {
      title: "Staking rewards",
      lineColor: "#F9774B",
      balance: rewardsBalNumber,
      denom: rewardDenom,
      percentageValue: rewardsPercentage,
      dollarValue: stakableReward,
    },
    isVesting && !isVestingExpired(vestingEndTimeStamp)
      ? {
          title: "Vesting",
          lineColor: "#9F88FD",
          balance: vestingBalance(),
          denom: rewardDenom,
          percentageValue: vestingPercentage,
          dollarValue: spendableBalances.balances[0],
        }
      : null,
  ];

  const renderLegendComponent = () => {
    return (
      <View style={style.flatten(["flex-3"])}>
        {legendComponentItem.map((item, index) => {
          return (
            item != null && (
              <View
                key={index}
                style={style.flatten(["flex-row", "margin-y-10"]) as ViewStyle}
              >
                {renderLine(item.lineColor)}
                <View style={style.flatten(["padding-x-10"]) as ViewStyle}>
                  <Text
                    style={
                      style.flatten([
                        "color-white@60%",
                        "body3",
                        "margin-bottom-4",
                        "width-122",
                      ]) as ViewStyle
                    }
                  >
                    {item.title}
                  </Text>
                  <Skeleton
                    isLoading={!stakedSum.isReady}
                    layout={[
                      {
                        key: "balance",
                        width: "100%",
                        height: 18,
                        marginBottom: 2,
                      },
                      {
                        key: "usdBalance",
                        width: priceStore.calculatePrice(stakable)?.toString()
                          ? "100%"
                          : 0,
                        height: 15,
                      },
                    ]}
                    containerStyle={
                      style.flatten(["margin-left-2"]) as ViewStyle
                    }
                    boneColor={style.get("color-white@20%").color}
                    highlightColor={style.get("color-white@60%").color}
                  >
                    <View
                      style={
                        style.flatten(["flex-row", "flex-wrap"]) as ViewStyle
                      }
                    >
                      <AnimatedNumber
                        numberForAnimated={parseFloat(
                          parseFloat(item.balance).toFixed(2)
                        )}
                        includeComma={true}
                        decimalAmount={2}
                        fontSizeValue={16}
                        hookName={"withTiming"}
                        withTimingProps={{
                          durationValue: 1000,
                          easingValue: "linear",
                        }}
                      />
                      <Text
                        style={
                          [
                            style.flatten([
                              "color-white",
                              "subtitle2",
                              "padding-left-4",
                            ]),
                            { lineHeight: 16 },
                          ] as ViewStyle
                        }
                      >
                        {`${item.denom}`}
                      </Text>
                      <Text
                        style={
                          [
                            style.flatten(["color-white@60%", "subtitle2"]),
                            { lineHeight: 18 },
                          ] as ViewStyle
                        }
                      >
                        {`(${item.percentageValue.toFixed(2)}%)`}
                      </Text>
                    </View>
                    {priceStore.calculatePrice(item.dollarValue)?.toString() ? (
                      <Text
                        style={
                          style.flatten([
                            "color-white@60%",
                            "body3",
                          ]) as ViewStyle
                        }
                      >
                        {priceStore
                          .calculatePrice(item.dollarValue)
                          ?.toString()}
                      </Text>
                    ) : null}
                  </Skeleton>
                </View>
              </View>
            )
          );
        })}
      </View>
    );
  };

  return (
    <View style={style.flatten(["flex-row", "items-center"]) as ViewStyle}>
      {renderLegendComponent()}
      {total > 0 && (
        <View
          style={[style.flatten(["items-end"]), { flex: 2.3 }] as ViewStyle}
        >
          <PieChart
            data={pieData}
            donut
            sectionAutoFocus
            radius={62}
            innerRadius={38}
            innerCircleColor={"#232B5D"}
            focusOnPress={true}
          />
        </View>
      )}
    </View>
  );
};
