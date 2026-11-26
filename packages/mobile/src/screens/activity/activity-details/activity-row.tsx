import { useStyle } from "styles/index";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import React from "react";
import { RectButton } from "components/rect-button";
import { useSimpleTimer } from "hooks/use-simple-timer";
import LottieView from "lottie-react-native";
import * as Clipboard from "expo-clipboard";
import { CopyIcon } from "components/new/icon/copy-icon";

export const DetailRow = ({
  label,
  value,
  hash,
}: {
  label: string;
  value: any;
  hash?: string | undefined;
}) => {
  const style = useStyle();
  const { isTimedOut, setTimer } = useSimpleTimer();

  return (
    <View
      style={
        style.flatten(["flex-row", "items-center", "padding-16"]) as ViewStyle
      }
    >
      <View style={style.flatten(["flex-2"]) as ViewStyle}>
        <Text style={style.flatten(["color-white"]) as ViewStyle}>{label}</Text>
      </View>
      <RectButton
        style={StyleSheet.flatten([
          style.flatten(["flex-row", "flex-3", "justify-end"]) as ViewStyle,
        ])}
        onPress={
          hash
            ? async () => {
                await Clipboard.setStringAsync(hash);
                setTimer(2000);
              }
            : undefined
        }
        rippleColor={style.flatten(["color-white-transparent-100"]).color}
        underlayColor={style.flatten(["color-white-transparent-100"]).color}
        activeOpacity={1}
      >
        {hash && (
          <View
            style={style.flatten(["margin-right-4", "width-20"]) as ViewStyle}
          >
            {isTimedOut ? (
              <View style={style.flatten(["margin-right-2"]) as ViewStyle}>
                <View
                  style={style.flatten(["width-16", "height-16"]) as ViewStyle}
                >
                  <View
                    style={StyleSheet.flatten([
                      style.flatten([
                        "absolute",
                        "justify-center",
                        "items-center",
                      ]),
                      {
                        left: 0,
                        right: 4,
                        top: 0,
                        bottom: 0,
                      },
                    ])}
                  >
                    <LottieView
                      // TODO: Change color of animated check button according to theme.
                      source={require("assets/lottie/check.json")}
                      colorFilters={[
                        {
                          keypath: "Shape Layer 2",
                          color: style.flatten(["color-gray-200"]).color,
                        },
                        {
                          keypath: "Shape Layer 1",
                          color: style.flatten(["color-gray-300"]).color,
                        },
                        {
                          keypath: "Layer 1 Outlines",
                          color: style.flatten(["color-white"]).color,
                        },
                      ]}
                      autoPlay
                      speed={2}
                      loop={false}
                      style={
                        style.flatten(["width-58", "height-58"]) as ViewStyle
                      }
                    />
                  </View>
                </View>
              </View>
            ) : (
              <CopyIcon size={15} />
            )}
          </View>
        )}
        <Text
          style={style.flatten(["color-gray-200", "text-right"]) as ViewStyle}
        >
          {value}
        </Text>
      </RectButton>
    </View>
  );
};
