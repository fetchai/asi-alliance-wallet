import React, { FunctionComponent } from "react";
import { View, Text, ViewStyle, ActivityIndicator } from "react-native";
import { BlurBackground } from "../blur-background/blur-background";
import { useStyle } from "styles/index";

interface txTypes {
  [key: string]: string;
}

export enum txnTypeKey {
  ibcTransfer = "ibcTransfer",
  send = "send",
  withdrawRewards = "withdrawRewards",
  delegate = "delegate",
  undelegate = "undelegate",
  redelegate = "redelegate",
  govVote = "govVote",
  nativeBridgeSend = "nativeBridgeSend",
  approval = "approval",
  createSecret20ViewingKey = "createSecret20ViewingKey",
}

export const txType: txTypes = {
  ibcTransfer: "IBC Transfer",
  send: "Send Transaction",
  withdrawRewards: "Rewards withdrawl",
  delegate: "Delegation",
  undelegate: "Undelegation",
  redelegate: "Redelegation",
  govVote: "Governance Vote",
  nativeBridgeSend: "Bridging",
  approval: "Approve txn",
  createSecret20ViewingKey: "Secret key creation",
};
export const TxnStatus: FunctionComponent<{
  txnType: string;
  containerStyle?: ViewStyle;
}> = ({ txnType, containerStyle }) => {
  const style = useStyle();

  return (
    <BlurBackground
      borderRadius={12}
      blurIntensity={16}
      containerStyle={
        [
          style.flatten([
            "flex-row",
            "items-center",
            "padding-x-18",
            "padding-y-12",
            "border-width-1",
            "border-color-indigo-20",
          ]),
          containerStyle,
        ] as ViewStyle
      }
    >
      <Text
        style={
          [
            style.flatten(["color-white", "body3"]),
            { lineHeight: 16 },
          ] as ViewStyle
        }
      >
        {`${txnType} in progress`}
      </Text>
      <View style={style.flatten(["margin-left-8"]) as ViewStyle}>
        <ActivityIndicator
          size="small"
          color={style.get("color-white").color}
        />
      </View>
    </BlurBackground>
  );
};
