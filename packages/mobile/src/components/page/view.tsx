import React, { FunctionComponent } from "react";
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackgroundMode, ScreenBackground } from "./background";
import { useStyle } from "styles/index";
import { useSetFocusedScreen } from "components/page/utils";

export const PageWithView: FunctionComponent<
  ViewProps & {
    disableSafeArea?: boolean;
    backgroundMode: BackgroundMode;
    backgroundBlur?: boolean;
    hasFloatingHeader?: boolean;
  }
> = (props) => {
  const style = useStyle();

  useSetFocusedScreen();

  const {
    style: propStyle,
    disableSafeArea,
    backgroundMode,
    backgroundBlur = false,
    hasFloatingHeader,
    ...restProps
  } = props;

  return (
    <React.Fragment>
      <ScreenBackground
        backgroundMode={backgroundMode}
        backgroundBlur={backgroundBlur}
        hasFloatingHeader={hasFloatingHeader}
      />
      {!disableSafeArea ? (
        <SafeAreaView
          style={style.get("flex-1")}
          {...(Platform.OS === "android"
            ? { edges: ["left", "right", "bottom"] as const }
            : {})}
        >
          <View
            style={StyleSheet.flatten([
              style.flatten([
                "flex-1",
                "padding-0",
                "overflow-visible",
              ]) as ViewStyle,
              propStyle,
            ])}
            {...restProps}
          />
        </SafeAreaView>
      ) : (
        <View
          style={StyleSheet.flatten([
            style.flatten([
              "flex-1",
              "padding-0",
              "overflow-visible",
            ]) as ViewStyle,
            propStyle,
          ])}
          {...restProps}
        />
      )}
    </React.Fragment>
  );
};
