import React, { ReactElement, useState } from "react";
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
import { removeEmojis } from "utils/format/format";

interface InputCardViewProps extends React.ComponentProps<typeof TextInput> {
  label?: string;
  labelStyle?: ViewStyle;
  containerStyle?: ViewStyle;
  inputContainerStyle?: ViewStyle;
  errorLabelStyle?: ViewStyle;
  inputStyle?: ViewStyle;
  placeholderText?: string;
  value?: any;
  rightIcon?: ReactElement;
  error?: string;
  errorMassageShow?: boolean;
  paragraph?: React.ReactNode;
}

export const InputCardView = React.forwardRef<TextInput, InputCardViewProps>(
  (props, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const {
      keyboardType,
      label,
      labelStyle,
      containerStyle,
      inputContainerStyle,
      errorLabelStyle,
      inputStyle,
      rightIcon,
      error,
      paragraph,
      onBlur,
      onFocus,
      errorMassageShow = true,
      onChangeText,
      ...restProps
    } = props;
    const style = useStyle();

    return (
      <View style={containerStyle}>
        {label && (
          <Text
            style={
              [
                style.flatten(["color-white@60%", "margin-y-12", "body3"]),
                labelStyle,
              ] as ViewStyle
            }
          >
            {label}
          </Text>
        )}
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
                      !(props.editable ?? true) && "background-color-gray-50",
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
              keyboardType={
                keyboardType ??
                (Platform.OS === "ios" ? "ascii-capable" : "visible-password")
              }
              placeholderTextColor={style.flatten(["color-white@60%"]).color}
              onChangeText={(text) => {
                if (onChangeText) {
                  onChangeText(removeEmojis(text));
                }
              }}
              style={
                [
                  style.flatten([
                    "body3",
                    "color-white",
                    "padding-0",
                    "justify-center",
                  ]),
                  inputStyle,
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
              returnKeyType="done"
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
              {...restProps}
              ref={ref}
            />
          </View>
          {rightIcon && (
            <View
              style={
                style.flatten(["items-end", "justify-center"]) as ViewStyle
              }
            >
              {rightIcon}
            </View>
          )}
        </BlurBackground>
        {paragraph && !error ? (
          typeof paragraph === "string" ? (
            <Text
              style={StyleSheet.flatten([
                style.flatten([
                  "absolute",
                  "text-caption2",
                  "color-gray-300",
                  "margin-top-2",
                  "margin-left-4",
                ]) as ViewStyle,
                errorLabelStyle,
              ])}
            >
              {paragraph}
            </Text>
          ) : (
            paragraph
          )
        ) : null}
        {errorMassageShow ? (
          error ? (
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
          ) : null
        ) : null}
      </View>
    );
  }
);

InputCardView.displayName = "InputCardView";
