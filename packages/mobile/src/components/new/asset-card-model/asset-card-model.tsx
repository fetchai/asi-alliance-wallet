import React, { FunctionComponent, useEffect, useState } from "react";
import { CardModal } from "modals/card";
import { Platform, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { SearchIcon } from "components/new/icon/search-icon";
import { IAmountConfig } from "@keplr-wallet/hooks";
import { useStore } from "stores/index";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { TokenCardView } from "../card-view/token-card-view";
import { EmptyView } from "../empty";
import { InputCardView } from "../card-view/input-card";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const AssetCardModel: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  title: string;
  amountConfig: IAmountConfig;
}> = ({ close, title, isOpen, amountConfig }) => {
  const style = useStyle();
  const safeAreaInsets = useSafeAreaInsets();
  const { queriesStore, priceStore, analyticsStore, accountStore, chainStore } =
    useStore();
  const [search, setSearch] = useState("");

  const chainId = chainStore.current.chainId;
  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);

  const queryBalances = queriesStore
    .get(amountConfig.chainId)
    .queryBalances.getQueryBech32Address(amountConfig.sender);

  const selectableCurrencies = amountConfig.sendableCurrencies
    .filter((cur) => {
      const bal = queryBalances.getBalanceFromCurrency(cur);
      return !bal.toDec().isZero();
    })
    .sort((a, b) => {
      return a.coinDenom < b.coinDenom ? -1 : 1;
    });

  const [filterCurrencies, setFilterCurrencies] =
    useState(selectableCurrencies);

  useEffect(() => {
    const searchTrim = search.trim();
    const newSelectableCurrencies = selectableCurrencies.filter((curr) => {
      return curr.coinDenom.toLowerCase().includes(searchTrim.toLowerCase());
    });
    setFilterCurrencies(newSelectableCurrencies);
  }, [search]);

  const convertToUsd = (currency: any) => {
    const value = priceStore.calculatePrice(currency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };
  const balancesMap = new Map(
    queries.cosmos.querySpendableBalances
      .getQueryBech32Address(account.bech32Address)
      .balances.map((b) => [b.currency.coinMinimalDenom, b])
  );

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal
      isOpen={isOpen}
      title={title}
      disableGesture={true}
      close={() => {
        setSearch("");
        close();
      }}
      cardStyle={
        [
          style.flatten([
            "min-height-full",
            "border-radius-0",
            "max-height-full",
          ]) as ViewStyle,
          {
            paddingTop: Platform.OS === "ios" ? safeAreaInsets.top : 48,
            // height: filterCurrencies.length === 0 ? "100%" : undefined,
          },
        ] as ViewStyle
      }
      childrenContainerStyle={{
        height: filterCurrencies.length === 0 ? "100%" : undefined,
      }}
    >
      <InputCardView
        placeholder="Search"
        placeholderTextColor={"white"}
        value={search}
        onChangeText={(text: string) => {
          setSearch(text);
        }}
        rightIcon={<SearchIcon size={12} />}
        containerStyle={style.flatten(["margin-bottom-20"]) as ViewStyle}
      />
      {filterCurrencies.length === 0 ? (
        <EmptyView />
      ) : (
        filterCurrencies.map((currency) => {
          const currencyBalance =
            balancesMap.get(currency.coinMinimalDenom) ||
            new CoinPretty(currency, new Int(0));
          return (
            <TokenCardView
              key={currency.coinMinimalDenom}
              title={currency.coinDenom}
              subtitle={`${currencyBalance
                .shrink(true)
                .maxDecimals(6)
                .toString()}`}
              trailingStart={
                convertToUsd(currencyBalance)
                  ? `${convertToUsd(currencyBalance)}`
                  : ""
              }
              trailingEnd={convertToUsd(currencyBalance) ? "USD" : ""}
              containerStyle={
                style.flatten(
                  ["margin-y-4"],
                  [
                    currency.coinMinimalDenom ===
                      amountConfig.sendCurrency.coinMinimalDenom &&
                      "background-color-indigo",
                  ]
                ) as ViewStyle
              }
              onPress={() => {
                analyticsStore.logEvent("select_asset_click", {
                  pageName: "Send",
                });
                amountConfig.setSendCurrency(currency);
                setSearch("");
                close();
              }}
            />
          );
        })
      )}
    </CardModal>
  );
};
