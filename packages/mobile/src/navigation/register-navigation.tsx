import React, { FunctionComponent } from "react";
import { useStyle } from "styles/index";
import { TransitionPresets } from "@react-navigation/stack";
import {
  BlurHeaderOptionsPreset,
  TransparentHeaderOptionsPreset,
} from "components/header";
import { RegisterIntroScreen } from "screens/register";
import { MnemonicScreen } from "screens/register/mnemonic/mnemonic";
import { VerifyMnemonicScreen } from "screens/register/mnemonic/verify-mnemonic";
import { LedgerScreen } from "screens/register/ledger";
import { TorusSignInScreen } from "screens/register/torus";
import {
  ImportFromExtensionIntroScreen,
  ImportFromExtensionScreen,
  ImportFromExtensionSetPasswordScreen,
} from "screens/register/import-from-extension";
import { RegisterEndScreen } from "screens/register/end";
import { Stack } from "./navigation";
import { RecoverMnemonicScreen } from "screens/register/mnemonic/recover-mnemonic";
import { CreateAccountScreen } from "screens/register/mnemonic/create-account";
import { MigrateETHScreen } from "screens/register/migration";
import { ViewStyle } from "react-native";

export const RegisterNavigation: FunctionComponent = () => {
  const style = useStyle();

  return (
    <Stack.Navigator
      screenOptions={{
        ...TransitionPresets.SlideFromRightIOS,
        headerTitleStyle: style.flatten(["h5", "color-text-high"]) as ViewStyle,
        headerMode: "screen",
      }}
      initialRouteName="Register.Intro"
    >
      <Stack.Screen
        options={{
          headerShown: false,
          title: "",
        }}
        name="Register.Intro"
        component={RegisterIntroScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="Register.NewMnemonic"
        component={MnemonicScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="Register.VerifyMnemonic"
        component={VerifyMnemonicScreen}
      />
      <Stack.Screen
        options={{
          ...BlurHeaderOptionsPreset,
          // Only show the back button.
          title: "Import wallet",
        }}
        name="Register.RecoverMnemonic"
        component={RecoverMnemonicScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="Register.MigrateETH"
        component={MigrateETHScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="Register.CreateAccount"
        component={CreateAccountScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="Register.Ledger"
        component={LedgerScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "",
        }}
        name="Register.TorusSignIn"
        component={TorusSignInScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="Register.ImportFromExtension.Intro"
        component={ImportFromExtensionIntroScreen}
      />
      <Stack.Screen
        options={{
          headerShown: false,
        }}
        name="Register.ImportFromExtension"
        component={ImportFromExtensionScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          // Only show the back button.
          title: "",
        }}
        name="Register.ImportFromExtension.SetPassword"
        component={ImportFromExtensionSetPasswordScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          headerShown: false,
        }}
        name="Register.End"
        component={RegisterEndScreen}
      />
    </Stack.Navigator>
  );
};
