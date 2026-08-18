import React, { FunctionComponent } from "react";
import { BlurView } from "expo-blur";
import { View, ViewStyle, TouchableOpacity } from "react-native";

export const BlurBackground: FunctionComponent<{
  borderRadius?: number;
  blurIntensity?: number;
  backgroundBlur?: boolean;
  containerStyle?: ViewStyle;
  onPress?: () => void;
  blurType?: "extraLight" | "dark";
}> = ({
  borderRadius = 32,
  blurIntensity = 30,
  backgroundBlur = true,
  blurType = "extraLight",
  containerStyle,
  onPress,
  children,
}) => {
  const containerStyleMerged = [
    { borderRadius, overflow: "hidden" as const },
    containerStyle,
  ];

  const content = backgroundBlur ? (
    <BlurView
      intensity={blurIntensity}
      tint={blurType}
      style={containerStyleMerged}
    >
      {children}
    </BlurView>
  ) : (
    <View style={containerStyleMerged}>{children}</View>
  );

  return onPress ? (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
};
