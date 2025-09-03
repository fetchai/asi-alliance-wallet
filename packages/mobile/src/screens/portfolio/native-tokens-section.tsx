import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";

import { useStore } from "stores/index";
import { TokenCardView } from "components/new/card-view/token-card-view";
import { ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { AppCurrency } from "@keplr-wallet/types";
import { TokenSymbolUsingChainInfo } from "components/token-symbol/token-symbol-chain";
import {
  numberLocalFormat,
  separateNumericAndDenom,
} from "utils/format/format";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { BlurButton } from "components/new/button/blur-button";
import { LockIcon } from "components/new/icon/lock";
import { StakeIcon } from "components/new/icon/stake-icon";

export const NativeTokensSection: FunctionComponent = observer(() => {
  const style = useStyle();

  const { chainStore, queriesStore, accountStore, priceStore, analyticsStore } =
    useStore();
  const current = chainStore.current;
  const queries = queriesStore.get(current.chainId);

  const accountInfo = accountStore.getAccount(current.chainId);

  const isVesting = queries.cosmos.queryAccount.getQueryBech32Address(
    accountInfo.bech32Address
  ).isVestingAccount;

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

  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { numericPart: totalNumber, denomPart: totalDenom } =
    separateNumericAndDenom(stakable.shrink(true).trim(true).toString());
  const totalPrice = priceStore.calculatePrice(stakable);

  const NativeTokenDetailsString = encodeURIComponent(
    JSON.stringify(balanceQuery.balances[0].balance?.currency)
  );
  const NativeTokenBalance = {
    balance: totalNumber,
    totalDenom: totalDenom,
    balanceInUsd: totalPrice && totalPrice.toString(),
  };
  const NativeTokenBalanceString = encodeURIComponent(
    JSON.stringify(NativeTokenBalance)
  );

  return (
    <TokenCardView
      containerStyle={style.flatten(["margin-y-4"]) as ViewStyle}
      key={stakable.currency.coinMinimalDenom}
      onPress={() => {
        analyticsStore.logEvent("native_token_click", {
          pageName: "Portfolio",
        });
        navigation.navigate("Others", {
          screen: "NativeTokens",
          params: {
            tokenString: NativeTokenDetailsString,
            tokenBalanceString: NativeTokenBalanceString,
          },
        });
      }}
      leadingIcon={
        <TokenSymbolUsingChainInfo
          size={44}
          chainInfo={chainStore.current}
          currency={stakable.currency}
        />
      }
      title={totalDenom}
      subtitle={`${numberLocalFormat(
        stakable.shrink(true).maxDecimals(6).toString().split(" ")[0]
      )} ${stakable.shrink(true).maxDecimals(6).toString().split(" ")[1]}`}
      trailingStart={totalPrice ? `${totalPrice.toString()}` : ""}
      trailingEnd={totalPrice ? priceStore.defaultVsCurrency.toUpperCase() : ""}
      bottomContent={
        isVesting ? (
          <React.Fragment>
            <BlurButton
              text={"Staked"}
              backgroundBlur={false}
              leftIcon={<StakeIcon size={12} />}
              borderRadius={8}
              containerStyle={
                style.flatten([
                  "border-width-1",
                  "padding-x-12",
                  "padding-y-6",
                  "margin-right-8",
                  "justify-center",
                  "border-color-white@20%",
                ]) as ViewStyle
              }
              textStyle={
                style.flatten([
                  "text-caption2",
                  "color-white",
                  "margin-0",
                ]) as ViewStyle
              }
            />
            <BlurButton
              text={"Vesting"}
              backgroundBlur={false}
              leftIcon={<LockIcon />}
              borderRadius={8}
              containerStyle={
                style.flatten([
                  "border-width-1",
                  "padding-x-12",
                  "padding-y-6",
                  "justify-center",
                  "border-color-white@20%",
                ]) as ViewStyle
              }
              textStyle={
                style.flatten([
                  "text-caption2",
                  "color-white",
                  "margin-0",
                ]) as ViewStyle
              }
            />
          </React.Fragment>
        ) : null
      }
    />
  );
});
