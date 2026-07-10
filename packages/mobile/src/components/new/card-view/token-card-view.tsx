import React, { FunctionComponent, ReactElement } from "react";
import { View, Text, ViewStyle, TouchableOpacity } from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { IconButton } from "components/new/button/icon";

export const TokenCardView: FunctionComponent<{
  containerStyle?: ViewStyle;
  titleStyle?: ViewStyle;
  leadingIcon?: ReactElement;
  title: string;
  subtitle?: string;
  trailingStart?: string;
  trailingEnd?: string;
  onPress?: () => void;
  bottomContent?: ReactElement | null;
  bottomContentStyle?: ViewStyle;
}> = ({
  leadingIcon,
  title,
  subtitle,
  onPress,
  trailingStart,
  trailingEnd,
  containerStyle,
  titleStyle,
  bottomContent,
  bottomContentStyle,
}) => {
  const style = useStyle();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
      <BlurBackground
        borderRadius={12}
        backgroundBlur={false}
        containerStyle={
          [
            style.flatten([
              "padding-18",
              "justify-center",
              "background-color-gray-5",
            ]),
            containerStyle,
          ] as ViewStyle
        }
      >
        <View
          style={
            style.flatten([
              "flex-row",
              "items-center",
              "justify-between",
            ]) as ViewStyle
          }
        >
          <View
            style={
              style.flatten(["flex-row", "items-center", "flex-3"]) as ViewStyle
            }
          >
            {leadingIcon && (
              <IconButton icon={leadingIcon} backgroundBlur={false} />
            )}
            <View style={style.flatten(["margin-left-10"]) as ViewStyle}>
              <View
                style={style.flatten(["flex-row", "flex-wrap"]) as ViewStyle}
              >
                <Text
                  style={
                    [
                      style.flatten(["body3", "padding-2", "color-dark"]),
                      titleStyle,
                    ] as ViewStyle
                  }
                >
                  {title}
                </Text>
              </View>
              {subtitle && (
                <Text
                  style={
                    style.flatten([
                      "body3",
                      "padding-2",
                      "color-gray-200",
                    ]) as ViewStyle
                  }
                >
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
          {(trailingStart || trailingEnd) && (
            <View
              style={
                style.flatten([
                  "flex-row",
                  "justify-end",
                  "flex-wrap",
                  "flex-2",
                ]) as ViewStyle
              }
            >
              {trailingStart && (
                <Text
                  style={
                    style.flatten([
                      "body3",
                      "color-dark",
                      "font-medium",
                    ]) as ViewStyle
                  }
                >
                  {trailingStart}
                </Text>
              )}
              {trailingEnd && (
                <Text
                  style={
                    style.flatten([
                      "body3",
                      "color-gray-300",
                      "font-medium",
                      "margin-left-4",
                    ]) as ViewStyle
                  }
                >
                  {trailingEnd}
                </Text>
              )}
            </View>
          )}
        </View>
        {bottomContent && (
          <View
            style={
              [
                style.flatten(["flex-row", "margin-top-16"]),
                bottomContentStyle,
              ] as ViewStyle
            }
          >
            {bottomContent}
          </View>
        )}
      </BlurBackground>
    </TouchableOpacity>
  );
};
