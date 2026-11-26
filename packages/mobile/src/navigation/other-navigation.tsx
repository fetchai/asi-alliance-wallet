import React, { FunctionComponent } from "react";
import { useStyle } from "styles/index";

import { TransitionPresets } from "@react-navigation/stack";
import {
  BlurHeaderOptionsPreset,
  TransparentHeaderOptionsPreset,
} from "components/header";
import { SendScreen } from "screens/send";
import { ReceiveScreen } from "screens/receive";
import { CameraScreen } from "screens/camera";

import { Stack } from "./navigation";
import { TokenDetail } from "screens/portfolio/token-detail";
import { ViewStyle } from "react-native";
import { RenameWalletScreen } from "screens/rename-account";
import { DeleteWalletScreen } from "screens/delete-account";
import { ActivityDetails } from "screens/activity/activity-details";
import { WebViewScreen } from "screens/web";

export const OtherNavigation: FunctionComponent = () => {
  const style = useStyle();

  return (
    <Stack.Navigator
      screenOptions={{
        ...TransitionPresets.SlideFromRightIOS,
        headerTitleStyle: style.flatten(["h5", "color-text-high"]) as ViewStyle,
        headerMode: "screen",
      }}
    >
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          title: "Send",
        }}
        name="Send"
        component={SendScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          title: "Receive",
        }}
        name="Receive"
        component={ReceiveScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="NativeTokens"
        component={TokenDetail}
      />
      <Stack.Screen
        options={{
          headerShown: false,
        }}
        name="Camera"
        component={CameraScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          title: "Rename wallet",
        }}
        name="RenameWallet"
        component={RenameWalletScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="DeleteWallet"
        component={DeleteWalletScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="ActivityDetails"
        component={ActivityDetails}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "",
          // Only show the back button.
        }}
        name="WebView"
        component={WebViewScreen}
      />
    </Stack.Navigator>
  );
};
