import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Platform, Text, TextStyle, ViewStyle, View } from "react-native";
import {
  EmptyAmountError,
  IAmountConfig,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
} from "@keplr-wallet/hooks";
import * as RNLocalize from "react-native-localize";
import { InputCardView } from "../card-view/input-card";
import { parseDollarAmount } from "utils/format/format";
import { useStyle } from "styles/index";
import { CardDivider } from "components/card";
import { useStore } from "stores/index";
import { CoinPretty, Dec, DecUtils, Int } from "@keplr-wallet/unit";

export const StakeAmountInput: FunctionComponent<{
  labelStyle?: TextStyle;
  containerStyle?: ViewStyle;
  inputContainerStyle?: ViewStyle;
  errorLabelStyle?: TextStyle;
  label: string;
  isToggleClicked: boolean;
  editable?: boolean;

  amountConfig: IAmountConfig;
}> = observer(
  ({
    labelStyle,
    containerStyle,
    inputContainerStyle,
    errorLabelStyle,
    label,
    amountConfig,
    isToggleClicked,
    editable = true,
  }) => {
    const style = useStyle();
    const { priceStore } = useStore();
    const [inputInUsd, setInputInUsd] = useState<string | undefined>("");

    const error = amountConfig.error;
    const errorText: string | undefined = useMemo(() => {
      if (error) {
        switch (error.constructor) {
          case EmptyAmountError:
            // No need to show the error to user.
            return;
          case InvalidNumberAmountError:
            return "Invalid number";
          case ZeroAmountError:
            return "Amount is zero";
          case NegativeAmountError:
            return "Amount is negative";
          case InsufficientAmountError:
            return "Insufficient fund";
          default:
            return "Unknown error";
        }
      }
    }, [error]);

    const validateDecimalNumber = (input: string) => {
      // Use the match() method with a regular expression
      const isDecimal = input.match(/^\d*\.?\d*$/);

      // Return true if it's a valid decimal number, otherwise return false
      return isDecimal !== null;
    };

    const convertToUsd = (currency: any) => {
      const value = priceStore.calculatePrice(currency);
      return value && value.shrink(true).maxDecimals(6).toString();
    };

    useEffect(() => {
      const currencyDecimals = amountConfig.sendCurrency.coinDecimals;

      let dec = new Dec(amountConfig.amount ? amountConfig.amount : "0");
      dec = dec.mul(DecUtils.getTenExponentNInPrecisionRange(currencyDecimals));
      const amountInNumber = dec.truncate().toString();
      const inputValue = new CoinPretty(
        amountConfig.sendCurrency,
        new Int(amountInNumber)
      );
      const inputValueInUsd = convertToUsd(inputValue);
      setInputInUsd(inputValueInUsd);
    }, [amountConfig.amount]);

    return (
      <InputCardView
        label={label}
        labelStyle={labelStyle}
        placeholder={"0"}
        editable={editable}
        containerStyle={containerStyle}
        inputContainerStyle={inputContainerStyle}
        errorLabelStyle={errorLabelStyle}
        value={
          isToggleClicked
            ? parseDollarAmount(inputInUsd).toString()
            : amountConfig.amount
        }
        onChangeText={(value: string) => {
          if (validateDecimalNumber(value)) {
            if (value !== "0") {
              // Remove leading zeros
              for (let i = 0; i < value.length; i++) {
                if (value[i] === "0" && value[i + 1] !== ".") {
                  value = value.replace("0", "");
                } else {
                  break;
                }
              }
            }
            isToggleClicked
              ? parseDollarAmount(inputInUsd)
              : amountConfig.setAmount(value);
          }
        }}
        maxLength={20}
        rightIcon={
          <View
            style={style.flatten(["flex-row", "items-center"]) as ViewStyle}
          >
            <CardDivider
              vertical={true}
              style={style.flatten(["height-12", "margin-top-4"]) as ViewStyle}
            />
            <Text
              style={
                style.flatten([
                  "body3",
                  "color-white@60%",
                  "margin-left-8",
                ]) as ViewStyle
              }
            >
              {isToggleClicked
                ? priceStore.defaultVsCurrency.toUpperCase()
                : amountConfig.sendCurrency.coinDenom}
            </Text>
          </View>
        }
        error={errorText}
        keyboardType={(() => {
          if (Platform.OS === "ios") {
            // In IOS, the numeric type keyboard has a decimal separator "." or "," depending on the language and region of the user device.
            // However, asset input in keplr unconditionally follows the US standard, so it must be ".".
            // However, if only "," appears on the keyboard, "." cannot be entered.
            // In this case, it is inevitable to use a different type of keyboard.
            if (RNLocalize.getNumberFormatSettings().decimalSeparator !== ".") {
              return "numbers-and-punctuation";
            }
            return "numeric";
          } else {
            // In Android, the numeric type keyboard has both "." and ",".
            // So, there is no need to use other keyboard type on any case.
            return "numeric";
          }
        })()}
      />
    );
  }
);
