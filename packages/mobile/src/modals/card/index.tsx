import { IconButton } from "components/new/button/icon";
import { XmarkIcon } from "components/new/icon/xmark";
import React, { FunctionComponent } from "react";
import { Dimensions, StyleSheet, Text, View, ViewStyle } from "react-native";
import Modal from "react-native-modal";
import { useStyle } from "styles/index";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

export const CardModal: FunctionComponent<{
  isOpen: boolean;
  title?: string;
  close?: () => void;
  showCloseButton?: boolean;
  childrenContainerStyle?: ViewStyle;
  cardStyle?: ViewStyle;
  titleStyle?: ViewStyle;
  disableGesture?: boolean;
}> = ({
  isOpen,
  title,
  close,
  showCloseButton = true,
  children,
  childrenContainerStyle,
  cardStyle,
  titleStyle,
}) => {
  const style = useStyle();
  const windowHeight = Dimensions.get("window").height;

  return (
    <Modal
      testID={"modal"}
      isVisible={isOpen}
      style={{
        justifyContent: "flex-end",
        margin: 0,
      }}
      onBackButtonPress={close}
      onBackdropPress={close}
      animationIn={"slideInUp"}
      animationOut={"slideOutDown"}
      animationInTiming={500}
      animationOutTiming={500}
      backdropColor={style.get("color-indigo-backdrop").color}
    >
      <GestureHandlerRootView style={{flex:1, justifyContent: "flex-end"}}>
        <View
          style={[
            StyleSheet.flatten([
              style.flatten([
                "background-color-indigo-900",
                "border-radius-top-left-32",
                "border-radius-top-right-32",
                "overflow-hidden",
              ]),
            ]) as ViewStyle,
            {
              maxHeight: windowHeight - 24,
            },
            cardStyle,
          ]}
        >
          {title || showCloseButton ? (
            <View
              style={
                style.flatten([
                  "flex-row",
                  "items-center",
                  "justify-between",
                  "margin-x-28",
                  "margin-top-24",
                ]) as ViewStyle
              }
            >
              {title ? (
                <Text
                  style={
                    [
                      style.flatten([
                        "subtitle2",
                        "color-text-high",
                        "color-white",
                        "flex-3",
                      ]),
                      titleStyle,
                    ] as ViewStyle
                  }
                >
                  {title}
                </Text>
              ) : null}
              {showCloseButton && close ? (
                <View style={style.flatten(["flex-1", "items-end"])}>
                  <IconButton
                    icon={<XmarkIcon color={"white"} />}
                    backgroundBlur={false}
                    blurIntensity={20}
                    borderRadius={50}
                    iconStyle={
                      style.flatten([
                        "width-32",
                        "height-32",
                        "items-center",
                        "justify-center",
                        "border-width-1",
                        "border-color-white@20%",
                      ]) as ViewStyle
                    }
                    onPress={() => close()}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <KeyboardAwareScrollView
            style={StyleSheet.flatten([
              style.flatten(["padding-x-20", "margin-top-24"]) as ViewStyle,
              childrenContainerStyle,
            ])}
          >
            {children}
            <View
              style={style.flatten(["height-page-double-pad"]) as ViewStyle}
            />
          </KeyboardAwareScrollView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};
