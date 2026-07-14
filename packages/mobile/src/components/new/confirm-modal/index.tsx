import React, { FunctionComponent } from "react";
import { CardModal } from "modals/card";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { Button } from "components/button";

export const ConfirmCardModel: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  title: string;
  subtitle: string;
  confirmButtonText?: string;
  select: (confirm: boolean) => void;
}> = ({
  close,
  title,
  isOpen,
  select,
  subtitle,
  confirmButtonText = "Remove",
}) => {
  const style = useStyle();

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal
      isOpen={isOpen}
      showCloseButton={false}
      title={title}
      disableGesture={true}
      titleStyle={style.flatten(["text-center"]) as ViewStyle}
    >
      <Text
        style={
          style.flatten(["body3", "text-center", "color-gray-300"]) as ViewStyle
        }
      >
        {subtitle}
      </Text>
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-between",
            "margin-top-24",
          ]) as ViewStyle
        }
      >
        <Button
          text="Cancel"
          size="large"
          mode="outline"
          onPress={() => {
            select(false);
            close();
          }}
          containerStyle={
            {
              ...style.flatten(["border-radius-32", "flex-1"]),
              borderColor: "#DCDCE3",
              marginRight: 6,
            } as ViewStyle
          }
          textStyle={style.flatten(["body3", "color-dark"]) as ViewStyle}
        />
        <Button
          text={confirmButtonText}
          size="large"
          onPress={() => {
            select(true);
            close();
          }}
          containerStyle={
            {
              ...style.flatten([
                "border-radius-32",
                "flex-1",
                "background-color-dark",
              ]),
              marginLeft: 6,
            } as ViewStyle
          }
          textStyle={style.flatten(["body3", "color-white"]) as ViewStyle}
        />
      </View>
    </CardModal>
  );
};
