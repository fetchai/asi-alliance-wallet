import { AlertIcon } from "components/icon/alert";
import React, { FunctionComponent } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";

export const LedgerErrorView: FunctionComponent<{
  text: string;
}> = ({ text, children }) => {
  const style = useStyle();

  return (
    <View
      style={style.flatten(["items-center", "margin-bottom-16"]) as ViewStyle}
    >
      <AlertIcon size={100} color={style.get("color-red-400").color} />
      <Text style={style.flatten(["h4", "color-red-400"]) as ViewStyle}>
        Error
      </Text>
      <Text
        style={
          style.flatten([
            "subtitle3",
            "color-white",
            "margin-top-16",
          ]) as ViewStyle
        }
      >
        {text}
      </Text>
      {children}
    </View>
  );
};
