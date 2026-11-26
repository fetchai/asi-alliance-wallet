import React, { FunctionComponent, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";

import { IMemoConfig } from "@keplr-wallet/hooks";
import { removeEmojis } from "utils/format/format";
import { KeplrSignOptions } from "@keplr-wallet/types";
import { observer } from "mobx-react-lite";

export const MemoInputView: FunctionComponent<{
  label?: string;
  labelStyle?: ViewStyle;
  containerStyle?: ViewStyle;
  inputContainerStyle?: ViewStyle;
  placeholderText?: string;
  memoConfig: IMemoConfig;
  onFocus?: any;
  onBlur?: any;
  editable?: boolean;
  errorLabelStyle?: ViewStyle;
  error?: string;
  signOptions?: KeplrSignOptions;
}> = observer(
  ({
    label,
    labelStyle,
    containerStyle,
    inputContainerStyle,
    placeholderText,
    memoConfig,
    onFocus,
    onBlur,
    editable = true,
    error,
    errorLabelStyle,
    signOptions,
  }) => {
    const style = useStyle();
    const [isFocused, setIsFocused] = useState(false);
    const preferNoSetMemo = signOptions?.preferNoSetMemo ?? false;

    return (
      <View style={containerStyle}>
        {label ? (
          <Text
            style={
              [
                style.flatten(["padding-y-4", "color-white@60%", "margin-y-8"]),
                labelStyle,
              ] as ViewStyle
            }
          >
            {label}
          </Text>
        ) : null}
        <BlurBackground
          borderRadius={12}
          blurIntensity={16}
          containerStyle={
            [
              style.flatten(
                ["padding-x-18", "padding-y-12", "flex-row"],
                isFocused || error
                  ? [
                      // The order is important.
                      // The border color has different priority according to state.
                      // The more in front, the lower the priority.
                      "border-width-1",
                      isFocused ? "border-color-indigo" : undefined,
                      error ? "border-color-red-250" : undefined,
                    ]
                  : []
              ),
              inputContainerStyle,
              // { paddingVertical: 9 },
            ] as ViewStyle
          }
        >
          <View style={style.flatten(["flex-3"]) as ViewStyle}>
            <TextInput
              placeholderTextColor={style.flatten(["color-gray-200"]).color}
              style={
                [
                  style.flatten(["body3", "color-white", "padding-0"]),
                  Platform.select({
                    ios: {},
                    android: {
                      // On android, the text input's height does not equals to the line height by strange.
                      // To fix this problem, set the height explicitly.
                      height: 19,
                    },
                  }),
                ] as ViewStyle
              }
              keyboardType={
                Platform.OS === "ios" ? "ascii-capable" : "visible-password"
              }
              returnKeyType="done"
              placeholder={
                preferNoSetMemo && memoConfig.memo.length == 0
                  ? "(Empty memo)"
                  : placeholderText
              }
              value={memoConfig.memo}
              onChangeText={(text: string) => {
                memoConfig.setMemo(removeEmojis(text));
              }}
              maxLength={100}
              editable={editable || !preferNoSetMemo}
              onFocus={(e) => {
                setIsFocused(true);

                if (onFocus) {
                  onFocus(e);
                }
              }}
              onBlur={(e) => {
                setIsFocused(false);

                if (onBlur) {
                  onBlur(e);
                }
              }}
            />
          </View>
        </BlurBackground>
        {error ? (
          <View>
            <Text
              style={StyleSheet.flatten([
                style.flatten([
                  // "absolute",
                  "text-caption2",
                  "color-red-250",
                  "margin-top-2",
                ]) as ViewStyle,
                errorLabelStyle,
              ])}
            >
              {error}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
);
