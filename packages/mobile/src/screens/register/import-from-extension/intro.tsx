import React, { FunctionComponent, useState } from "react";
import { RouteProp, useRoute } from "@react-navigation/native";
import { RegisterConfig } from "@keplr-wallet/hooks";
import { PageWithView } from "components/page";
import { Image, Linking, Platform, Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { Button } from "components/button";
import { useSmartNavigation } from "navigation/smart-navigation";
import { IconWithText } from "components/new/icon-with-text/icon-with-text";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { Camera, PermissionStatus } from "expo-camera";
import { CameraPermissionModal } from "components/new/camera-permission-model/camera-permission";
import { CameraPermissionOffIcon } from "components/new/icon/camerapermission-off";
import { CameraPermissionOnIcon } from "components/new/icon/camerapermission-on";
import { useStore } from "stores/index";

export enum ModelStatus {
  First = "first",
  Second = "second",
}

export const handleOpenSettings = async () => {
  if (Platform.OS === "ios") {
    await Linking.openURL("app-settings:");
  } else {
    await Linking.openSettings();
  }
};

export const ImportFromExtensionIntroScreen: FunctionComponent = () => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          registerConfig: RegisterConfig;
        }
      >,
      string
    >
  >();
  const { analyticsStore } = useStore();
  const smartNavigation = useSmartNavigation();
  const style = useStyle();
  const [openCameraModel, setIsOpenCameraModel] = useState(false);
  const [modelStatus, setModelStatus] = useState(ModelStatus.First);

  return (
    <PageWithView backgroundMode="image">
      <View style={style.flatten(["padding-page", "flex-grow-1"]) as ViewStyle}>
        <View style={style.get("flex-2")} />
        <IconWithText
          icon={
            <Image
              source={require("assets/svg/img-extension.png")}
              style={{
                width: 286,
                height: 186,
              }}
              resizeMode="contain"
              fadeDuration={0}
            />
          }
          title={"Import from ASI Alliance Web extension"}
          subtitle={`Import your account(s) by going to\n‘Settings > Link ASI Alliance Mobile’ on ASI Alliance Web Extension and scanning the QR Code`}
          iconStyle={style.flatten(["margin-bottom-24"]) as ViewStyle}
          titleStyle={
            style.flatten([
              "h3",
              "margin-x-20",
              "text-center",
              "font-medium",
            ]) as ViewStyle
          }
          subtitleStyle={style.flatten(["subtitle3"]) as ViewStyle}
        />
        <BlurBackground
          borderRadius={12}
          backgroundBlur={false}
          containerStyle={
            style.flatten([
              "margin-x-10",
              "margin-top-10",
              "background-color-cardColor@25%",
            ]) as ViewStyle
          }
        >
          <Text
            style={
              style.flatten([
                "subtitle3",
                "color-white",
                "text-center",
                "margin-x-24",
                "margin-y-14",
              ]) as ViewStyle
            }
          >
            Ledger accounts need to be imported separately
          </Text>
        </BlurBackground>
        <View style={style.get("flex-3")} />
        <Button
          text="Continue"
          size="large"
          containerStyle={style.flatten(["border-radius-32"]) as ViewStyle}
          onPress={async () => {
            const permission = await Camera.getCameraPermissionsAsync();
            if (permission?.status == PermissionStatus.UNDETERMINED) {
              setIsOpenCameraModel(true);
            } else {
              if (!permission?.granted) {
                setModelStatus(ModelStatus.Second);
                setIsOpenCameraModel(true);
              } else {
                analyticsStore.logEvent("continue_click", {
                  pageName: "Register",
                  registerType: "qr",
                });

                smartNavigation.navigateSmart("Register.ImportFromExtension", {
                  registerConfig: route.params.registerConfig,
                });
              }
            }
          }}
        />
      </View>
      <CameraPermissionModal
        title={
          modelStatus == ModelStatus.First
            ? "Camera permission"
            : "Camera permission is disabled"
        }
        icon={
          modelStatus == ModelStatus.First ? (
            <CameraPermissionOffIcon />
          ) : (
            <CameraPermissionOnIcon />
          )
        }
        buttonText={
          modelStatus == ModelStatus.First
            ? "Allow ASI Alliance to use camera"
            : "Enable camera permission in settings"
        }
        isOpen={openCameraModel}
        close={() => setIsOpenCameraModel(false)}
        onPress={async () => {
          const permissionStatus = await Camera.requestCameraPermissionsAsync();
          if (permissionStatus.status === PermissionStatus.DENIED) {
            if (permissionStatus.canAskAgain) {
              setIsOpenCameraModel(false);
            } else {
              await handleOpenSettings();
              setIsOpenCameraModel(false);
            }
          } else {
            setIsOpenCameraModel(false);
            if (permissionStatus.status === PermissionStatus.GRANTED) {
              smartNavigation.navigateSmart("Register.ImportFromExtension", {
                registerConfig: route.params.registerConfig,
              });
              analyticsStore.logEvent("allow_fetch_to_use_camera_click", {
                registerType: "qr",
                pageName: "Register",
              });
            }
          }
        }}
      />
    </PageWithView>
  );
};
