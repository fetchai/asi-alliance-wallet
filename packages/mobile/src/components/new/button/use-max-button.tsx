import React, { FunctionComponent } from "react";
import { View, ViewStyle } from "react-native";
import { BlurButton } from "./blur-button";
import { ReloadIcon } from "../icon/reload-icon";
import { useStyle } from "styles/index";
import { IAmountConfig } from "@keplr-wallet/hooks";
import { useStore } from "stores/index";

export const UseMaxButton: FunctionComponent<{
  amountConfig: IAmountConfig;
  isToggleClicked: boolean;
  setIsToggleClicked: any;
  containerStyle?: ViewStyle;
  disable?: boolean;
}> = ({
  amountConfig,
  isToggleClicked,
  setIsToggleClicked,
  containerStyle,
  disable = false,
}) => {
  const style = useStyle();
  const { priceStore } = useStore();
  const disableCurrency = ["mmk", "sar", "kwd", "aed", "bdt", "bhd"];

  return (
    <View
      style={
        [
          style.flatten(["flex-row", "justify-evenly", "margin-y-16"]),
          containerStyle,
        ] as ViewStyle
      }
    >
      <View style={style.flatten(["flex-1"]) as ViewStyle}>
        <BlurButton
          text={`Change to ${
            !isToggleClicked || !amountConfig.sendCurrency["coinGeckoId"]
              ? priceStore.defaultVsCurrency.toUpperCase()
              : amountConfig.sendCurrency.coinDenom
          }`}
          backgroundBlur={false}
          leftIcon={
            <View style={style.flatten(["margin-right-8"]) as ViewStyle}>
              <ReloadIcon
                size={21}
                color={
                  !amountConfig.sendCurrency["coinGeckoId"] ||
                  disable ||
                  disableCurrency.includes(priceStore.defaultVsCurrency)
                    ? style.get("color-white@20%").color
                    : "white"
                }
              />
            </View>
          }
          disable={
            !amountConfig.sendCurrency["coinGeckoId"] ||
            disable ||
            disableCurrency.includes(priceStore.defaultVsCurrency)
          }
          borderRadius={32}
          onPress={() => {
            setIsToggleClicked(!isToggleClicked);
          }}
          containerStyle={
            style.flatten([
              "border-width-1",
              "margin-4",
              "padding-6",
              "justify-center",
              !amountConfig.sendCurrency["coinGeckoId"] ||
              disable ||
              disableCurrency.includes(priceStore.defaultVsCurrency)
                ? "border-color-white@20%"
                : "border-color-white@40%",
            ]) as ViewStyle
          }
          textStyle={style.flatten(["body3"]) as ViewStyle}
        />
      </View>
      <View style={style.flatten(["flex-1"]) as ViewStyle}>
        <BlurButton
          text="Use max available"
          backgroundBlur={false}
          borderRadius={32}
          disable={disable}
          onPress={() => {
            amountConfig.toggleIsMax();
          }}
          containerStyle={
            style.flatten([
              "border-width-1",
              disable ? "border-color-white@20%" : "border-color-white@40%",
              "padding-6",
              "margin-4",
              "justify-center",
            ]) as ViewStyle
          }
          textStyle={style.flatten(["body3"]) as ViewStyle}
        />
      </View>
    </View>
  );
};
