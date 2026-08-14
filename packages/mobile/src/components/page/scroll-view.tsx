import React, { forwardRef } from "react";
import {
  Animated,
  ScrollViewProps,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStyle } from "styles/index";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { usePageRegisterScrollYValue, useSetFocusedScreen } from "./utils";
import { BackgroundMode, ScreenBackground } from "./background";

const AnimatedKeyboardAwareScrollView = Animated.createAnimatedComponent(
  KeyboardAwareScrollView
);

export const PageWithScrollView = forwardRef<
  ScrollView,
  React.PropsWithChildren<
    ScrollViewProps & {
      fixed?: React.ReactNode;
      /** Stretch the fixed overlay with top/left/right/bottom 0 (avoids % height). */
      pinFixed?: boolean;
      disableSafeArea?: boolean;
      containerStyle?: ViewStyle;

      backgroundMode: BackgroundMode;
      hasFloatingHeader?: boolean;
      backgroundBlur?: boolean;
    }
  >
>((props, ref) => {
  const style = useStyle();

  useSetFocusedScreen();
  const scrollY = usePageRegisterScrollYValue();

  const {
    style: propStyle,
    fixed,
    pinFixed,
    onScroll,
    disableSafeArea,
    containerStyle,
    backgroundMode,
    backgroundBlur,
    hasFloatingHeader,
    ...restProps
  } = props;

  const containerStyleFlattened = StyleSheet.flatten([
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
  ]);

  const scrollBody = (
    <React.Fragment>
      <AnimatedKeyboardAwareScrollView
        innerRef={(_ref) => {
          if (ref) {
            // I don't know why the _ref's type is JSX.Element
            if (typeof ref === "function") {
              ref(_ref as any);
            } else {
              ref.current = _ref as any;
            }
          }
        }}
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
        showsVerticalScrollIndicator={false}
        {...restProps}
      />
      <View
        style={
          pinFixed
            ? ({
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              } as ViewStyle)
            : (style.flatten([
                "absolute",
                "width-full",
                "height-full",
              ]) as ViewStyle)
        }
        pointerEvents="box-none"
      >
        {fixed}
      </View>
    </React.Fragment>
  );

  return (
    <React.Fragment>
      <ScreenBackground
        backgroundMode={backgroundMode}
        backgroundBlur={backgroundBlur}
        hasFloatingHeader={hasFloatingHeader}
      />
      {disableSafeArea ? (
        <View style={containerStyleFlattened}>{scrollBody}</View>
      ) : (
        <SafeAreaView
          style={containerStyleFlattened}
          // Android edge-to-edge only: header already includes status-bar inset.
          // iOS keeps all edges (previous SafeAreaView behavior).
          {...(Platform.OS === "android"
            ? { edges: ["left", "right", "bottom"] as const }
            : {})}
        >
          {scrollBody}
        </SafeAreaView>
      )}
    </React.Fragment>
  );
});
PageWithScrollView.displayName = "PageWithScrollView";
