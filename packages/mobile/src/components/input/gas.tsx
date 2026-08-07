import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { StyleSheet, Switch, Text, View, ViewStyle } from "react-native";
import { IFeeConfig, IGasConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { InputCardView } from "components/new/card-view/input-card";
import { useStyle } from "styles/index";
import { ManualFeeInput } from "./manual-fee-input";

export const GasInput: FunctionComponent<{
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  gasSimulator?: IGasSimulator;
  onValidationChange?: (hasError: boolean) => void;
}> = observer(({ feeConfig, gasConfig, gasSimulator, onValidationChange }) => {
  const style = useStyle();
  const [localEnabled, setLocalEnabled] = useState(true);

  // When gasSimulator is provided, its enabled flag drives the toggle.
  // Otherwise fall back to local state so GasInput still works standalone.
  const autoEnabled = gasSimulator ? gasSimulator.enabled : localEnabled;
  const setAutoEnabled = (value: boolean) => {
    if (gasSimulator) {
      gasSimulator.setEnabled(value);
    } else {
      setLocalEnabled(value);
    }
    if (value) {
      onValidationChange?.(false);
    }
  };

  return (
    <React.Fragment>
      <View
        style={
          style.flatten([
            "flex-row",
            "items-center",
            "padding-y-12",
            "margin-y-12",
          ]) as ViewStyle
        }
      >
        <Text
          style={StyleSheet.flatten([
            style.flatten([
              "body3",
              "color-dark",
              "margin-right-16",
            ]) as ViewStyle,
          ])}
        >
          {"Auto"}
        </Text>
        <Switch
          trackColor={{
            false: "#DCDCE3",
            true: "#DCDCE3",
          }}
          thumbColor={autoEnabled ? "#73A271" : "#9A9AA2"}
          onValueChange={() => setAutoEnabled(!autoEnabled)}
          value={autoEnabled}
        />
      </View>

      {autoEnabled ? (
        <React.Fragment>
          <View
            style={
              style.flatten([
                "flex-row",
                "justify-between",
                "margin-bottom-16",
              ]) as ViewStyle
            }
          >
            <InputCardView
              label="Gas Adjustment"
              placeholder="-"
              value={
                gasSimulator?.gasEstimated != null
                  ? gasSimulator.gasAdjustmentRaw
                  : "-"
              }
              onChangeText={(value: string) => {
                gasSimulator?.setGasAdjustment(value);
              }}
              labelStyle={
                style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
              }
              containerStyle={
                style.flatten(["flex-2", "margin-right-16"]) as ViewStyle
              }
              editable={false}
              keyboardType="decimal-pad"
            />
            <InputCardView
              label="Estimated"
              placeholder="-"
              value={
                gasSimulator?.gasEstimated != null
                  ? String(gasSimulator.gasEstimated)
                  : "-"
              }
              labelStyle={
                style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
              }
              containerStyle={style.flatten(["flex-2"]) as ViewStyle}
              editable={false}
              keyboardType="numeric"
            />
          </View>
          <InputCardView
            label="Gas Limit"
            placeholder="-"
            value={String(gasConfig.gas)}
            labelStyle={
              style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
            }
            editable={false}
            keyboardType="numeric"
          />
        </React.Fragment>
      ) : (
        <ManualFeeInput
          feeConfig={feeConfig}
          gasConfig={gasConfig}
          gasSimulator={gasSimulator}
          onValidationChange={onValidationChange}
        />
      )}
    </React.Fragment>
  );
});
