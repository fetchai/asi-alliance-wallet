import React from "react";
import { Text, View, ViewStyle } from "react-native";
import Animated, {
  withSpring,
  withTiming,
  useSharedValue,
  useAnimatedStyle,
  Easing,
  ReduceMotion,
} from "react-native-reanimated";
import { useStyle } from "styles/index";

interface RenderNumberProps {
  numberSymbol: number;
  fontSizeValue?: number;
  hookName: string;
  containerStyle?: ViewStyle;
  textColor?: string;
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
  hookName,
  listProperties,
  fontSizeValue = 50,
  containerStyle,
  textColor = "white",
}: RenderNumberProps) {
  const heightChange = fontSizeValue;
  const initialY = useSharedValue(0);
  const negativeTranslateY = -(initialY.value + numberSymbol * heightChange);
  const easingValue = listProperties.easingValue || "linear";
  const style = useStyle();

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
    <View
      style={
        [
          style.flatten(["flex-row", "justify-center", "overflow-hidden"]),
          { height: fontSizeValue * 1.0 },
          containerStyle,
        ] as ViewStyle
      }
    >
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
                [
                  style.flatten(["font-normal", "overflow-hidden"]),
                  {
                    color: textColor,
                    lineHeight: fontSizeValue * 1.0,
                    fontSize: fontSizeValue,
                    height: fontSizeValue,
                  },
                ] as ViewStyle
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
