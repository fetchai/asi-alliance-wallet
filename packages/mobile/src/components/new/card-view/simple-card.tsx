import React, { FunctionComponent, ReactElement } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { LinearGradientText } from "react-native-linear-gradient-text";

export type HeadingMode = "normal" | "gradient";

export const SimpleCardView: FunctionComponent<{
  trailingIconComponent?: ReactElement | (() => ReactElement);
  leadingIconComponent?: ReactElement | (() => ReactElement);
  mainHeading?: string;
  heading: string;
  headingStyle?: ViewStyle;
  headingMode?: HeadingMode;
  subHeading?: string;
  cardStyle?: ViewStyle;
  leadingIconStyle?: ViewStyle;
  trailingIconStyle?: ViewStyle;
  text?: string;
  backgroundBlur?: boolean;
  onPress?: () => void;
}> = ({
  trailingIconComponent,
  leadingIconComponent,
  mainHeading,
  heading,
  headingStyle,
  headingMode = "normal",
  backgroundBlur = true,
  subHeading,
  cardStyle,
  leadingIconStyle,
  trailingIconStyle,
  onPress,
}) => {
  const style = useStyle();

  return (
    <React.Fragment>
      {mainHeading ? (
        <Text
          style={
            style.flatten([
              "text-button3",
              "padding-4",
              "color-gray-200",
            ]) as ViewStyle
          }
        >
          {mainHeading}
        </Text>
      ) : null}

      <BlurBackground
        borderRadius={12}
        blurIntensity={16}
        backgroundBlur={backgroundBlur}
        onPress={onPress}
        containerStyle={
          [
            style.flatten([
              "flex-row",
              "padding-x-18",
              "padding-y-12",
              "items-center",
            ]),
            cardStyle,
          ] as ViewStyle
        }
      >
        {leadingIconComponent ? (
          <View
            style={
              [
                style.flatten(["items-start", "margin-right-12"]),
                leadingIconStyle,
              ] as ViewStyle
            }
          >
            {leadingIconComponent}
          </View>
        ) : null}
        <View style={style.flatten(["flex-8"]) as ViewStyle}>
          {headingMode === "normal" ? (
            <Text
              style={
                [
                  style.flatten(["h6", "color-white", "font-normal"]),
                  headingStyle,
                ] as ViewStyle
              }
            >
              {heading}
            </Text>
          ) : (
            <LinearGradientText
              colors={["#F9774B", "#CF447B"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              text={heading}
              textStyle={
                [style.flatten(["h7", "padding-4"]), headingStyle] as ViewStyle
              }
            />
          )}
          {subHeading ? (
            <Text
              style={
                style.flatten([
                  "text-caption1",
                  "padding-4",
                  "color-gray-200",
                ]) as ViewStyle
              }
            >
              {subHeading}
            </Text>
          ) : null}
        </View>
        {trailingIconComponent ? (
          <View
            style={
              [
                style.flatten(["flex-1", "items-end"]),
                trailingIconStyle,
              ] as ViewStyle
            }
          >
            {trailingIconComponent}
          </View>
        ) : null}
      </BlurBackground>
    </React.Fragment>
  );
};
