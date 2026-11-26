import React from "react";
import { Text, View, StyleSheet, ViewStyle } from "react-native";
import { RenderNumber } from "components/new/animations/animated-number/render-number";
import { AddComma } from "components/new/animations/animated-number/add-comma";

interface Props {
  numberForAnimated: number;
  decimalAmount?: number;
  includeComma?: boolean;
  gap?: number;
  colorValue?: string;
  fontWeight?: string;
  fontSizeValue?: number;
  hookName: "withTiming" | "withSpring";
  containerStyle?: ViewStyle;
  withTimingProps?: {
    durationValue?: number;
    easingValue: string;
  };
  withSpringProps?: {
    mass?: number;
    damping?: number;
    stiffness?: number;
    restDisplacementThreshold?: number;
    overshootClamping?: boolean;
    restSpeedThreshold?: number;
  };
}

export function AnimatedNumber({
  numberForAnimated,
  decimalAmount = 1,
  includeComma = true,
  gap = 5,
  hookName = "withSpring",
  withTimingProps,
  withSpringProps,
  colorValue,
  fontSizeValue,
  fontWeight,
  containerStyle,
}: Props) {
  if (withTimingProps && withSpringProps) {
    throw new Error(
      "You can only set values for either withTimingProps or withSpringProps, not both."
    );
  }

  const numberString = numberForAnimated.toString(); // Convert the number to a string
  let numberArray = numberString.split(""); // Split the string into an array

  if (numberForAnimated < 1 && numberForAnimated > 0) {
    if (decimalAmount + 2 > numberArray.length) {
      // why + 2, because the zero and the comma.
      const numberLacks = decimalAmount + 2 - numberArray.length;
      for (let i = 0; i < numberLacks; i++) {
        numberArray.push("0");
      }
    }
  } else if (numberForAnimated >= 1) {
    if (numberForAnimated >= 1000 && includeComma === true) {
      const newArray = AddComma(numberForAnimated, numberArray, decimalAmount);
      numberArray = [...newArray];
    }
    // console.log(numberArray)
  }
  const heightContainer = fontSizeValue! || 70;

  return (
    <View
      style={[styles.container, { height: heightContainer }, containerStyle]}
    >
      {numberArray.map((numberSymbol, i) => {
        const validNumber = isNaN(+numberSymbol);
        return (
          <React.Fragment key={i}>
            {!validNumber ? (
              <View key={i}>
                <RenderNumber
                  gap={gap}
                  colorValue={colorValue || "red"}
                  fontSizeValue={fontSizeValue || 50}
                  numberSymbol={Number(numberSymbol)}
                  hookName={hookName}
                  fontWeight={fontWeight}
                  listProperties={
                    hookName === "withTiming"
                      ? {
                          durationValue: withTimingProps?.durationValue || 500,
                          easingValue: withTimingProps?.easingValue || "linear",
                        }
                      : {
                          mass: withSpringProps?.mass || 3,
                          damping: withSpringProps?.damping || 20,
                          stiffness: withSpringProps?.stiffness || 500,
                          restDisplacementThreshold:
                            withSpringProps?.restDisplacementThreshold || 0.01,
                          overshootClamping:
                            withSpringProps?.overshootClamping || false,
                          restSpeedThreshold:
                            withSpringProps?.restSpeedThreshold || 2,
                        }
                  }
                />
              </View>
            ) : (
              <Text
                style={[
                  styles.dot,
                  {
                    marginHorizontal: gap,
                    color: colorValue || "red",
                    fontSize: fontSizeValue || 50,
                    // includeFontPadding: false,
                    lineHeight: fontSizeValue! * 1.1,
                  },
                ]}
              >
                {numberSymbol}
              </Text>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    overflow: "hidden",
    justifyContent: "center",
  },
  animatedStyle: {},
  dot: {
    right: 0,
    margin: 0,
    padding: 0,
  },
});
