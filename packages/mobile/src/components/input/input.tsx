import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput as NativeTextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useStyle } from "styles/index";

export const TextInput = React.forwardRef<
  NativeTextInput,
  React.ComponentProps<typeof NativeTextInput> & {
    labelStyle?: TextStyle;
    containerStyle?: ViewStyle;
    inputContainerStyle?: ViewStyle;
    innerInputContainerStyle?: ViewStyle;
    errorLabelStyle?: TextStyle;

    label?: string;
    error?: string;

    paragraph?: React.ReactNode;

    topInInputContainer?: React.ReactNode;
    bottomInInputContainer?: React.ReactNode;

    inputLeft?: React.ReactNode;
    inputRight?: React.ReactNode;
  }
>((props, ref) => {
  const [isFocused, setIsFocused] = useState(false);

  const {
    style: propsStyle,
    labelStyle,
    containerStyle,
    inputContainerStyle,
    innerInputContainerStyle,
    errorLabelStyle,
    label,
    error,
    paragraph,
    topInInputContainer,
    bottomInInputContainer,
    inputLeft,
    inputRight,

    onBlur,
    onFocus,
    ...restProps
  } = props;

  const style = useStyle();

  return (
    <View
      style={StyleSheet.flatten([
        style.flatten(["padding-bottom-28"]) as ViewStyle,
        containerStyle,
      ])}
    >
      {label ? (
        <Text
          style={StyleSheet.flatten([
            style.flatten([
              "subtitle3",
              "color-text-label",
              "margin-bottom-3",
            ]) as ViewStyle,
            labelStyle,
          ])}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={StyleSheet.flatten([
          style.flatten(
            [
              "background-color-transparent",
              "border-color-gray-200",
              "padding-x-15",
              "padding-y-20",
              "border-radius-12",
              "border-width-1",
              "border-color-gray-100@50%",
              "dark:border-color-platinum-600@50%",
            ],
            [
              // The order is important.
              // The border color has different priority according to state.
              // The more in front, the lower the priority.
              isFocused ? "border-color-gray-200" : undefined,
              isFocused ? "dark:border-color-platinum-100" : undefined,
              error ? "border-color-red-200" : undefined,
              error ? "dark:border-color-red-250" : undefined,
              !(props.editable ?? true) && "background-color-gray-50",
              !(props.editable ?? true) && "dark:background-color-platinum-500",
            ]
          ) as ViewStyle,
          inputContainerStyle,
        ])}
      >
        {topInInputContainer}
        <View
          style={[
            style.flatten(["flex-row", "items-center"]),
            innerInputContainerStyle,
          ]}
        >
          {inputLeft}
          <NativeTextInput
            placeholderTextColor={
              props.placeholderTextColor ??
              style.flatten(
                ["color-white@60%"],
                [!(props.editable ?? true) && "dark:color-platinum-200"]
              ).color
            }
            style={StyleSheet.flatten([
              style.flatten(
                [
                  "padding-0",
                  "body2-in-text-input",
                  "color-gray-200",
                  "dark:color-platinum-50",
                  "flex-1",
                ],
                [!(props.editable ?? true) && "color-gray-300"]
              ),
              Platform.select({
                ios: {},
                android: {
                  // On android, the text input's height does not equals to the line height by strange.
                  // To fix this problem, set the height explicitly.
                  height: 19,
                },
              }),
              propsStyle,
            ])}
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
          {inputRight}
        </View>
        {bottomInInputContainer}
      </View>
      {paragraph && !error ? (
        typeof paragraph === "string" ? (
          <View>
            <Text
              style={StyleSheet.flatten([
                style.flatten([
                  "absolute",
                  "text-caption2",
                  "color-blue-400",
                  "dark:color-blue-300",
                  "margin-top-2",
                  "margin-left-4",
                ]) as ViewStyle,
                errorLabelStyle,
              ])}
            >
              {paragraph}
            </Text>
          </View>
        ) : (
          paragraph
        )
      ) : null}
      {error ? (
        <View>
          <Text
            style={StyleSheet.flatten([
              style.flatten([
                "absolute",
                "text-caption2",
                "color-red-250",
                "margin-top-2",
                "margin-left-4",
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
});
TextInput.displayName = "TextInput";
