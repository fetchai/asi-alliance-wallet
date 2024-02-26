import React, { FunctionComponent, ReactElement } from "react";
import { Text, ViewStyle, View } from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";

export const BlurButton: FunctionComponent<{
  containerStyle?: ViewStyle;
  textStyle?: ViewStyle;
  leftIconStyle?: ViewStyle;
  rightIconStyle?: ViewStyle;
  backgroundBlur?: boolean;
  blurIntensity?: number;
  borderRadius?: number;
  blurType?: "extraLight" | "dark";
  onPress?: () => void;
  disable?: boolean;
  text: string;
  leftIcon?: ReactElement | null;
  rightIcon?: ReactElement | null;
}> = ({
  containerStyle,
  textStyle,
  backgroundBlur = true,
  text,
  blurIntensity = 30,
  borderRadius = 8,
  blurType,
  onPress,
  disable,
  leftIcon,
  rightIcon,
  leftIconStyle,
  rightIconStyle,
}) => {
  const style = useStyle();
  return (
    <BlurBackground
      borderRadius={borderRadius}
      backgroundBlur={backgroundBlur}
      blurIntensity={!disable ? blurIntensity : 15}
      blurType={blurType}
      onPress={disable ? undefined : onPress}
      containerStyle={
        [
          style.flatten(["flex-row", "items-center"]),
          containerStyle,
        ] as ViewStyle
      }
    >
      {leftIcon ? (
        <View
          style={
            [style.flatten(["margin-right-6"]), leftIconStyle] as ViewStyle
          }
        >
          {leftIcon}
        </View>
      ) : null}
      <Text
        style={[
          style.flatten([
            "color-white",
            "font-bold",
            "margin-y-6",
            "h6",
          ]) as ViewStyle,
          textStyle,
        ]}
      >
        {text}
      </Text>
      {rightIcon ? (
        <View
          style={
            [style.flatten(["margin-left-6"]), rightIconStyle] as ViewStyle
          }
        >
          {rightIcon}
        </View>
      ) : null}
    </BlurBackground>
  );
};
