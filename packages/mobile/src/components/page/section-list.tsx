import React, { FunctionComponent } from "react";
import {
  Animated,
  Platform,
  SectionListProps,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStyle } from "styles/index";
import { KeyboardAwareSectionList } from "react-native-keyboard-aware-scroll-view";
import { usePageRegisterScrollYValue, useSetFocusedScreen } from "./utils";
import { BackgroundMode, ScreenBackground } from "./background";

const AnimatedKeyboardAwareSectionList = Animated.createAnimatedComponent(
  KeyboardAwareSectionList
);

export const PageWithSectionList: FunctionComponent<
  SectionListProps<any, any> & {
    containerStyle?: ViewStyle;
    backgroundMode: BackgroundMode;
    hasFloatingHeader?: boolean;
  }
> = (props) => {
  const style = useStyle();

  useSetFocusedScreen();
  const scrollY = usePageRegisterScrollYValue();

  const {
    style: propStyle,
    onScroll,
    containerStyle,
    backgroundMode,
    indicatorStyle,
    hasFloatingHeader,
    ...restProps
  } = props;

  return (
    <React.Fragment>
      <ScreenBackground
        backgroundMode={backgroundMode}
        hasFloatingHeader={hasFloatingHeader}
      />
      <SafeAreaView
        {...(Platform.OS === "android"
          ? { edges: ["left", "right", "bottom"] as const }
          : {})}
        style={StyleSheet.flatten([
          style.flatten(
            ["flex-1"],
            /*
               In android, overflow of container view is hidden by default.
               That's why even if you make overflow visible to the scroll view's style, it will behave like hidden unless you change the overflow property of this container view.
               This is done by the following reasons.
                  - On Android, header or bottom tabbars are opaque by default, so overflow hidden is usually not a problem.
                  - Bug where overflow visible is ignored for unknown reason if ScrollView has RefreshControl .
                  - If the overflow of the container view is not hidden, even if the overflow of the scroll view is hidden, there is a bug that the refresh control created from above still appears outside the scroll view.
               */
            [Platform.OS !== "ios" && "overflow-hidden"]
          ),
          containerStyle,
        ])}
      >
        <AnimatedKeyboardAwareSectionList
          style={StyleSheet.flatten([
            style.flatten([
              "flex-1",
              "padding-0",
              "overflow-visible",
            ]) as ViewStyle,
            propStyle,
          ])}
          keyboardOpeningTime={0}
          onScroll={Animated.event(
            [
              {
                nativeEvent: { contentOffset: { y: scrollY } },
              },
            ],
            { useNativeDriver: true, listener: onScroll }
          )}
          indicatorStyle={
            indicatorStyle ?? style.theme === "dark" ? "white" : "black"
          }
          {...restProps}
        />
      </SafeAreaView>
    </React.Fragment>
  );
};
