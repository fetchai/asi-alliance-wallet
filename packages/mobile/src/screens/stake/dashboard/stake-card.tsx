import React, { FunctionComponent } from "react";
import { Text, View, ViewStyle } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { useStyle } from "styles/index";
import { CardDivider } from "components/card";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { AppCurrency } from "@keplr-wallet/types";
import { useStore } from "stores/index";
import { separateNumericAndDenom } from "utils/format/format";
import { AnimatedNumber } from "components/new/animations/animated-number";
import Skeleton from "react-native-reanimated-skeleton";

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

  const total =
    parseFloat(stakableBalNumber) +
    parseFloat(stakedBalNumber) +
    parseFloat(rewardsBalNumber);

  let stakablePercentage = 0;
  let stakedPercentage = 0;
  let rewardsPercentage = 0;
  if (total > 0) {
    stakablePercentage = (parseFloat(stakableBalNumber) / total) * 100;
    stakedPercentage = (parseFloat(stakedBalNumber) / total) * 100;
    rewardsPercentage = (parseFloat(rewardsBalNumber) / total) * 100;
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
        Math.round(stakablePercentage) > 0,
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

  const renderLegendComponent = () => {
    return (
      <View style={style.flatten(["flex-3"])}>
        <View style={style.flatten(["flex-row", "margin-y-10"]) as ViewStyle}>
          {renderLine("#CFC3FE")}
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
              Available
            </Text>
            <Skeleton
              isLoading={!stakedSum.isReady}
              layout={[
                {
                  key: "availableBalance",
                  width: "100%",
                  height: 18,
                  marginBottom: 2,
                },
                {
                  key: "availableUsdBalance",
                  width: priceStore.calculatePrice(stakable)?.toString()
                    ? "100%"
                    : 0,
                  height: 15,
                },
              ]}
              boneColor={style.get("color-white@20%").color}
              highlightColor={style.get("color-white@60%").color}
            >
              <View
                style={style.flatten(["flex-row", "flex-wrap"]) as ViewStyle}
              >
                <AnimatedNumber
                  numberForAnimated={parseFloat(
                    parseFloat(stakableBalNumber).toFixed(2)
                  )}
                  includeComma={true}
                  decimalAmount={2}
                  gap={0}
                  colorValue={"white"}
                  fontSizeValue={16}
                  fontWeight="500"
                  hookName={"withTiming"}
                  withTimingProps={{
                    durationValue: 1000,
                    easingValue: "linear",
                  }}
                  containerStyle={
                    style.flatten(["margin-right-4"]) as ViewStyle
                  }
                />
                <Text
                  style={
                    [
                      style.flatten([
                        "color-white",
                        "subtitle2",
                        "margin-right-4",
                      ]),
                      { lineHeight: 18 },
                    ] as ViewStyle
                  }
                >
                  {`${stakableDenom}`}
                </Text>
                <Text
                  style={
                    [
                      style.flatten(["color-white@60%", "subtitle2"]),
                      { lineHeight: 18 },
                    ] as ViewStyle
                  }
                >
                  {`(${stakablePercentage.toFixed(2)}%)`}
                </Text>
              </View>
              {priceStore.calculatePrice(stakable)?.toString() ? (
                <Text
                  style={
                    style.flatten(["color-white@60%", "body3"]) as ViewStyle
                  }
                >
                  {priceStore.calculatePrice(stakable)?.toString()}
                </Text>
              ) : null}
            </Skeleton>
          </View>
        </View>
        <View style={style.flatten(["flex-row", "margin-y-10"]) as ViewStyle}>
          {renderLine("#5F38FB")}
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
              Staked
            </Text>
            <Skeleton
              isLoading={!stakedSum.isReady}
              layout={[
                {
                  key: "stakedBalance",
                  width: "100%",
                  height: 18,
                  marginBottom: 2,
                },
                {
                  key: "stakedUsdBalance",
                  width: priceStore.calculatePrice(stakedSum)?.toString()
                    ? "100%"
                    : 0,
                  height: 15,
                },
              ]}
              boneColor={style.get("color-white@20%").color}
              highlightColor={style.get("color-white@60%").color}
            >
              <View
                style={style.flatten(["flex-row", "flex-wrap"]) as ViewStyle}
              >
                <AnimatedNumber
                  numberForAnimated={parseFloat(
                    parseFloat(stakedBalNumber).toFixed(2)
                  )}
                  includeComma={true}
                  decimalAmount={2}
                  gap={0}
                  colorValue={"white"}
                  fontSizeValue={16}
                  fontWeight="500"
                  hookName={"withTiming"}
                  withTimingProps={{
                    durationValue: 1000,
                    easingValue: "linear",
                  }}
                  containerStyle={
                    style.flatten(["margin-right-4"]) as ViewStyle
                  }
                />
                <Text
                  style={
                    [
                      style.flatten([
                        "color-white",
                        "subtitle2",
                        "margin-right-4",
                      ]),
                      { lineHeight: 18 },
                    ] as ViewStyle
                  }
                >
                  {`${stakedDenom}`}
                </Text>
                <Text
                  style={
                    [
                      style.flatten(["color-white@60%", "subtitle2"]),
                      { lineHeight: 18 },
                    ] as ViewStyle
                  }
                >
                  {`(${stakedPercentage.toFixed(2)}%)`}
                </Text>
              </View>

              {priceStore.calculatePrice(stakedSum)?.toString() ? (
                <Text
                  style={
                    style.flatten(["color-white@60%", "body3"]) as ViewStyle
                  }
                >
                  {priceStore.calculatePrice(stakedSum)?.toString()}
                </Text>
              ) : null}
            </Skeleton>
          </View>
        </View>
        <View style={style.flatten(["flex-row", "margin-y-10"]) as ViewStyle}>
          {renderLine("#F9774B")}
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
              Staking rewards
            </Text>
            <Skeleton
              isLoading={!stakedSum.isReady}
              layout={[
                {
                  key: "rewardBalance",
                  width: "100%",
                  height: 18,
                  marginBottom: 2,
                },
                {
                  key: "rewardUsdBalance",
                  width: priceStore.calculatePrice(stakedSum)?.toString()
                    ? "100%"
                    : 0,
                  height: 15,
                },
              ]}
              boneColor={style.get("color-white@20%").color}
              highlightColor={style.get("color-white@60%").color}
            >
              <View
                style={style.flatten(["flex-row", "flex-wrap"]) as ViewStyle}
              >
                <AnimatedNumber
                  numberForAnimated={parseFloat(
                    parseFloat(rewardsBalNumber).toFixed(2)
                  )}
                  includeComma={true}
                  decimalAmount={2}
                  gap={0}
                  colorValue={"white"}
                  fontSizeValue={16}
                  fontWeight="500"
                  hookName={"withTiming"}
                  withTimingProps={{
                    durationValue: 1000,
                    easingValue: "linear",
                  }}
                  containerStyle={
                    style.flatten(["margin-right-4"]) as ViewStyle
                  }
                />
                <Text
                  style={
                    [
                      style.flatten([
                        "color-white",
                        "subtitle2",
                        "margin-right-4",
                      ]),
                      { lineHeight: 18 },
                    ] as ViewStyle
                  }
                >
                  {`${rewardDenom}`}
                </Text>
                <Text
                  style={
                    [
                      style.flatten(["color-white@60%", "subtitle2"]),
                      { lineHeight: 18 },
                    ] as ViewStyle
                  }
                >
                  {`(${rewardsPercentage.toFixed(2)}%)`}
                </Text>
              </View>
              {priceStore.calculatePrice(stakableReward)?.toString() ? (
                <Text
                  style={
                    style.flatten(["color-white@60%", "body3"]) as ViewStyle
                  }
                >
                  {priceStore.calculatePrice(stakableReward)?.toString()}
                </Text>
              ) : null}
            </Skeleton>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={style.flatten(["flex-row", "items-center"]) as ViewStyle}>
      {renderLegendComponent()}
      <View style={[style.flatten(["items-end"]), { flex: 2.3 }] as ViewStyle}>
        {total > 0 && (
          <PieChart
            data={pieData}
            donut
            sectionAutoFocus
            radius={62}
            innerRadius={38}
            innerCircleColor={"#232B5D"}
            focusOnPress={true}
          />
        )}
      </View>
    </View>
  );
};
