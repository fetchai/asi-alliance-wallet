import React, { FunctionComponent } from "react";
import { useStyle } from "styles/index";
import { Stack } from "./navigation";
import { TransitionPresets } from "@react-navigation/stack";
import { TransparentHeaderOptionsPreset } from "components/header";
import { HeaderLeftBackLightButton } from "components/header/button";
import { getPlatformFontFamily } from "styles/builder/utils";
import {
  DelegateScreen,
  RedelegateScreen,
  StakingDashboardScreen,
  UndelegateScreen,
  ValidatorDetailsScreen,
  ValidatorListScreen,
} from "screens/stake";
import { SelectorValidatorDetailsScreen } from "screens/stake/validator-details/selector-validator-details";
import { ViewStyle } from "react-native";

const lightHeaderOverrides = {
  headerTitleStyle: {
    color: "#151a1a",
    fontSize: 16,
    fontFamily: getPlatformFontFamily("400"),
  },
  headerLeft: (props: any) => <HeaderLeftBackLightButton {...props} />,
};

export const StakeNavigation: FunctionComponent = () => {
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
          ...lightHeaderOverrides,
          title: "",
        }}
        name="Staking.Dashboard"
        component={StakingDashboardScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          ...lightHeaderOverrides,
          title: "Validator Details",
        }}
        name="Validator.Details"
        component={ValidatorDetailsScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          ...lightHeaderOverrides,
          title: "Validator Details",
        }}
        name="SelectorValidator.Details"
        component={SelectorValidatorDetailsScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          ...lightHeaderOverrides,
          title: "Choose validator",
        }}
        name="Validator.List"
        component={ValidatorListScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          ...lightHeaderOverrides,
          title: "Stake",
        }}
        name="Delegate"
        component={DelegateScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          ...lightHeaderOverrides,
          title: "Unstake",
        }}
        name="Undelegate"
        component={UndelegateScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          ...lightHeaderOverrides,
          title: "Choose Validator",
        }}
        name="Redelegate"
        component={RedelegateScreen}
      />
    </Stack.Navigator>
  );
};
