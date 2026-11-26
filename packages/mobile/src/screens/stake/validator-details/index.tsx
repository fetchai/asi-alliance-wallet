import React, { FunctionComponent } from "react";
import { PageWithScrollView } from "components/page";
import { RouteProp, useRoute } from "@react-navigation/native";
import { ValidatorDetailsCard } from "./validator-details-card";
import { useStyle } from "styles/index";
import { DelegatedCard } from "./delegated-card";
import { observer } from "mobx-react-lite";
import { useStore } from "stores/index";
// import { UnbondingCard } from "./unbonding-card";
import { View, ViewStyle } from "react-native";
import { Dec } from "@keplr-wallet/unit";
import { Button } from "components/button";
import { useSmartNavigation } from "navigation/smart-navigation";
import { UnbondingCard } from "./unbonding-card";
import Toast from "react-native-toast-message";
import { txnTypeKey, txType } from "components/new/txn-status.tsx";

export const ValidatorDetailsScreen: FunctionComponent = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          validatorAddress: string;
          prevSelectedValidator?: string;
        }
      >,
      string
    >
  >();

  const smartNavigation = useSmartNavigation();

  const validatorAddress = route.params.validatorAddress;
  const validatorSelector = route.params.prevSelectedValidator;

  const {
    chainStore,
    queriesStore,
    accountStore,
    analyticsStore,
    activityStore,
  } = useStore();

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const staked = queries.cosmos.queryDelegations
    .getQueryBech32Address(account.bech32Address)
    .getDelegationTo(validatorAddress);

  const unbondings = queries.cosmos.queryUnbondingDelegations
    .getQueryBech32Address(account.bech32Address)
    .unbondingBalances.find(
      (unbonding) => unbonding.validatorAddress === validatorAddress
    );

  const style = useStyle();

  const isTxnInProgress = () => {
    return (
      activityStore.getPendingTxnTypes[txnTypeKey.undelegate] ||
      activityStore.getPendingTxnTypes[txnTypeKey.redelegate] ||
      activityStore.getPendingTxnTypes[txnTypeKey.delegate]
    );
  };

  const txnInProgressMessage = () => {
    if (activityStore.getPendingTxnTypes[txnTypeKey.undelegate]) {
      return txType[txnTypeKey.undelegate];
    } else if (activityStore.getPendingTxnTypes[txnTypeKey.redelegate]) {
      return txType[txnTypeKey.redelegate];
    } else if (activityStore.getPendingTxnTypes[txnTypeKey.delegate]) {
      return txType[txnTypeKey.delegate];
    }

    return "Transaction";
  };

  return (
    <PageWithScrollView
      backgroundMode="image"
      contentContainerStyle={style.get("flex-grow-1")}
      style={
        style.flatten([
          "padding-x-page",
          "padding-y-16",
          "overflow-scroll",
        ]) as ViewStyle
      }
    >
      <ValidatorDetailsCard
        // containerStyle={style.flatten(["margin-y-card-gap"]) as ViewStyle}
        validatorAddress={validatorAddress}
      />
      {staked.toDec().gt(new Dec(0)) ? (
        <React.Fragment>
          <DelegatedCard
            containerStyle={style.flatten(["margin-y-16"]) as ViewStyle}
            validatorAddress={validatorAddress}
          />
          <View
            style={style.flatten(["flex-row", "items-center"]) as ViewStyle}
          >
            <Button
              mode="outline"
              text="Redelegate"
              containerStyle={
                style.flatten([
                  "flex-1",
                  "border-radius-32",
                  "border-color-white@40%",
                ]) as ViewStyle
              }
              textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
              onPress={() => {
                analyticsStore.logEvent("redelegate_click", {
                  pageName: "Validator Details",
                });
                if (isTxnInProgress()) {
                  Toast.show({
                    type: "error",
                    text1: `${txnInProgressMessage()} in progress`,
                  });
                  return;
                }
                smartNavigation.navigateSmart("Redelegate", {
                  validatorAddress,
                });
              }}
            />
            <View style={style.flatten(["width-card-gap"]) as ViewStyle} />
            <Button
              containerStyle={
                style.flatten(["flex-1", "border-radius-32"]) as ViewStyle
              }
              textStyle={style.flatten(["body2"]) as ViewStyle}
              text="Stake more"
              onPress={() => {
                analyticsStore.logEvent("stake_more_click", {
                  pageName: "Validator Details",
                });
                if (isTxnInProgress()) {
                  Toast.show({
                    type: "error",
                    text1: `${txnInProgressMessage()} in progress`,
                  });
                  return;
                }
                smartNavigation.navigateSmart("Delegate", {
                  validatorAddress,
                });
              }}
            />
          </View>
        </React.Fragment>
      ) : (
        <React.Fragment>
          {unbondings ? (
            <UnbondingCard
              validatorAddress={validatorAddress}
              containerStyle={style.flatten(["margin-y-16"]) as ViewStyle}
            />
          ) : null}
          <View style={style.flatten(["flex-1"])} />
          {validatorSelector ? (
            <Button
              containerStyle={style.flatten(["border-radius-32"]) as ViewStyle}
              text="Choose this validator"
              textStyle={style.flatten(["body2"]) as ViewStyle}
              onPress={() => {
                analyticsStore.logEvent("choose_validator_click", {
                  pageName: "Validator Details",
                });
                smartNavigation.navigateSmart("Redelegate", {
                  validatorAddress: validatorSelector,
                  selectedValidatorAddress: validatorAddress,
                });
              }}
            />
          ) : (
            <Button
              containerStyle={style.flatten(["border-radius-32"]) as ViewStyle}
              text="Stake with this validator"
              textStyle={style.flatten(["body2"]) as ViewStyle}
              onPress={() => {
                analyticsStore.logEvent("stake_with_validator_click", {
                  pageName: "Validator Details",
                });
                if (isTxnInProgress()) {
                  Toast.show({
                    type: "error",
                    text1: `${txnInProgressMessage()} in progress`,
                  });
                  return;
                }
                smartNavigation.navigateSmart("Delegate", {
                  validatorAddress,
                });
              }}
            />
          )}
        </React.Fragment>
      )}
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
    </PageWithScrollView>
  );
});
