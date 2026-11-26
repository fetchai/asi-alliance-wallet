import React, { FunctionComponent } from "react";
import { useStyle } from "styles/index";
import { TransitionPresets } from "@react-navigation/stack";
import { Stack } from "./navigation";
import { ViewStyle } from "react-native";
import {
  BlurHeaderOptionsPreset,
  HeaderRightButton,
  TransparentHeaderOptionsPreset,
} from "components/header";
import { useStore } from "stores/index";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import {
  SettingAddTokenScreen,
  SettingManageTokensScreen,
} from "screens/setting/screens/token";
import { IconButton } from "components/new/button/icon";
import { HeaderAddIcon } from "components/header/icon";
import { SecurityAndPrivacyScreen } from "screens/setting/screens/security-and-privacy";
import { ViewPrivateDataScreen } from "screens/setting/screens/view-private-data";
import { FetchVersionScreen } from "screens/setting/screens/version";
import { CurrencyScreen } from "screens/setting/screens/currency";
import { GovernanceDetailsScreen, GovernanceScreen } from "screens/governance";
import { SettingEndpointsPage } from "screens/setting/screens/endpoints";

export const MoreNavigation: FunctionComponent = () => {
  const style = useStyle();
  const { analyticsStore } = useStore();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

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
          title: "Add a token",
        }}
        name="Setting.AddToken"
        component={SettingAddTokenScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          title: "Manage tokens",
          headerRight: () => (
            <HeaderRightButton
              onPress={() => {
                navigation.navigate("Setting.AddToken");
                analyticsStore.logEvent("add_token_icon_click", {
                  pageName: "More",
                });
              }}
            >
              <IconButton
                icon={<HeaderAddIcon size={19} color="white" />}
                backgroundBlur={false}
                iconStyle={
                  style.flatten([
                    "width-54",
                    "border-width-1",
                    "border-color-white@20%",
                    "padding-x-12",
                    "padding-y-6",
                    "justify-center",
                    "items-center",
                  ]) as ViewStyle
                }
              />
            </HeaderRightButton>
          ),
        }}
        name="Setting.ManageTokens"
        component={SettingManageTokensScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,

          title: "Security & Privacy",
        }}
        name="Setting.SecurityAndPrivacy"
        component={SecurityAndPrivacyScreen}
      />
      <Stack.Screen
        name="Setting.ViewPrivateData"
        options={{
          ...BlurHeaderOptionsPreset,
        }}
        component={ViewPrivateDataScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          title: "App version",
        }}
        name="Setting.Version"
        component={FetchVersionScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          title: "Currency",
        }}
        name="Setting.Currency"
        component={CurrencyScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Proposals",
        }}
        name="Governance"
        component={GovernanceScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "",
        }}
        name="Governance.Details"
        component={GovernanceDetailsScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Endpoint",
        }}
        name="Setting.Endpoint"
        component={SettingEndpointsPage}
      />
    </Stack.Navigator>
  );
};
