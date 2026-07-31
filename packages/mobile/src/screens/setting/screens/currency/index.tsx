import React, { FunctionComponent, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { PageWithScrollView } from "components/page";
import { useStyle } from "styles/index";

import { useStore } from "stores/index";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
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
      backgroundMode="secondary"
      hasFloatingHeader={true}
      style={style.flatten(["padding-x-page", "padding-y-page"]) as ViewStyle}
    >
      {currencyItems.map((item) => {
        const isSelected = item.key === priceStore.defaultVsCurrency;
        return (
          <RectButton
            key={item.key}
            style={StyleSheet.flatten([
              style.flatten([
                "padding-18",
                "flex-row",
                "justify-between",
                "items-center",
                "border-radius-12",
                "margin-y-2",
              ]) as ViewStyle,
              { backgroundColor: isSelected ? "#e0fedd" : "#f6f6f6" },
            ])}
            rippleColor={"#e0fedd"}
            underlayColor="#e0fedd"
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
                  "flex-wrap",
                ]) as ViewStyle
              }
            >
              <Text
                style={
                  style.flatten([
                    "body3",
                    "color-dark",
                    "margin-right-8",
                  ]) as ViewStyle
                }
              >
                {item.label}
              </Text>
              <Text
                style={
                  style.flatten([
                    "body3",
                    "color-gray-300",
                    "margin-right-8",
                  ]) as ViewStyle
                }
              >
                {`${item.name} (${item.symbol})`}
              </Text>
            </View>
            {isSelected ? <CheckIcon color="#151a1a" /> : null}
          </RectButton>
        );
      })}
      <View style={style.flatten(["height-page-double-pad"]) as ViewStyle} />
    </PageWithScrollView>
  );
});
