import React, { FunctionComponent } from "react";
import { Dimensions, FlatList, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { BlurButton } from "../button/blur-button";
import { BlurBackground } from "../blur-background/blur-background";

export const TabBarView: FunctionComponent<{
  listItem: any;
  selected: any;
  setSelected: any;
  contentContainerStyle?: ViewStyle;
  containerStyle?: ViewStyle;
  unselectedTextColorToken?: string;
  backgroundColorToken?: string;
}> = ({
  listItem,
  selected,
  setSelected,
  contentContainerStyle,
  containerStyle,
  unselectedTextColorToken,
  backgroundColorToken,
}) => {
  const style = useStyle();

  const renderItem = ({ item }: any) => {
    const select = selected === item;
    return (
      <BlurButton
        backgroundBlur={false}
        borderRadius={10}
        text={item}
        textStyle={
          style.flatten(
            ["text-caption1", "padding-x-4"],
            [
              select
                ? "color-white"
                : (unselectedTextColorToken as any) || "color-gray-300",
            ]
          ) as ViewStyle
        }
        containerStyle={
          [
            style.flatten(["justify-center"]),
            select ? { backgroundColor: "#151a1a" } : {},
            {
              width:
                (Dimensions.get("window").width -
                  (43 + Object.values(listItem).length)) /
                Object.values(listItem).length,
            },
          ] as ViewStyle
        }
        onPress={() => {
          setSelected(item);
        }}
      />
    );
  };

  return (
    <BlurBackground
      borderRadius={12}
      containerStyle={
        [
          style.flatten(
            ["margin-y-10", "padding-2"],
            [(backgroundColorToken as any) || undefined]
          ),
          { backgroundColor: "#f6f6f6" },
          containerStyle,
        ] as ViewStyle
      }
    >
      <FlatList
        data={Object.values(listItem)}
        renderItem={renderItem}
        horizontal={true}
        extraData={selected}
        contentContainerStyle={[
          style.flatten(["justify-center", "items-center"]),
          contentContainerStyle,
        ]}
        scrollEnabled={false}
      />
    </BlurBackground>
  );
};
