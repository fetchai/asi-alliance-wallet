import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStyle } from "styles/index";
import { Text, View, ViewStyle } from "react-native";
import { LineGraphView } from "components/new/line-graph";

export const TokenGraphSection: FunctionComponent<{
  totalNumber: string;
  totalDenom: string;
  tokenName?: string;
}> = observer(({ tokenName }) => {
  const style = useStyle();

  const [tokenState, setTokenState] = useState({
    percentageDiff: 0,
    diff: 0,
    time: "TODAY",
    type: "positive",
  });

  const changeInDollarsValue =
    tokenState.type === "positive"
      ? tokenState.diff / 100
      : -tokenState.diff / 100;

  return (
    <React.Fragment>
      {tokenState ? (
        <View
          style={style.flatten(["flex-row", "justify-center"]) as ViewStyle}
        >
          <Text
            style={
              style.flatten(
                ["color-orange-400", "text-caption2"],
                [tokenState.type === "positive" && "color-vibrant-green-500"]
              ) as ViewStyle
            }
          >
            {changeInDollarsValue.toFixed(4)} (
            {tokenState.type === "positive" ? "+" : "-"}
            {Number.isNaN(parseFloat(tokenState?.percentageDiff?.toString()))
              ? "0"
              : parseFloat(tokenState?.percentageDiff?.toString()).toFixed(1)}
            %)
          </Text>
          <Text style={style.flatten(["color-gray-300", "h7"]) as ViewStyle}>
            {`  ${tokenState.time}`}
          </Text>
        </View>
      ) : null}
      <LineGraphView setTokenState={setTokenState} tokenName={tokenName} />
    </React.Fragment>
  );
});
