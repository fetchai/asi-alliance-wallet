import { BlurButton } from "components/new/button/blur-button";
import React, { FunctionComponent } from "react";
import { View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";

export const BipButtons: FunctionComponent<{
  selected: boolean;
  clearButtonDisable?: boolean;
  setIsSelected: any;
  onPressClearButton?: () => void;
}> = ({ selected, setIsSelected, onPressClearButton, clearButtonDisable }) => {
  const style = useStyle();
  return (
    <View style={style.flatten(["flex-row", "items-center"]) as ViewStyle}>
      <BlurButton
        text="Advanced Settings"
        blurIntensity={0}
        borderRadius={32}
        backgroundBlur={false}
        containerStyle={
          [
            style.flatten([
              "justify-center",
              "margin-y-18",
              selected ? "background-color-dark" : "background-color-white",
            ]),
            {
              width: 150,
              borderRadius: 100,
              borderWidth: 1,
              borderColor: "#d0d1d1",
              paddingVertical: 6,
            },
          ] as ViewStyle
        }
        textStyle={
          style.flatten([
            "text-caption2",
            selected ? "color-white" : "color-dark",
          ]) as ViewStyle
        }
        onPress={() => setIsSelected(!selected)}
      />

      <BlurButton
        text="Clear all"
        blurIntensity={0}
        borderRadius={32}
        backgroundBlur={false}
        disable={clearButtonDisable}
        containerStyle={
          [
            style.flatten([
              "justify-center",
              "margin-y-18",
              "margin-left-10",
              clearButtonDisable
                ? "background-color-gray-50"
                : "background-color-dark",
            ]),
            {
              width: 80,
              borderRadius: 100,
              paddingVertical: 6,
            },
          ] as ViewStyle
        }
        textStyle={
          style.flatten([
            "text-caption2",
            clearButtonDisable ? "color-gray-300" : "color-white",
          ]) as ViewStyle
        }
        onPress={onPressClearButton}
      />
    </View>
  );
};
