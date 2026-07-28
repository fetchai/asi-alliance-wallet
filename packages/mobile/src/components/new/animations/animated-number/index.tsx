import React from "react";
import { Text, View, ViewStyle } from "react-native";
import { RenderNumber } from "components/new/animations/animated-number/render-number";
import { AddComma } from "components/new/animations/animated-number/add-comma";
import { useStyle } from "styles/index";

interface Props {
  numberForAnimated: number;
  decimalAmount?: number;
  includeComma?: boolean;
  fontSizeValue?: number;
  textColor?: string;
  hookName: "withTiming" | "withSpring";
  containerStyle?: ViewStyle;
  comaStyle?: ViewStyle;
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
  hookName = "withSpring",
  withTimingProps,
  withSpringProps,
  fontSizeValue = 50,
  textColor = "white",
  containerStyle,
  comaStyle,
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
      // Add zeros if decimal precision is not met
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
  }

  const style = useStyle();
  const lineHeight = fontSizeValue * 1.0;

  return (
    <View
      style={
        [
          style.flatten(["flex-row", "justify-center", "overflow-hidden"]),
          containerStyle,
        ] as ViewStyle
      }
    >
      {numberArray.map((numberSymbol, i) => {
        const isNonNumeric = isNaN(+numberSymbol);
        return (
          <React.Fragment key={i}>
            {!isNonNumeric ? (
              <RenderNumber
                fontSizeValue={fontSizeValue}
                numberSymbol={Number(numberSymbol)}
                hookName={hookName}
                containerStyle={containerStyle}
                textColor={textColor}
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
            ) : (
              <Text
                style={
                  [
                    style.flatten(["font-normal", "overflow-hidden"]),
                    {
                      color: textColor,
                      fontSize: fontSizeValue,
                      lineHeight: lineHeight,
                    },
                    comaStyle,
                  ] as ViewStyle
                }
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
