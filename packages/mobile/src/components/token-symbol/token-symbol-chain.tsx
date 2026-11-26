import React, { FunctionComponent } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { AppCurrency, Currency } from "@keplr-wallet/types";
import { useStyle } from "styles/index";
import FastImage from "react-native-fast-image";
import { VectorCharacter } from "components/vector-character";
import { IconButton } from "components/new/button/icon";

export const TokenSymbolUsingChainInfo: FunctionComponent<{
  style?: ViewStyle;

  currency: AppCurrency;
  chainInfo: {
    [x: string]: any;
    chainName: string;
    stakeCurrency: Currency;
  };
  size: number;

  imageScale?: number;
}> = ({
  style: propStyle,
  size,
  currency,
  chainInfo,
  imageScale = 32 / 44,
}) => {
  const style = useStyle();

  const currencyImageUrl =
    chainInfo?.["_chainInfo"]?.chainSymbolImageUrl ?? currency.coinImageUrl;

  return (
    <View
      style={StyleSheet.flatten([
        style.flatten(["items-center", "justify-center", "overflow-hidden"]),
        propStyle,
      ])}
    >
      {currencyImageUrl ? (
        <FastImage
          style={{
            width: size * imageScale,
            height: size * imageScale,
          }}
          resizeMode={FastImage.resizeMode.contain}
          source={{
            uri: currencyImageUrl,
          }}
        />
      ) : (
        <IconButton
          icon={
            <VectorCharacter
              char={currency.coinDenom[0]}
              height={Math.floor(size * 0.3)}
              color="white"
            />
          }
          iconStyle={
            style.flatten([
              "width-32",
              "height-32",
              "items-center",
              "justify-center",
            ]) as ViewStyle
          }
          containerStyle={{
            width: size * imageScale,
            height: size * imageScale,
          }}
        />
      )}
    </View>
  );
};
