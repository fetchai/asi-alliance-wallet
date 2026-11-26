import React, { FunctionComponent } from "react";
import { useStore } from "stores/index";
import { Text, ViewStyle, View } from "react-native";
import { useStyle } from "styles/index";
import { useIntl } from "react-intl";
import { ProgressBar } from "components/progress-bar";
import { BlurBackground } from "components/new/blur-background/blur-background";

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

  const intl = useIntl();

  return unbonding ? (
    <BlurBackground
      borderRadius={12}
      blurIntensity={16}
      containerStyle={
        [style.flatten(["padding-18"]), containerStyle] as ViewStyle
      }
    >
      <Text style={style.flatten(["subtitle2", "color-white"]) as ViewStyle}>
        My Unstaking
      </Text>
      <View style={style.flatten(["padding-bottom-8"]) as ViewStyle}>
        {unbonding.entries.map((entry, i) => {
          const remainingText = (() => {
            const current = new Date().getTime();

            const relativeEndTime =
              (new Date(entry.completionTime).getTime() - current) / 1000;
            const relativeEndTimeDays = Math.floor(
              relativeEndTime / (3600 * 24)
            );
            const relativeEndTimeHours = Math.ceil(relativeEndTime / 3600);

            if (relativeEndTimeDays) {
              return (
                intl
                  .formatRelativeTime(relativeEndTimeDays, "days", {
                    numeric: "always",
                  })
                  .replace("in ", "") + " left"
              );
            } else if (relativeEndTimeHours) {
              return (
                intl
                  .formatRelativeTime(relativeEndTimeHours, "hours", {
                    numeric: "always",
                  })
                  .replace("in ", "") + " left"
              );
            }

            return "";
          })();
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
                    style.flatten(["body3", "color-white@60%"]) as ViewStyle
                  }
                >
                  {entry.balance
                    .shrink(true)
                    .trim(true)
                    .maxDecimals(6)
                    .toString()}
                </Text>
                <View style={style.get("flex-1")} />
                <Text
                  style={style.flatten(["body3", "color-white"]) as ViewStyle}
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
