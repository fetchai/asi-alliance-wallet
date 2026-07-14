import React, { FunctionComponent } from "react";
import { useStyle } from "styles/index";
import { TransitionPresets } from "@react-navigation/stack";
import { Stack } from "./navigation";
import { ViewStyle } from "react-native";
import {
  HeaderRightButton,
  TransparentHeaderOptionsPreset,
} from "components/header";
import { HeaderLeftBackLightButton } from "components/header/button";
import { getPlatformFontFamily } from "styles/builder/utils";
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
          ...TransparentHeaderOptionsPreset,
          title: "Add a token",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="Setting.AddToken"
        component={SettingAddTokenScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Manage tokens",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
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
                icon={<HeaderAddIcon size={19} color="#151a1a" />}
                backgroundBlur={false}
                iconStyle={
                  style.flatten([
                    "width-54",
                    "border-width-1",
                    "border-color-gray-100",
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
          ...TransparentHeaderOptionsPreset,
          title: "Security & Privacy",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="Setting.SecurityAndPrivacy"
        component={SecurityAndPrivacyScreen}
      />
      <Stack.Screen
        name="Setting.ViewPrivateData"
        options={{
          ...TransparentHeaderOptionsPreset,
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        component={ViewPrivateDataScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "App version",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="Setting.Version"
        component={FetchVersionScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Currency",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="Setting.Currency"
        component={CurrencyScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Proposals",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="Governance"
        component={GovernanceScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
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
