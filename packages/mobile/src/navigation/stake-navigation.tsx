import React, { FunctionComponent } from "react";
import { useStyle } from "styles/index";
import { Stack } from "./navigation";
import { TransitionPresets } from "@react-navigation/stack";
import { TransparentHeaderOptionsPreset } from "components/header";
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
          // Only show the back button.
          title: "",
        }}
        name="Staking.Dashboard"
        component={StakingDashboardScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Validator Details",
        }}
        name="Validator.Details"
        component={ValidatorDetailsScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Validator Details",
        }}
        name="SelectorValidator.Details"
        component={SelectorValidatorDetailsScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Choose validator",
        }}
        name="Validator.List"
        component={ValidatorListScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Stake",
        }}
        name="Delegate"
        component={DelegateScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Unstake",
        }}
        name="Undelegate"
        component={UndelegateScreen}
      />
      <Stack.Screen
        options={{
          ...TransparentHeaderOptionsPreset,
          title: "Choose Validator",
        }}
        name="Redelegate"
        component={RedelegateScreen}
      />
    </Stack.Navigator>
  );
};
