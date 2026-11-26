import React, { FunctionComponent, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { PageWithScrollView } from "components/page";
import { useStyle } from "styles/index";

import { useStore } from "stores/index";
import { Text, View, ViewStyle } from "react-native";
import { RectButton } from "components/rect-button";
import { CheckIcon } from "components/new/icon/check";

import { useSmartNavigation } from "navigation/smart-navigation";

export const CurrencyScreen: FunctionComponent = observer(() => {
  const { priceStore, analyticsStore } = useStore();

  const style = useStyle();
  const smartNavigation = useSmartNavigation();

  const currencyItems = useMemo(() => {
    return Object.keys(priceStore.supportedVsCurrencies).map((key) => {
      return {
        key,
        label: priceStore.supportedVsCurrencies[key]?.currency.toUpperCase(),
        symbol: priceStore.supportedVsCurrencies[key]?.symbol,
        name: priceStore.supportedVsCurrencies[key]?.name,
      };
    });
  }, [priceStore.supportedVsCurrencies]);

  return (
    <PageWithScrollView
      backgroundMode="image"
      style={style.flatten(["padding-x-page", "padding-y-page"]) as ViewStyle}
    >
      {currencyItems.map((item) => {
        return (
          <RectButton
            key={item.key}
            style={
              style.flatten(
                ["padding-18", "flex-row", "justify-between", "items-center"],
                [
                  item.key === priceStore.defaultVsCurrency &&
                    "background-color-indigo",
                  "border-radius-12",
                ]
              ) as ViewStyle
            }
            onPress={() => {
              priceStore.setDefaultVsCurrency(item.key);
              analyticsStore.logEvent("currency_change_click", {
                pageName: "More",
              });
              smartNavigation.goBack();
            }}
          >
            <View
              style={
                style.flatten([
                  "flex-1",
                  "flex-row",
                  "items-center",
                ]) as ViewStyle
              }
            >
              <Text
                style={style.flatten(["body3", "color-white"]) as ViewStyle}
              >
                {item.label}
              </Text>
              <Text
                style={
                  style.flatten([
                    "body3",
                    "color-white@60%",
                    "margin-x-8",
                  ]) as ViewStyle
                }
              >
                {`${item.name} (${item.symbol})`}
              </Text>
            </View>
            {item.key === priceStore.defaultVsCurrency ? <CheckIcon /> : null}
          </RectButton>
        );
      })}
      <View style={style.flatten(["height-page-double-pad"]) as ViewStyle} />
    </PageWithScrollView>
  );
});
