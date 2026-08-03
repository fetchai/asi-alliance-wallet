import { BlurBackground } from "components/new/blur-background/blur-background";
import React, { FunctionComponent } from "react";
import { Text, ViewStyle } from "react-native";
import { useStyle } from "styles/index";

export const WordChip: FunctionComponent<{
  word: string;

  empty?: boolean;
  dashedBorder?: boolean;
}> = ({ word, empty, dashedBorder }) => {
  const style = useStyle();

  return (
    <BlurBackground
      blurIntensity={0}
      borderRadius={8}
      containerStyle={
        [
          style.flatten(
            ["padding-y-12", "margin-4", "flex-1", "items-center"],
            dashedBorder ? ["border-width-1"] : []
          ),
          {
            backgroundColor: "white",
            ...(dashedBorder ? { borderColor: "#d0d1d1" } : {}),
          },
        ] as ViewStyle
      }
    >
      <Text style={style.flatten(["body3", "color-black"]) as ViewStyle}>
        {empty ? `` : `${word}`}
      </Text>
    </BlurBackground>
  );
};
