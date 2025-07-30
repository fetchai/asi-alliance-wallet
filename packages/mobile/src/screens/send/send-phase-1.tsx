import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  AmountConfig,
  FeeConfig,
  MemoConfig,
  RecipientConfig,
  SendGasConfig,
} from "@keplr-wallet/hooks";
import { useStore } from "stores/index";
import { View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { Button } from "components/button";
import { RouteProp, useRoute } from "@react-navigation/native";
import { DropDownCardView } from "components/new/card-view/drop-down-card";
import { AmountInputSection } from "components/new/input/amount";
import { ChevronDownIcon } from "components/new/icon/chevron-down";
import { AssetCardModel } from "components/new/asset-card-model/asset-card-model";
import { ChangeWalletCardModel } from "components/new/wallet-card/change-wallet";
import { useLoadingScreen } from "providers/loading-screen";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { numberLocalFormat, removeComma } from "utils/format/format";

interface SendConfigs {
  amountConfig: AmountConfig;
  memoConfig: MemoConfig;
  gasConfig: SendGasConfig;
  feeConfig: FeeConfig;
  recipientConfig: RecipientConfig;
}

export const SendPhase1: FunctionComponent<{
  sendConfigs: SendConfigs;
  setIsNext: any;
  noChangeAccount?: boolean;
}> = observer(({ sendConfigs, setIsNext, noChangeAccount = false }) => {
  const [openAssetModel, setOpenAssetModel] = React.useState(false);
  const [changeWalletModal, setChangeWalletModal] = React.useState(false);
  const [inputInUsd, setInputInUsd] = useState<string | undefined>("");
  const {
    chainStore,
    accountStore,
    queriesStore,
    keyRingStore,
    priceStore,
    analyticsStore,
  } = useStore();
  const loadingScreen = useLoadingScreen();

  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          chainId?: string;
          currency?: string;
          recipient?: string;
        }
      >,
      string
    >
  >();

  const style = useStyle();

  const chainId = route.params.chainId
    ? route.params.chainId
    : chainStore.current.chainId;

  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);

  const spendableBalances = queries.cosmos.querySpendableBalances
    .getQueryBech32Address(account.bech32Address)
    .balances?.find(
      (bal) =>
        sendConfigs.amountConfig.sendCurrency.coinMinimalDenom ===
        bal.currency.coinMinimalDenom
    );

  const balance = spendableBalances
    ? spendableBalances
    : new CoinPretty(sendConfigs.amountConfig.sendCurrency, new Int(0));

  const convertToCurrency = (currency: any) => {
    const value = priceStore.calculatePrice(currency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };

  useEffect(() => {
    const valueInUsd = convertToCurrency(balance);
    setInputInUsd(valueInUsd);
  }, [sendConfigs.amountConfig.sendCurrency]);

  useEffect(() => {
    if (route.params.recipient) {
      sendConfigs.recipientConfig.setRawRecipient(route.params.recipient);
    }
  }, [route.params.recipient, sendConfigs.recipientConfig]);

  const sendConfigError = sendConfigs.amountConfig.error;
  const txStateIsValid = sendConfigError == null;
  const usd = inputInUsd
    ? `(${inputInUsd} ${priceStore.defaultVsCurrency.toUpperCase()})`
    : "";
  const availableBalance = balance
    .shrink(true)
    .maxDecimals(6)
    .toString()
    .split(" ");
  const balanceValue = availableBalance[0];
  const balanceDenom = availableBalance[1];
  return (
    <React.Fragment>
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      <AmountInputSection
        amountConfig={sendConfigs.amountConfig}
        spendableBalance={removeComma(
          balance.shrink(true).hideDenom(true).toString().trim()
        )}
      />
      {/* This is a send component */}
      <View style={style.flatten(["margin-y-20"]) as ViewStyle}>
        <DropDownCardView
          containerStyle={
            style.flatten(["margin-bottom-card-gap"]) as ViewStyle
          }
          mainHeading="Asset"
          heading={sendConfigs.amountConfig.sendCurrency.coinDenom}
          subHeading={`Available: ${numberLocalFormat(
            balanceValue
          )} ${balanceDenom} ${usd}`}
          trailingIcon={<ChevronDownIcon size={12} />}
          onPress={() => {
            setOpenAssetModel(true);
            analyticsStore.logEvent("select_token_click", {
              pageName: "Send",
            });
          }}
        />
        <DropDownCardView
          containerStyle={
            style.flatten(["margin-bottom-card-gap"]) as ViewStyle
          }
          headingrStyle={
            style.flatten([
              noChangeAccount ? "color-white@20%" : "color-white",
            ]) as ViewStyle
          }
          mainHeading="Send from"
          heading={account.name}
          trailingIcon={
            <ChevronDownIcon
              size={12}
              color={
                noChangeAccount ? style.get("color-white@20%").color : "white"
              }
            />
          }
          onPress={() => {
            setChangeWalletModal(true);
            analyticsStore.logEvent("send_from_click", {
              pageName: "Send",
            });
          }}
          disable={noChangeAccount}
        />
      </View>
      <Button
        text="Next"
        size="large"
        containerStyle={style.flatten(["border-radius-64"]) as ViewStyle}
        textStyle={style.flatten(["body2", "font-normal"]) as ViewStyle}
        rippleColor="black@50%"
        disabled={
          sendConfigs.amountConfig.amount === "" ||
          sendConfigs.amountConfig.amount == "0" ||
          !txStateIsValid
        }
        onPress={() => {
          setIsNext(true);
          analyticsStore.logEvent("next_click", { pageName: "Send" });
        }}
      />
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      <AssetCardModel
        title={"Change asset"}
        isOpen={openAssetModel}
        close={() => setOpenAssetModel(false)}
        amountConfig={sendConfigs.amountConfig}
      />
      <ChangeWalletCardModel
        isOpen={changeWalletModal}
        title="Select Wallet"
        keyRingStore={keyRingStore}
        close={() => setChangeWalletModal(false)}
        onChangeAccount={async (keyStore) => {
          const index = keyRingStore.multiKeyStoreInfo.indexOf(keyStore);
          if (index >= 0) {
            loadingScreen.setIsLoading(true);
            await keyRingStore.changeKeyRing(index);
            loadingScreen.setIsLoading(false);
            analyticsStore.logEvent("select_wallet_click", {
              pageName: "Send",
            });
          }
        }}
      />
    </React.Fragment>
  );
});
