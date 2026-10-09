import React, { FunctionComponent, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { observer } from "mobx-react-lite";
import {
  createStackNavigator,
  TransitionPresets,
} from "@react-navigation/stack";

import { useStyle } from "styles/index";
import { useStore } from "stores/index";

import { UnlockScreen } from "screens/unlock";
import { SettingChainListScreen } from "screens/setting/screens/chain-list";
import {
  AddAddressBookScreen,
  AddressBookScreen,
  EditAddressBookScreen,
} from "screens/setting/screens/address-book";
import { PageScrollPositionProvider } from "providers/page-scroll-position";
import {
  HeaderOnSecondaryScreenOptionsPreset,
  TransparentHeaderOptionsPreset,
} from "components/header";
import { Platform } from "react-native";

// On iOS, list content scrolls behind the transparent header — use an opaque/blur
// header to cover it. Android is unaffected so keep the transparent header there.
const SecondaryScreenHeaderPreset =
  Platform.OS === "ios"
    ? HeaderOnSecondaryScreenOptionsPreset
    : TransparentHeaderOptionsPreset;
import { HeaderLeftBackLightButton } from "components/header/button";
import { getPlatformFontFamily } from "styles/builder/utils";
import { FocusedScreenProvider } from "providers/focused-screen";

import { SmartNavigatorProvider } from "navigation/smart-navigation";
import { ViewStyle } from "react-native";
import { navigationIntegration } from "../../index";

export const Stack = createStackNavigator();

export const AddressBookStackScreen: FunctionComponent = () => {
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
          ...TransparentHeaderOptionsPreset,
          title: "Address Book",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="AddressBook"
        component={AddressBookScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Add an Address",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="AddAddressBook"
        component={AddAddressBookScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Edit Address Book",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="EditAddressBook"
        component={EditAddressBookScreen}
      />
    </Stack.Navigator>
  );
};

export const ChainListStackScreen: FunctionComponent = () => {
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
          ...SecondaryScreenHeaderPreset,
          title: "Manage Networks",
          headerTitleStyle: {
            color: style.get("color-dark").color,
            fontSize: 16,
            fontFamily: getPlatformFontFamily("400"),
          },
          headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
        }}
        name="Setting.ChainList"
        component={SettingChainListScreen}
      />
    </Stack.Navigator>
  );
};

export const AppNavigation: FunctionComponent = observer(() => {
  const { keyRingStore } = useStore();
  const navigation = useRef(null);

  return (
    <PageScrollPositionProvider>
      <FocusedScreenProvider>
        <SmartNavigatorProvider>
          <NavigationContainer
            ref={navigation}
            onReady={() => {
              navigationIntegration.registerNavigationContainer(navigation);
            }}
          >
            <Stack.Navigator
              initialRouteName={
                keyRingStore.status !== "unlocked" ? "Unlock" : "MainTabDrawer"
              }
              screenOptions={{
                headerShown: false,
                ...TransitionPresets.SlideFromRightIOS,
                headerMode: "screen",
              }}
            >
              <Stack.Screen name="Unlock" component={UnlockScreen} />
              {/* Deferred until navigated: keeps Unlock/splash path free of
                  home/stake/register/send/settings screen graphs. */}
              <Stack.Screen
                name="MainTabDrawer"
                getComponent={() =>
                  require("navigation/navigation-tab-with-drawer")
                    .MainTabNavigationWithDrawer
                }
              />
              <Stack.Screen
                name="Register"
                getComponent={() =>
                  require("navigation/register-navigation").RegisterNavigation
                }
              />
              <Stack.Screen
                name="Others"
                getComponent={() =>
                  require("navigation/other-navigation").OtherNavigation
                }
              />
              <Stack.Screen
                name="AddressBooks"
                component={AddressBookStackScreen}
              />
              <Stack.Screen name="ChainList" component={ChainListStackScreen} />
              <Stack.Screen
                name="Stake"
                getComponent={() =>
                  require("./stake-navigation").StakeNavigation
                }
              />
              <Stack.Screen
                name="Setting"
                getComponent={() => require("./more-navigation").MoreNavigation}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </SmartNavigatorProvider>
      </FocusedScreenProvider>
    </PageScrollPositionProvider>
  );
});
