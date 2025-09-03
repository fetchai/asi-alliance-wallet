import React, { FunctionComponent, useRef } from "react";
import { KeyRingStatus } from "@keplr-wallet/background";
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
import { BlurHeaderOptionsPreset } from "components/header";
import { FocusedScreenProvider } from "providers/focused-screen";

import { SmartNavigatorProvider } from "navigation/smart-navigation";
import { RegisterNavigation } from "navigation/register-navigation";
import { OtherNavigation } from "navigation/other-navigation";
import { MainTabNavigationWithDrawer } from "navigation/navigation-tab-with-drawer";
import { ViewStyle } from "react-native";
import { StakeNavigation } from "./stake-navigation";
import { MoreNavigation } from "./more-navigation";
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
          ...BlurHeaderOptionsPreset,

          title: "Address book",
        }}
        name="AddressBook"
        component={AddressBookScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          title: "Add an address",
        }}
        name="AddAddressBook"
        component={AddAddressBookScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          title: "Edit address book",
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
          ...BlurHeaderOptionsPreset,
          title: "Manage networks",
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
                keyRingStore.status !== KeyRingStatus.UNLOCKED
                  ? "Unlock"
                  : "MainTabDrawer"
              }
              screenOptions={{
                headerShown: false,
                ...TransitionPresets.SlideFromRightIOS,
                headerMode: "screen",
              }}
            >
              <Stack.Screen name="Unlock" component={UnlockScreen} />
              <Stack.Screen
                name="MainTabDrawer"
                component={MainTabNavigationWithDrawer}
              />
              <Stack.Screen name="Register" component={RegisterNavigation} />
              <Stack.Screen name="Others" component={OtherNavigation} />
              <Stack.Screen
                name="AddressBooks"
                component={AddressBookStackScreen}
              />
              <Stack.Screen name="ChainList" component={ChainListStackScreen} />
              <Stack.Screen name="Stake" component={StakeNavigation} />
              <Stack.Screen name="Setting" component={MoreNavigation} />
            </Stack.Navigator>
          </NavigationContainer>
        </SmartNavigatorProvider>
      </FocusedScreenProvider>
    </PageScrollPositionProvider>
  );
});
