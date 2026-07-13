import React, { FunctionComponent, useState } from "react";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { CardModal } from "modals/card";
import { ViewStyle, View, Text } from "react-native";
import { RectButton } from "react-native-gesture-handler";
import { useStyle } from "styles/index";
import { Button } from "components/button";

export const ProposalFilterModal: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  selectedIndex: number;
  setSelectedIndex: any;
}> = ({ isOpen, close, selectedIndex, setSelectedIndex }) => {
  const style = useStyle();
  const [select, setSelect] = useState(selectedIndex);

  if (!isOpen) {
    return null;
  }

  const handleCheck = (id: number) => {
    if (select === id) {
      setSelect(0);
      return;
    }
    setSelect(id);
  };

  return (
    <CardModal
      isOpen={isOpen}
      close={() => {
        setSelect(selectedIndex);
        close();
      }}
      title="Filter"
    >
      <ProposalStatusButton
        text="Active"
        id={1}
        selectedIndex={select}
        handleCheck={(id) => {
          handleCheck(id);
        }}
      />
      <ProposalStatusButton
        text="Voted"
        id={2}
        selectedIndex={select}
        handleCheck={(id) => {
          handleCheck(id);
        }}
      />
      <ProposalStatusButton
        text="Closed"
        id={3}
        selectedIndex={select}
        handleCheck={(id) => {
          handleCheck(id);
        }}
      />
      <Button
        text="Save changes"
        size="large"
        containerStyle={
          {
            ...style.flatten(["border-radius-64", "margin-top-18"]),
            backgroundColor: "#151a1a",
          } as ViewStyle
        }
        textStyle={style.flatten(["body2", "color-white"]) as ViewStyle}
        disabled={select === selectedIndex}
        onPress={() => {
          setSelectedIndex(select);
          close();
        }}
      />
    </CardModal>
  );
};

const ProposalStatusButton: FunctionComponent<{
  text: string;
  id: number;
  selectedIndex: number;
  handleCheck?: (id: number) => void;
}> = ({ text, id, selectedIndex, handleCheck }) => {
  const style = useStyle();

  return (
    <BlurBackground
      borderRadius={12}
      backgroundBlur={false}
      containerStyle={
        [
          style.flatten(["margin-bottom-6", "background-color-gray-5"]),
          id === selectedIndex ? { backgroundColor: "#e0fedd" } : null,
        ] as ViewStyle
      }
    >
      <RectButton
        style={
          style.flatten([
            "flex-row",
            "items-center",
            "justify-between",
            "border-radius-12",
            "padding-x-12",
            "padding-y-18",
          ]) as ViewStyle
        }
        underlayColor="#e0fedd"
        onPress={() => {
          if (handleCheck) handleCheck(id);
        }}
      >
        <View style={style.flatten(["flex-row", "items-center"]) as ViewStyle}>
          <Text style={style.flatten(["body3", "color-dark"]) as ViewStyle}>
            {text}
          </Text>
        </View>
      </RectButton>
    </BlurBackground>
  );
};
