import React, { FunctionComponent } from "react";
import { PageWithScrollView } from "components/page";
import { RouteProp, useRoute } from "@react-navigation/native";
import { ValidatorDetailsCard } from "./validator-details-card";
import { useStyle } from "styles/index";
import { DelegatedCard } from "./delegated-card";
import { observer } from "mobx-react-lite";
import { useStore } from "stores/index";
import { View, ViewStyle } from "react-native";
import { Dec } from "@keplr-wallet/unit";
import { Button } from "components/button";
import { useSmartNavigation } from "navigation/smart-navigation";
import { UnbondingCard } from "./unbonding-card";
import Toast from "react-native-toast-message";
import { txnTypeKey, txType } from "components/new/txn-status.tsx";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
      (unbonding: { validatorAddress: string }) =>
        unbonding.validatorAddress === validatorAddress
    );

  const style = useStyle();
  const safeAreaInsets = useSafeAreaInsets();

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

  const actionButtons = staked.toDec().gt(new Dec(0)) ? (
    <View style={style.flatten(["flex-row", "items-center"]) as ViewStyle}>
      <Button
        mode="outline"
        text="Redelegate"
        containerStyle={
          style.flatten([
            "flex-1",
            "border-radius-32",
            "border-color-gray-100",
          ]) as ViewStyle
        }
        textStyle={style.flatten(["body2", "color-dark"]) as ViewStyle}
        onPress={() => {
          analyticsStore.logEvent("redelegate_click", {
            pageName: "Validator Details",
          });
          if (isTxnInProgress()) {
            Toast.show({
              type: "error",
              text1: `${txnInProgressMessage()} In Progress`,
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
          style.flatten([
            "flex-1",
            "border-radius-32",
            "background-color-dark",
          ]) as ViewStyle
        }
        textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
        text="Stake More"
        onPress={() => {
          analyticsStore.logEvent("stake_more_click", {
            pageName: "Validator Details",
          });
          if (isTxnInProgress()) {
            Toast.show({
              type: "error",
              text1: `${txnInProgressMessage()} In Progress`,
            });
            return;
          }
          smartNavigation.navigateSmart("Delegate", {
            validatorAddress,
          });
        }}
      />
    </View>
  ) : validatorSelector ? (
    <Button
      containerStyle={
        style.flatten([
          "border-radius-32",
          "background-color-dark",
        ]) as ViewStyle
      }
      text="Choose this validator"
      textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
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
      containerStyle={
        style.flatten([
          "border-radius-32",
          "background-color-dark",
        ]) as ViewStyle
      }
      text="Stake with This Validator"
      textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
      onPress={() => {
        analyticsStore.logEvent("stake_with_validator_click", {
          pageName: "Validator Details",
        });
        if (isTxnInProgress()) {
          Toast.show({
            type: "error",
            text1: `${txnInProgressMessage()} In Progress`,
          });
          return;
        }
        smartNavigation.navigateSmart("Delegate", {
          validatorAddress,
        });
      }}
    />
  );

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      contentContainerStyle={{
        paddingBottom: Math.max(safeAreaInsets.bottom, 16) + 80,
      }}
      style={
        style.flatten([
          "padding-x-page",
          "padding-y-16",
          "overflow-scroll",
        ]) as ViewStyle
      }
      fixed={
        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            justifyContent: "flex-end",
            paddingHorizontal: 16,
            paddingBottom: Math.max(safeAreaInsets.bottom, 16),
            paddingTop: 16,
          }}
        >
          {actionButtons}
        </View>
      }
    >
      <ValidatorDetailsCard validatorAddress={validatorAddress} />
      {staked.toDec().gt(new Dec(0)) ? (
        <DelegatedCard
          containerStyle={style.flatten(["margin-y-16"]) as ViewStyle}
          validatorAddress={validatorAddress}
        />
      ) : unbondings ? (
        <UnbondingCard
          validatorAddress={validatorAddress}
          containerStyle={style.flatten(["margin-y-16"]) as ViewStyle}
        />
      ) : null}
    </PageWithScrollView>
  );
});
