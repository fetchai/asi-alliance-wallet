import React, { FunctionComponent } from "react";
import { PageWithScrollView } from "components/page";
import { RouteProp, useRoute } from "@react-navigation/native";
import { ValidatorDetailsCard } from "./validator-details-card";
import { useStyle } from "styles/index";
import { observer } from "mobx-react-lite";
import { View, ViewStyle } from "react-native";
import { Button } from "components/button";
import { useSmartNavigation } from "navigation/smart-navigation";
import { useStore } from "stores/index";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const SelectorValidatorDetailsScreen: FunctionComponent = observer(
  () => {
    const route = useRoute<
      RouteProp<
        Record<
          string,
          {
            prevSelectedValidator: string;
            validatorAddress: string;
            validatorSelector: (validatorAddress: string) => void;
          }
        >,
        string
      >
    >();

    const smartNavigation = useSmartNavigation();
    const { analyticsStore } = useStore();
    const prevSelectValidator = route.params.prevSelectedValidator;
    const validatorAddress = route.params.validatorAddress;

    const style = useStyle();
    const safeAreaInsets = useSafeAreaInsets();

    return (
      <PageWithScrollView
        backgroundMode="secondary"
        contentContainerStyle={{
          paddingBottom: Math.max(safeAreaInsets.bottom, 16) + 80,
        }}
        style={
          style.flatten([
            "padding-x-page",
            "padding-y-16",
            "overflow-scroll",
          ]) as ViewStyle
        }
        fixed={
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
              paddingHorizontal: 16,
              paddingBottom: Math.max(safeAreaInsets.bottom, 16),
              paddingTop: 16,
            }}
          >
            <Button
              containerStyle={
                style.flatten([
                  "border-radius-32",
                  "background-color-dark",
                ]) as ViewStyle
              }
              textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
              text="Choose this validator"
              onPress={() => {
                analyticsStore.logEvent("choose_validator_click", {
                  pageName: "Validator Details",
                });
                smartNavigation.navigateSmart("Redelegate", {
                  validatorAddress: prevSelectValidator,
                  selectedValidatorAddress: validatorAddress,
                });
              }}
            />
          </View>
        }
      >
        <ValidatorDetailsCard
          containerStyle={style.flatten(["margin-bottom-16"]) as ViewStyle}
          validatorAddress={validatorAddress}
        />
      </PageWithScrollView>
    );
  }
);
