import React from "react";
import { Text, View, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  withSpring,
  withTiming,
  useSharedValue,
  useAnimatedStyle,
  Easing,
  ReduceMotion,
} from "react-native-reanimated";

interface RenderNumberProps {
  numberSymbol: number;
  gap: number;
  colorValue?: string;
  fontSizeValue?: number;
  hookName: string;
  fontWeight?: string;
  listProperties: {
    durationValue?: number;
    easingValue?: string;
    mass?: number;
    damping?: number;
    stiffness?: number;
    restDisplacementThreshold?: number;
    overshootClamping?: boolean;
    restSpeedThreshold?: number;
  };
}

const easingLists = {
  linear: Easing.linear,
  ease: Easing.ease,
  bounce: Easing.bounce,
  poly: Easing.poly(4),
  circle: Easing.circle,
  bezier: Easing.bezier(0.25, 0.1, 0.25, 1),
};
const NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export function RenderNumber({
  numberSymbol,
  gap,
  hookName,
  listProperties,
  colorValue,
  fontSizeValue,
  fontWeight,
}: RenderNumberProps) {
  const heightChange = fontSizeValue || 50;
  const initialY = useSharedValue(0);
  const negativeTranslateY = -(initialY.value + numberSymbol * heightChange);
  const easingValue =
    listProperties.easingValue !== undefined
      ? listProperties.easingValue
      : "linear";
  const animatedStylesTiming = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: withTiming(negativeTranslateY, {
            duration: listProperties.durationValue,
            easing: easingLists[easingValue as keyof typeof easingLists],
          }),
        },
      ],
    };
  });
  const animatedStylesSpring = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: withSpring(negativeTranslateY, {
          mass: listProperties.mass,
          damping: listProperties.damping,
          stiffness: listProperties.stiffness,
          restDisplacementThreshold: listProperties.restDisplacementThreshold,
          overshootClamping: listProperties.overshootClamping,
          restSpeedThreshold: listProperties.restSpeedThreshold,
          reduceMotion: ReduceMotion.System,
        }),
      },
    ],
  }));

  return (
    <View style={styles.container}>
      <Animated.View
        style={
          hookName === "withSpring"
            ? animatedStylesSpring
            : animatedStylesTiming
        }
      >
        {NUMBERS.map((numberCharacter, i) => {
          return (
            <Text
              key={i}
              style={
                {
                  color: colorValue,
                  fontSize: fontSizeValue,
                  height: fontSizeValue,
                  marginHorizontal: gap,
                  fontWeight: fontWeight ? fontWeight : "normal",
                  // includeFontPadding: false,
                  lineHeight: fontSizeValue! * 1.1,
                } as ViewStyle
              }
            >
              {numberCharacter}
            </Text>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});
