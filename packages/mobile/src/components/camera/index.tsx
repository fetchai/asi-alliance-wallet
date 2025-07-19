import React, { FunctionComponent } from "react";
import { CameraNativeProps } from "expo-camera";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useStyle } from "styles/index";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingSpinner } from "components/spinner";
import { IconButton } from "components/new/button/icon";
import { XmarkIcon } from "components/new/icon/xmark";
import { ScannerFrame } from "./scanner-frame";
import ExpoCamera from "expo-camera/build/ExpoCamera";

interface CameraProp extends CameraNativeProps {
  containerBottom?: React.ReactElement;
  isLoading?: boolean;
  scannerBottomText: string;
}

export const FullScreenCameraView: FunctionComponent<CameraProp> = (props) => {
  const style = useStyle();

  const navigation = useNavigation();

  const isFocused = useIsFocused();

  const { children, containerBottom, isLoading, scannerBottomText, ...rest } =
    props;

  return (
    <React.Fragment>
      {isFocused ? (
        <ExpoCamera
          style={StyleSheet.flatten([style.flatten(["absolute-fill"])])}
          {...rest}
        />
      ) : null}
      <SafeAreaView style={style.flatten(["absolute-fill", "items-center"])}>
        <View
          style={
            style.flatten([
              "flex-row",
              "margin-top-10",
              "margin-x-16",
              "items-center",
            ]) as ViewStyle
          }
        >
          <View style={style.get("flex-1")} />
          <Text
            style={
              style.flatten([
                "justify-center",
                "color-white",
                "subtitle2",
                "margin-left-32",
              ]) as ViewStyle
            }
          >
            Scan QR Code
          </Text>
          <View style={style.get("flex-1")} />
          {navigation.canGoBack() ? (
            <TouchableOpacity
              onPress={() => {
                navigation.goBack();
              }}
            >
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
              />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={style.get("flex-2")} />
        <View style={style.flatten(["flex-5", "items-center"])}>
          <ScannerFrame />
          <Text
            style={
              style.flatten([
                "text-caption2",
                "color-white",
                "margin-top-24",
                "text-center",
              ]) as ViewStyle
            }
          >
            {scannerBottomText}
          </Text>
          {isLoading ? (
            <View
              style={style.flatten([
                "absolute-fill",
                "items-center",
                "justify-center",
              ])}
            >
              <View
                style={
                  style.flatten([
                    "padding-x-32",
                    "padding-top-48",
                    "padding-bottom-31",
                    "background-color-card",
                    "border-radius-8",
                    "items-center",
                  ]) as ViewStyle
                }
              >
                <LoadingSpinner
                  size={42}
                  color={style.flatten(["color-indigo-900"]).color}
                />
                <Text
                  style={
                    style.flatten([
                      "subtitle1",
                      "color-indigo-900",
                      "margin-top-34",
                    ]) as ViewStyle
                  }
                >
                  Loading...
                </Text>
              </View>
            </View>
          ) : null}
        </View>
        {containerBottom}
        <View style={style.get("flex-1")} />
      </SafeAreaView>
      {children}
    </React.Fragment>
  );
};
