import React, { FunctionComponent } from "react";
import { PageWithScrollView } from "components/page";
import { RouteProp, useRoute } from "@react-navigation/native";
import { ValidatorDetailsCard } from "./validator-details-card";
import { useStyle } from "styles/index";
import { observer } from "mobx-react-lite";
// import { UnbondingCard } from "./unbonding-card";
import { View, ViewStyle } from "react-native";
import { Button } from "components/button";
import { useSmartNavigation } from "navigation/smart-navigation";
import { useStore } from "stores/index";

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

    return (
      <PageWithScrollView
        backgroundMode="image"
        contentContainerStyle={style.get("flex-grow-1")}
        style={style.flatten(["padding-x-page"]) as ViewStyle}
      >
        <ValidatorDetailsCard
          containerStyle={style.flatten(["margin-y-card-gap"]) as ViewStyle}
          validatorAddress={validatorAddress}
        />

        <View style={style.flatten(["flex-1"])} />

        <Button
          containerStyle={style.flatten(["border-radius-32"]) as ViewStyle}
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
        <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      </PageWithScrollView>
    );
  }
);
