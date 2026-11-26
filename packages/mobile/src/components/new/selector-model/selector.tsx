import React, { FunctionComponent, ReactElement } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { RectButton } from "components/rect-button";
import { CheckIcon } from "components/new/icon/check";
import { CardModal } from "modals/card";
import { IconButton } from "../button/icon";
import { BlurBackground } from "../blur-background/blur-background";

export const SelectorModal: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  items: {
    label: string;
    key: string;
    icon: ReactElement;
  }[];
  selectedKey: string | undefined;
  setSelectedKey: (key: string | undefined) => void;
  modalPersistent?: boolean;
}> = ({
  isOpen,
  close,
  items,
  selectedKey,
  setSelectedKey,
  modalPersistent,
}) => {
  const style = useStyle();

  const renderSelectIcon = (selected: boolean) => {
    if (selected) {
      return (
        <IconButton
          backgroundBlur={false}
          icon={<CheckIcon size={16} />}
          iconStyle={
            style.flatten([
              "width-24",
              "height-24",
              "items-center",
              "justify-center",
            ]) as ViewStyle
          }
        />
      );
    } else {
      return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal isOpen={isOpen} close={close} title="Sort by">
      {items.map((item) => {
        return (
          <BlurBackground
            key={item.key}
            borderRadius={12}
            blurIntensity={15}
            containerStyle={style.flatten(["margin-bottom-6"]) as ViewStyle}
          >
            <RectButton
              style={
                style.flatten(
                  [
                    "flex-row",
                    "items-center",
                    "justify-between",
                    "border-radius-12",
                    "padding-x-12",
                    "padding-y-18",
                  ],
                  [item.key === selectedKey && "background-color-indigo"]
                ) as ViewStyle
              }
              onPress={() => {
                setSelectedKey(item.key);
                if (!modalPersistent) {
                  close();
                }
              }}
            >
              <View
                style={style.flatten(["flex-row", "items-center"]) as ViewStyle}
              >
                <IconButton
                  backgroundBlur={false}
                  icon={item.icon}
                  iconStyle={
                    style.flatten([
                      "width-24",
                      "height-24",
                      "items-center",
                      "justify-center",
                      "margin-right-12",
                    ]) as ViewStyle
                  }
                />
                <Text
                  style={style.flatten(["body3", "color-white"]) as ViewStyle}
                >
                  {item.label.trim()}
                </Text>
              </View>

              {renderSelectIcon(item.key === selectedKey)}
            </RectButton>
          </BlurBackground>
        );
      })}
    </CardModal>
  );
};
