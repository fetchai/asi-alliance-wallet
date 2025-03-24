import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { PageWithScrollView } from "components/page";
import { useStyle } from "styles/index";
import {
  NavigationProp,
  ParamListBase,
  RouteProp,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { FlatList, Text, View, ViewStyle } from "react-native";
import { useStore } from "stores/index";
import { useDelegateTxConfig } from "@keplr-wallet/hooks";
import { Button } from "components/button";
import { Staking } from "@keplr-wallet/stores";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { ValidatorThumbnail } from "components/thumbnail";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { StakeAmountInput } from "components/new/input/stake-amount";
import { MemoInputView } from "components/new/card-view/memo-input";
import { UseMaxButton } from "components/new/button/use-max-button";
import { CircleExclamationIcon } from "components/new/icon/circle-exclamation";
import { TransactionModal } from "modals/transaction";
import { VectorCharacter } from "components/vector-character";
import { IconButton } from "components/new/button/icon";
import { GearIcon } from "components/new/icon/gear-icon";
import { TransactionFeeModel } from "components/new/fee-modal/transection-fee-modal";
import Toast from "react-native-toast-message";
import { useNetInfo } from "@react-native-community/netinfo";
import { txnTypeKey } from "components/new/txn-status.tsx";
import { numberLocalFormat } from "utils/format/format";

interface ItemData {
  title: string;
  value: string;
}

export const DelegateScreen: FunctionComponent = observer(() => {
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

  const [isToggleClicked, setIsToggleClicked] = useState<boolean>(false);

  const [inputInUsd, setInputInUsd] = useState<string | undefined>("");
  const [showTransectionModal, setTransectionModal] = useState(false);
  const [txnHash, setTxnHash] = useState<string>("");
  const [showFeeModal, setFeeModal] = useState(false);

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const sendConfigs = useDelegateTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    chainStore.current.chainId,
    account.bech32Address
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

  const queryBalances = queriesStore
    .get(sendConfigs.amountConfig.chainId)
    .queryBalances.getQueryBech32Address(sendConfigs.amountConfig.sender);

  const queryBalance = queryBalances.balances.find(
    (bal) =>
      sendConfigs.amountConfig.sendCurrency.coinMinimalDenom ===
      bal.currency.coinMinimalDenom
  );
  const balance = queryBalance
    ? queryBalance.balance
    : new CoinPretty(sendConfigs.amountConfig.sendCurrency, new Int(0));

  const convertToUsd = (currency: any) => {
    const value = priceStore.calculatePrice(currency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };
  useEffect(() => {
    const inputValueInUsd = convertToUsd(balance);
    setInputInUsd(inputValueInUsd);
  }, [sendConfigs.amountConfig.amount]);

  const Usd = inputInUsd
    ? ` (${inputInUsd} ${priceStore.defaultVsCurrency.toUpperCase()})`
    : "";

  const availableBalance = `${balance
    .trim(true)
    .shrink(true)
    .maxDecimals(6)
    .toString()}${Usd}`;

  const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
    Staking.BondStatus.Bonded
  );

  const isEvm = chainStore.current.features?.includes("evm") ?? false;
  const feePrice = sendConfigs.feeConfig.getFeeTypePretty(
    sendConfigs.feeConfig.feeType ? sendConfigs.feeConfig.feeType : "average"
  );

  const validator = bondedValidators.getValidator(validatorAddress);

  const thumbnail = bondedValidators.getValidatorThumbnail(validatorAddress);

  let commisionRate;
  if (validator) {
    commisionRate = (
      parseFloat(validator.commission.commission_rates.rate) * 100
    ).toFixed(0);
  }

  const inflation = queries.cosmos.queryInflation;
  const { inflation: ARR } = inflation;
  const validatorCom: any = parseFloat(
    validator?.commission.commission_rates.rate || "0"
  );
  const APR = ARR.mul(new Dec(1 - validatorCom));

  const votingPower =
    validator &&
    new CoinPretty(chainStore.current.stakeCurrency, new Dec(validator?.tokens))
      .maxDecimals(0)
      .toString();

  const data: ItemData[] = [
    {
      title: "Voting power",
      value: votingPower
        ? `${numberLocalFormat(votingPower.split(" ")[0])} ${
            votingPower.split(" ")[1]
          }`
        : "NA",
    },
    {
      title: "Commission",
      value: commisionRate ? `${commisionRate}%` : "NA",
    },
    {
      title: "APR",
      value: APR ? `${APR.maxDecimals(2).trim(true).toString()}%` : "NA",
    },
  ];

  const stakeAmount = async () => {
    if (!networkIsConnected) {
      Toast.show({
        type: "error",
        text1: "No internet connection",
      });
      return;
    }
    if (account.isReadyToSendTx && txStateIsValid) {
      try {
        analyticsStore.logEvent("stake_txn_click", { pageName: "Stake" });
        await account.cosmos.sendDelegateMsg(
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
              analyticsStore.logEvent("stake_txn_broadcasted", {
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
        analyticsStore.logEvent("stake_txn_broadcasted_fail", {
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
      <BlurBackground
        borderRadius={12}
        blurIntensity={16}
        containerStyle={
          style.flatten(["padding-18", "margin-y-16"]) as ViewStyle
        }
      >
        <View
          style={
            style.flatten([
              "flex-row",
              "items-center",
              "margin-bottom-16",
            ]) as ViewStyle
          }
        >
          {thumbnail || validator?.description.moniker === undefined ? (
            <ValidatorThumbnail
              size={32}
              url={thumbnail}
              style={style.flatten(["margin-right-8"]) as ViewStyle}
            />
          ) : (
            <BlurBackground
              backgroundBlur={true}
              blurIntensity={16}
              containerStyle={
                style.flatten([
                  "width-32",
                  "height-32",
                  "border-radius-64",
                  "items-center",
                  "justify-center",
                  "margin-right-8",
                ]) as ViewStyle
              }
            >
              <VectorCharacter
                char={validator.description.moniker.trim()[0]}
                color="white"
                height={12}
              />
            </BlurBackground>
          )}

          <Text style={style.flatten(["body3", "color-white"]) as ViewStyle}>
            {validator?.description.moniker?.trim()}
          </Text>
        </View>
        <FlatList
          data={data}
          scrollEnabled={false}
          horizontal={true}
          contentContainerStyle={style.flatten(["width-full"]) as ViewStyle}
          renderItem={({ item, index }: { item: ItemData; index: number }) => {
            return (
              <View
                key={index}
                style={style.flatten(["margin-right-24"]) as ViewStyle}
              >
                <Text
                  style={
                    style.flatten([
                      "text-caption2",
                      "color-white@60%",
                    ]) as ViewStyle
                  }
                >
                  {item.title}
                </Text>
                <Text
                  style={
                    style.flatten(["color-white", "text-caption2"]) as ViewStyle
                  }
                >
                  {item.value}
                </Text>
              </View>
            );
          }}
          keyExtractor={(_item, index) => index.toString()}
        />
      </BlurBackground>
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
        editable={!activityStore.getPendingTxnTypes[txnTypeKey.delegate]}
      />
      <Text
        style={
          style.flatten([
            "color-white@60%",
            "text-caption2",
            "margin-top-8",
          ]) as ViewStyle
        }
      >{`Available: ${numberLocalFormat(
        availableBalance.toString().split(" ")[0]
      )} ${availableBalance.toString().split(" ")[1]}`}</Text>
      <UseMaxButton
        amountConfig={sendConfigs.amountConfig}
        isToggleClicked={isToggleClicked}
        setIsToggleClicked={setIsToggleClicked}
        disable={activityStore.getPendingTxnTypes[txnTypeKey.delegate]}
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
        editable={!activityStore.getPendingTxnTypes[txnTypeKey.delegate]}
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
          When you decide to unstake, your assets will be locked 21 days to be
          liquid again
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
                  activityStore.getPendingTxnTypes[txnTypeKey.delegate]
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
                activityStore.getPendingTxnTypes[txnTypeKey.delegate]
                  ? "border-color-white@20%"
                  : "border-color-white@40%",
              ]) as ViewStyle
            }
            disable={activityStore.getPendingTxnTypes[txnTypeKey.delegate]}
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
        textStyle={style.flatten(["body2"]) as ViewStyle}
        containerStyle={
          style.flatten(["margin-top-16", "border-radius-32"]) as ViewStyle
        }
        disabled={!account.isReadyToSendTx || !txStateIsValid}
        loading={activityStore.getPendingTxnTypes[txnTypeKey.delegate]}
        onPress={stakeAmount}
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
        onTryAgainClick={stakeAmount}
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
