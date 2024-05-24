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
import { useSmartNavigation } from "navigation/smart-navigation";
import { Staking } from "@keplr-wallet/stores";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { ValidatorThumbnail } from "components/thumbnail";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { StakeAmountInput } from "components/new/input/stake-amount";
import { MemoInputView } from "components/new/card-view/memo-input";
import { UseMaxButton } from "components/new/button/use-max-button";
import { FeeButtons } from "components/new/fee-button/fee-button-component";
import { CircleExclamationIcon } from "components/new/icon/circle-exclamation";
import { TransactionModal } from "modals/transaction";

interface ItemData {
  title: string;
  value: string;
}

export const NewDelegateScreen: FunctionComponent = observer(() => {
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

  const { chainStore, accountStore, queriesStore, analyticsStore, priceStore } =
    useStore();

  const style = useStyle();
  const smartNavigation = useSmartNavigation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const [isToggleClicked, setIsToggleClicked] = useState<boolean>(false);

  const [inputInUsd, setInputInUsd] = useState<string | undefined>("");
  const [showTransectionModal, setTransectionModal] = useState(false);
  const [txnHash, setTxnHash] = useState<string>("");

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
        ? `${votingPower.split(" ")[0]} ${votingPower.split(" ")[1]}`
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
    if (account.isReadyToSendTx && txStateIsValid) {
      try {
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
              analyticsStore.logEvent("Delegate tx broadcasted", {
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
        if (e?.message === "Request rejected") {
          return;
        }
        console.log(e);
        smartNavigation.navigateSmart("Home", {});
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
          <ValidatorThumbnail
            style={style.flatten(["margin-right-8"]) as ViewStyle}
            size={32}
            url={thumbnail}
          />
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
      />
      <Text
        style={
          style.flatten([
            "color-white@60%",
            "text-caption2",
            "margin-top-8",
          ]) as ViewStyle
        }
      >{`Available: ${availableBalance}`}</Text>
      <UseMaxButton
        amountConfig={sendConfigs.amountConfig}
        isToggleClicked={isToggleClicked}
        setIsToggleClicked={setIsToggleClicked}
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
          style={
            style.flatten(["subtitle3", "color-white", "flex-1"]) as ViewStyle
          }
        >
          When you decide to unstake, your assets will be locked 21 days to be
          liquid again
        </Text>
      </View>
      <FeeButtons
        label="Fee"
        gasLabel="gas"
        feeConfig={sendConfigs.feeConfig}
        gasConfig={sendConfigs.gasConfig}
      />
      <View style={style.flatten(["flex-1"])} />
      <Button
        text="Confirm"
        containerStyle={
          style.flatten(["margin-top-16", "border-radius-32"]) as ViewStyle
        }
        disabled={!account.isReadyToSendTx || !txStateIsValid}
        loading={account.txTypeInProgress === "delegate"}
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
        buttonText="Go to stakescreen"
        onHomeClick={() => navigation.navigate("Stake", {})}
        onTryAgainClick={stakeAmount}
      />
    </PageWithScrollView>
  );
});
