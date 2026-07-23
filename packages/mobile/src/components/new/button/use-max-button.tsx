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
  onPress?: () => void;
}> = ({
  amountConfig,
  isToggleClicked,
  setIsToggleClicked,
  containerStyle,
  disable = false,
  onPress,
}) => {
  const style = useStyle();
  const { priceStore } = useStore();
  const disableCurrency = ["mmk", "sar", "kwd", "aed", "bdt", "bhd"];

  const changeButtonDisabled =
    !amountConfig.sendCurrency["coinGeckoId"] ||
    disable ||
    disableCurrency.includes(priceStore.defaultVsCurrency);

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
            <View style={style.flatten(["margin-right-2"]) as ViewStyle}>
              <ReloadIcon
                size={21}
                color={changeButtonDisabled ? "#DCDCE3" : "#151a1a"}
              />
            </View>
          }
          disable={changeButtonDisabled}
          borderRadius={32}
          onPress={() => {
            setIsToggleClicked(!isToggleClicked);
          }}
          containerStyle={
            style.flatten([
              "flex-wrap",
              "border-width-1",
              "border-color-gray-100",
              "margin-4",
              "padding-y-4",
              "padding-x-8",
              "justify-center",
            ]) as ViewStyle
          }
          textStyle={
            style.flatten([
              "body3",
              changeButtonDisabled ? "color-gray-300" : "color-dark",
            ]) as ViewStyle
          }
        />
      </View>
      <View style={style.flatten(["flex-1"]) as ViewStyle}>
        <BlurButton
          text="Use Max Available"
          backgroundBlur={false}
          borderRadius={32}
          disable={disable}
          onPress={() => {
            onPress ? onPress() : amountConfig.toggleIsMax();
          }}
          containerStyle={
            style.flatten([
              "flex-wrap",
              "border-width-1",
              "border-color-gray-100",
              "padding-y-4",
              "padding-x-8",
              "margin-4",
              "justify-center",
            ]) as ViewStyle
          }
          textStyle={
            style.flatten([
              "body3",
              disable ? "color-gray-300" : "color-dark",
            ]) as ViewStyle
          }
        />
      </View>
    </View>
  );
};
