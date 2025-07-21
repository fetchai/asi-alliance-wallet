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
import { useUndelegateTxConfig } from "@keplr-wallet/hooks";
import { PageWithScrollView } from "components/page";
import { Text, View, ViewStyle } from "react-native";
import { Button } from "components/button";
import { Staking } from "@keplr-wallet/stores";
import { Buffer } from "buffer/";
import { StakeAmountInput } from "components/new/input/stake-amount";
import { UseMaxButton } from "components/new/button/use-max-button";
import { MemoInputView } from "components/new/card-view/memo-input";
import { CircleExclamationIcon } from "components/new/icon/circle-exclamation";
import { TransactionModal } from "modals/transaction";
import { IconButton } from "components/new/button/icon";
import { GearIcon } from "components/new/icon/gear-icon";
import { TransactionFeeModel } from "components/new/fee-modal/transection-fee-modal";
import Toast from "react-native-toast-message";
import { useNetInfo } from "@react-native-community/netinfo";
import { txnTypeKey } from "components/new/txn-status.tsx";
import { numberLocalFormat } from "utils/format/format";

export const UndelegateScreen: FunctionComponent = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          validatorAddress: string;
        }
      >,
      string
    >
  >();

  const validatorAddress = route.params.validatorAddress;

  const {
    chainStore,
    accountStore,
    queriesStore,
    analyticsStore,
    priceStore,
    activityStore,
  } = useStore();

  const style = useStyle();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const [isToggleClicked, setIsToggleClicked] = useState<boolean>(false);

  const [inputInUsd, setInputInUsd] = useState<string | undefined>("");
  const [showTransectionModal, setTransectionModal] = useState(false);
  const [txnHash, setTxnHash] = useState<string>("");
  const [showFeeModal, setFeeModal] = useState(false);

  const validator =
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

  const sendConfigs = useUndelegateTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainStore.current.chainId,
    account.bech32Address,
    validatorAddress
  );

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
    sendConfigs.recipientConfig.setRawRecipient(validatorAddress);
  }, [sendConfigs.recipientConfig, validatorAddress]);

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

  const unstakeBalance = async () => {
    if (!networkIsConnected) {
      Toast.show({
        type: "error",
        text1: "No internet connection",
      });
      return;
    }
    if (account.isReadyToSendTx && txStateIsValid) {
      try {
        analyticsStore.logEvent("unstake_txn_click", {
          pageName: "Stake Validator",
        });
        await account.cosmos.sendUndelegateMsg(
          sendConfigs.amountConfig.amount,
          sendConfigs.recipientConfig.recipient,
          sendConfigs.memoConfig.memo,
          sendConfigs.feeConfig.toStdFee(),
          {
            preferNoSetMemo: true,
            preferNoSetFee: true,
          },
          {
            onBroadcasted: (txHash) => {
              analyticsStore.logEvent("unstake_txn_broadcasted", {
                chainId: chainStore.current.chainId,
                chainName: chainStore.current.chainName,
                validatorName: validator?.description.moniker,
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
        analyticsStore.logEvent("unstake_txn_broadcasted_fail", {
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
          [
            style.flatten([
              "flex-row",
              "items-center",
              "border-width-1",
              "border-color-white@20%",
              "border-radius-12",
              "padding-12",
              "justify-between",
              "margin-y-16",
            ]),
          ] as ViewStyle
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
      <StakeAmountInput
        label="Amount"
        labelStyle={
          style.flatten([
            "body3",
            "color-white@60%",
            "padding-y-0",
            "margin-y-0",
            "margin-bottom-8",
          ]) as ViewStyle
        }
        amountConfig={sendConfigs.amountConfig}
        isToggleClicked={isToggleClicked}
        editable={!activityStore.getPendingTxnTypes[txnTypeKey.undelegate]}
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
        disable={activityStore.getPendingTxnTypes[txnTypeKey.undelegate]}
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
        editable={!activityStore.getPendingTxnTypes[txnTypeKey.undelegate]}
      />
      <View
        style={
          style.flatten([
            "margin-y-16",
            "padding-12",
            "background-color-cardColor@25%",
            "flex-row",
            "border-radius-12",
          ]) as ViewStyle
        }
      >
        <View
          style={
            [style.flatten(["margin-top-4", "margin-right-10"])] as ViewStyle
          }
        >
          <CircleExclamationIcon />
        </View>
        <Text
          style={style.flatten(["body3", "color-white", "flex-1"]) as ViewStyle}
        >
          Your tokens will go through a 21-day unstaking process
        </Text>
      </View>
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
                  activityStore.getPendingTxnTypes[txnTypeKey.undelegate]
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
                activityStore.getPendingTxnTypes[txnTypeKey.undelegate]
                  ? "border-color-white@20%"
                  : "border-color-white@40%",
              ]) as ViewStyle
            }
            disable={activityStore.getPendingTxnTypes[txnTypeKey.undelegate]}
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
        loading={activityStore.getPendingTxnTypes[txnTypeKey.undelegate]}
        textStyle={style.flatten(["body2"]) as ViewStyle}
        containerStyle={
          style.flatten(["margin-top-16", "border-radius-32"]) as ViewStyle
        }
        onPress={unstakeBalance}
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
        onTryAgainClick={unstakeBalance}
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
