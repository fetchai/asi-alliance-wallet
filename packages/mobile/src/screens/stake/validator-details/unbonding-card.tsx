import React, { FunctionComponent } from "react";
import { useStore } from "stores/index";
import { Text, ViewStyle, View, StyleSheet } from "react-native";
import { useStyle } from "styles/index";
import { ProgressBar } from "components/progress-bar";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { formatBalance } from "utils/format/format";
import moment from "moment";

export const UnbondingCard: FunctionComponent<{
  containerStyle?: ViewStyle;
  validatorAddress: string;
}> = ({ containerStyle, validatorAddress }) => {
  const { chainStore, accountStore, queriesStore } = useStore();

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const unbonding = queries.cosmos.queryUnbondingDelegations
    .getQueryBech32Address(account.bech32Address)
    .unbondingBalances.find(
      (unbonding) => unbonding.validatorAddress === validatorAddress
    );

  const style = useStyle();

  return unbonding ? (
    <BlurBackground
      borderRadius={12}
      backgroundBlur={false}
      containerStyle={
        StyleSheet.flatten([
          style.flatten(["padding-18", "background-color-gray-5"]),
          containerStyle ?? {},
        ]) as ViewStyle
      }
    >
      <Text style={style.flatten(["subtitle2", "color-dark"]) as ViewStyle}>
        My Unstaking
      </Text>
      <View style={style.flatten(["padding-bottom-8"]) as ViewStyle}>
        {unbonding.entries.map((entry, i) => {
          const remainingText = moment(entry.completionTime).isAfter()
            ? `${moment(entry.completionTime).fromNow(true)} left`
            : "";
          const progress = (() => {
            const currentTime = new Date().getTime();
            const endTime = new Date(entry.completionTime).getTime();
            const remainingTime = Math.floor((endTime - currentTime) / 1000);
            const unbondingTime = queries.cosmos.queryStakingParams.response
              ? queries.cosmos.queryStakingParams.unbondingTimeSec
              : 3600 * 24 * 21;

            return Math.max(
              0,
              Math.min(100 - (remainingTime / unbondingTime) * 100, 100)
            );
          })();

          return (
            <View
              key={i.toString()}
              style={style.flatten(["padding-top-16"]) as ViewStyle}
            >
              <View
                style={
                  style.flatten([
                    "flex-row",
                    "items-center",
                    "margin-bottom-18",
                  ]) as ViewStyle
                }
              >
                <Text
                  style={
                    style.flatten(["body3", "color-gray-300"]) as ViewStyle
                  }
                >
                  {formatBalance(entry.balance)}
                </Text>
                <View style={style.get("flex-1")} />
                <Text
                  style={style.flatten(["body3", "color-dark"]) as ViewStyle}
                >
                  {remainingText}
                </Text>
              </View>
              <View>
                <ProgressBar progress={progress} />
              </View>
            </View>
          );
        })}
      </View>
    </BlurBackground>
  ) : null;
};
