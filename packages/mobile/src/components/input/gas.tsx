import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { StyleSheet, Switch, Text, View, ViewStyle } from "react-native";
import { IGasConfig } from "@keplr-wallet/hooks";
import { InputCardView } from "components/new/card-view/input-card";
import { useStyle } from "styles/index";

export const GasInput: FunctionComponent<{
  gasConfig: IGasConfig;
}> = observer(({ gasConfig }) => {
  const style = useStyle();
  const [isEnabled, setIsEnabled] = useState(true);

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
              "color-white",
              "margin-right-16",
            ]) as ViewStyle,
          ])}
        >
          {"Auto"}
        </Text>
        <Switch
          trackColor={{
            false: "#767577",
            true: "#5F38FB",
          }}
          thumbColor={isEnabled ? "#FFFFFF" : "#D0BCFF66"}
          style={[
            {
              borderRadius: 16,
            },
            style.flatten(
              ["border-color-pink-light@40%"],
              [!isEnabled && "border-width-1"]
            ),
          ]}
          onValueChange={() => setIsEnabled((previousState) => !previousState)}
          value={isEnabled}
          // style={style.flatten([])}
        />
      </View>
      {!isEnabled ? (
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
            label="Gas adjustment"
            placeholder="-"
            labelStyle={
              style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
            }
            containerStyle={
              style.flatten(["flex-2", "margin-right-16"]) as ViewStyle
            }
            editable={false}
            keyboardType="numeric"
          />
          <InputCardView
            label="Estimated "
            placeholder="-"
            labelStyle={
              style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
            }
            containerStyle={style.flatten(["flex-2"]) as ViewStyle}
            editable={false}
            keyboardType="numeric"
          />
        </View>
      ) : null}
      <InputCardView
        label="Gas amount"
        placeholder="-"
        value={gasConfig.gasRaw}
        onChangeText={(value: string) => {
          if (value.match(/^\d*$/)) {
            gasConfig.setGas(value);
          }
        }}
        labelStyle={
          style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
        }
        maxLength={8}
        keyboardType="numeric"
        editable={isEnabled}
      />
    </React.Fragment>
  );
});
