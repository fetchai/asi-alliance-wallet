import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  NavigationProp,
  ParamListBase,
  RouteProp,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { Staking } from "@keplr-wallet/stores";
import { useRedelegateTxConfig } from "@keplr-wallet/hooks";
import { PageWithScrollView } from "components/page";
import { Text, View, ViewStyle } from "react-native";
import { Button } from "components/button";
import { useSmartNavigation } from "navigation/smart-navigation";
import { DropDownCardView } from "components/new/card-view/drop-down-card";
import { ChevronRightIcon } from "components/new/icon/chevron-right";
import { StakeAmountInput } from "components/new/input/stake-amount";
import { UseMaxButton } from "components/new/button/use-max-button";
import { MemoInputView } from "components/new/card-view/memo-input";
import { TransactionModal } from "modals/transaction";
import { IconButton } from "components/new/button/icon";
import { GearIcon } from "components/new/icon/gear-icon";
import { TransactionFeeModel } from "components/new/fee-modal/transection-fee-modal";
import { useNetInfo } from "@react-native-community/netinfo";
import Toast from "react-native-toast-message";
import { txnTypeKey } from "components/new/txn-status.tsx";
import { numberLocalFormat } from "utils/format/format";

export const RedelegateScreen: FunctionComponent = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          validatorAddress: string;
          selectedValidatorAddress: string;
        }
      >,
      string
    >
  >();

  const validatorAddress = route.params.validatorAddress;
  const selectedValidatorAddress = route.params.selectedValidatorAddress
    ? route.params.selectedValidatorAddress
    : "";

  const smartNavigation = useSmartNavigation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;

  const {
    chainStore,
    accountStore,
    queriesStore,
    analyticsStore,
    priceStore,
    activityStore,
  } = useStore();

  const style = useStyle();

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const [isToggleClicked, setIsToggleClicked] = useState<boolean>(false);

  const [inputInUsd, setInputInUsd] = useState<string | undefined>("");
  const [showTransectionModal, setTransectionModal] = useState(false);
  const [txnHash, setTxnHash] = useState<string>("");
  const [showFeeModal, setFeeModal] = useState(false);

  const srcValidator =
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Bonded)
      .getValidator(validatorAddress) ||
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Unbonding)
      .getValidator(validatorAddress) ||
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Unbonded)
      .getValidator(validatorAddress);

  const staked = queries.cosmos.queryDelegations
    .getQueryBech32Address(account.bech32Address)
    .getDelegationTo(validatorAddress);

  const sendConfigs = useRedelegateTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainStore.current.chainId,
    account.bech32Address,
    validatorAddress
  );

  const dstValidator =
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Bonded)
      .getValidator(selectedValidatorAddress) ||
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Unbonding)
      .getValidator(selectedValidatorAddress) ||
    queries.cosmos.queryValidators
      .getQueryStatus(Staking.BondStatus.Unbonded)
      .getValidator(selectedValidatorAddress);

  useEffect(() => {
    if (sendConfigs.feeConfig.feeCurrency && !sendConfigs.feeConfig.fee) {
      sendConfigs.feeConfig.setFeeType("average");
    }
  }, [
    sendConfigs.feeConfig,
    sendConfigs.feeConfig.feeCurrency,
    sendConfigs.feeConfig.fee,
  ]);

  useEffect(() => {
    sendConfigs.recipientConfig.setRawRecipient(selectedValidatorAddress);
  }, [selectedValidatorAddress, sendConfigs.recipientConfig]);

  const sendConfigError =
    sendConfigs.recipientConfig.error ??
    sendConfigs.amountConfig.error ??
    sendConfigs.memoConfig.error ??
    sendConfigs.gasConfig.error ??
    sendConfigs.feeConfig.error;
  const txStateIsValid = sendConfigError == null;

  const convertToUsd = (currency: any) => {
    const value = priceStore.calculatePrice(currency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };
  useEffect(() => {
    const inputValueInUsd = convertToUsd(staked);
    setInputInUsd(inputValueInUsd);
  }, [sendConfigs.amountConfig.amount]);

  const Usd = inputInUsd
    ? ` (${inputInUsd} ${priceStore.defaultVsCurrency.toUpperCase()})`
    : "";

  const availableBalance = `${staked
    .trim(true)
    .shrink(true)
    .maxDecimals(6)
    .toString()}${Usd}`;

  const isEvm = chainStore.current.features?.includes("evm") ?? false;
  const feePrice = sendConfigs.feeConfig.getFeeTypePretty(
    sendConfigs.feeConfig.feeType ? sendConfigs.feeConfig.feeType : "average"
  );

  const redelegateAmount = async () => {
    if (!networkIsConnected) {
      Toast.show({
        type: "error",
        text1: "No internet connection",
      });
      return;
    }
    if (account.isReadyToSendTx && txStateIsValid) {
      try {
        analyticsStore.logEvent("redelegate_txn_click", {
          pageName: "Stake Validator",
        });
        await account.cosmos.sendBeginRedelegateMsg(
          sendConfigs.amountConfig.amount,
          sendConfigs.srcValidatorAddress,
          sendConfigs.dstValidatorAddress,
          sendConfigs.memoConfig.memo,
          sendConfigs.feeConfig.toStdFee(),
          {
            preferNoSetMemo: true,
            preferNoSetFee: true,
          },
          {
            onBroadcasted: (txHash) => {
              analyticsStore.logEvent("redelegate_txn_broadcasted", {
                chainId: chainStore.current.chainId,
                chainName: chainStore.current.chainName,
                validatorName: srcValidator?.description.moniker,
                toValidatorName: dstValidator?.description.moniker,
                feeType: sendConfigs.feeConfig.feeType,
              });
              setTxnHash(Buffer.from(txHash).toString("hex"));
              setTransectionModal(true);
            },
          }
        );
      } catch (e) {
        if (
          e?.message === "Request rejected" ||
          e?.message === "Transaction rejected"
        ) {
          Toast.show({
            type: "error",
            text1: "Transaction rejected",
          });
          return;
        } else {
          Toast.show({
            type: "error",
            text1: e?.message,
          });
        }
        console.log(e);
        analyticsStore.logEvent("redelegate_txn_broadcasted_fail", {
          chainId: chainStore.current.chainId,
          chainName: chainStore.current.chainName,
          feeType: sendConfigs.feeConfig.feeType,
          message: e?.message ?? "",
        });
        navigation.navigate("Home", {});
      }
    }
  };

  return (
    <PageWithScrollView
      backgroundMode="image"
      style={style.flatten(["padding-x-page", "overflow-scroll"]) as ViewStyle}
      contentContainerStyle={style.get("flex-grow-1")}
    >
      <View
        style={
          style.flatten([
            "flex-row",
            "items-center",
            "border-width-1",
            "border-color-white@20%",
            "border-radius-12",
            "padding-12",
            "justify-between",
            "margin-y-16",
          ]) as ViewStyle
        }
      >
        <Text
          style={
            style.flatten(["body3", "color-white@60%", "flex-1"]) as ViewStyle
          }
        >
          Current staked amount
        </Text>
        <Text
          style={
            style.flatten([
              "subtitle3",
              "color-white",
              "flex-1",
              "text-right",
            ]) as ViewStyle
          }
        >
          {`${numberLocalFormat(
            staked
              .trim(true)
              .shrink(true)
              .maxDecimals(6)
              .toString()
              .split(" ")[0]
          )} ${
            staked
              .trim(true)
              .shrink(true)
              .maxDecimals(6)
              .toString()
              .split(" ")[1]
          }`}
        </Text>
      </View>
      <Text
        style={
          style.flatten([
            "body3",
            "color-white@60%",
            "margin-bottom-8",
          ]) as ViewStyle
        }
      >
        From
      </Text>
      <View
        style={
          style.flatten([
            "border-width-1",
            "border-color-white@20%",
            "border-radius-12",
            "padding-x-18",
            "padding-y-12",
            "margin-bottom-8",
          ]) as ViewStyle
        }
      >
        <Text style={style.flatten(["body3", "color-white@60%"]) as ViewStyle}>
          {srcValidator ? srcValidator.description.moniker : "..."}
        </Text>
      </View>

      <DropDownCardView
        containerStyle={style.flatten(["margin-bottom-16"]) as ViewStyle}
        mainHeadingrStyle={style.flatten(["body3"]) as ViewStyle}
        headingrStyle={style.flatten(["body3", "color-white@60%"]) as ViewStyle}
        mainHeading="To"
        heading={
          dstValidator ? dstValidator.description.moniker : "Choose validator"
        }
        trailingIcon={
          <ChevronRightIcon
            color={
              activityStore.getPendingTxnTypes[txnTypeKey.redelegate]
                ? style.get("color-white@20%").color
                : "white"
            }
          />
        }
        onPress={() => {
          smartNavigation.navigateSmart("Validator.List", {
            prevSelectedValidator: srcValidator?.operator_address,
            selectedValidator: dstValidator?.operator_address,
          });
        }}
        disable={activityStore.getPendingTxnTypes[txnTypeKey.redelegate]}
      />
      <StakeAmountInput
        label="Amount"
        labelStyle={
          style.flatten([
            "body3",
            "color-white@60%",
            "margin-y-0",
            "margin-bottom-8",
          ]) as ViewStyle
        }
        amountConfig={sendConfigs.amountConfig}
        isToggleClicked={isToggleClicked}
        editable={!activityStore.getPendingTxnTypes[txnTypeKey.redelegate]}
      />
      <Text
        style={
          style.flatten([
            "color-white@60%",
            "text-caption2",
            "margin-top-8",
          ]) as ViewStyle
        }
      >{`Available: ${numberLocalFormat(availableBalance.split(" ")[0])} ${
        availableBalance.split(" ")[1]
      }`}</Text>
      <UseMaxButton
        amountConfig={sendConfigs.amountConfig}
        isToggleClicked={isToggleClicked}
        setIsToggleClicked={setIsToggleClicked}
        disable={activityStore.getPendingTxnTypes[txnTypeKey.redelegate]}
      />
      <MemoInputView
        label="Memo"
        labelStyle={
          style.flatten([
            "body3",
            "color-white@60%",
            "padding-y-0",
            "margin-y-0",
            "margin-bottom-8",
          ]) as ViewStyle
        }
        memoConfig={sendConfigs.memoConfig}
        error={sendConfigs.memoConfig.error?.message}
        editable={!activityStore.getPendingTxnTypes[txnTypeKey.redelegate]}
        containerStyle={style.flatten(["margin-bottom-16"]) as ViewStyle}
      />
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-between",
            "items-center",
            "margin-y-12",
          ]) as ViewStyle
        }
      >
        <Text style={style.flatten(["body3", "color-white@60%"]) as ViewStyle}>
          Transaction fee:
        </Text>
        <View style={style.flatten(["flex-row", "items-center"]) as ViewStyle}>
          <Text
            style={
              style.flatten([
                "body3",
                "color-white",
                "margin-right-6",
              ]) as ViewStyle
            }
          >
            {feePrice.hideIBCMetadata(true).trim(true).toMetricPrefix(isEvm)}
          </Text>
          <IconButton
            backgroundBlur={false}
            icon={
              <GearIcon
                color={
                  activityStore.getPendingTxnTypes[txnTypeKey.redelegate]
                    ? style.get("color-white@20%").color
                    : "white"
                }
              />
            }
            iconStyle={
              style.flatten([
                "width-32",
                "height-32",
                "items-center",
                "justify-center",
                "border-width-1",
                activityStore.getPendingTxnTypes[txnTypeKey.redelegate]
                  ? "border-color-white@20%"
                  : "border-color-white@40%",
              ]) as ViewStyle
            }
            disable={activityStore.getPendingTxnTypes[txnTypeKey.redelegate]}
            onPress={() => setFeeModal(true)}
          />
        </View>
      </View>
      {sendConfigs.feeConfig.error ? (
        <Text
          style={
            style.flatten([
              "text-caption1",
              "color-red-250",
              "margin-top-8",
            ]) as ViewStyle
          }
        >
          {sendConfigs.feeConfig.error.message == "insufficient fee"
            ? "Insufficient available balance for transaction fee"
            : sendConfigs.feeConfig.error.message}
        </Text>
      ) : null}
      <View style={style.flatten(["flex-1"])} />
      <Button
        text="Confirm"
        disabled={!account.isReadyToSendTx || !txStateIsValid}
        loading={activityStore.getPendingTxnTypes[txnTypeKey.redelegate]}
        containerStyle={
          style.flatten(["margin-top-16", "border-radius-32"]) as ViewStyle
        }
        textStyle={style.flatten(["body2"]) as ViewStyle}
        onPress={redelegateAmount}
      />
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      <TransactionModal
        isOpen={showTransectionModal}
        close={() => {
          setTransectionModal(false);
        }}
        txnHash={txnHash}
        chainId={chainStore.current.chainId}
        buttonText="Go to activity screen"
        onHomeClick={() => navigation.navigate("ActivityTab", {})}
        onTryAgainClick={redelegateAmount}
      />
      <TransactionFeeModel
        isOpen={showFeeModal}
        close={() => setFeeModal(false)}
        title={"Transaction fee"}
        feeConfig={sendConfigs.feeConfig}
        gasConfig={sendConfigs.gasConfig}
      />
    </PageWithScrollView>
  );
});
