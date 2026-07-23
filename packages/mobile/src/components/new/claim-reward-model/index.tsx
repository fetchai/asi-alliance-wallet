import { CardModal } from "modals/card";
import React, { FunctionComponent } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { IconWithText } from "components/new/icon-with-text/icon-with-text";
import { Button } from "components/button";
import { ClaimRewardIcon } from "../icon/claim-reward";
import { CoinPretty } from "@keplr-wallet/unit";
import { formatBalance } from "utils/format/format";

export const ClaimRewardsModal: FunctionComponent<{
  isOpen: boolean;
  earnedAmount?: CoinPretty;
  close: () => void;
  onPress?: () => void;
  buttonLoading?: boolean;
}> = ({ isOpen, onPress, close, earnedAmount, buttonLoading }) => {
  const style = useStyle();

  if (!isOpen) {
    return null;
  }

  return (
    <CardModal
      isOpen={isOpen}
      disableGesture={true}
      close={close}
      showCloseButton={false}
    >
      <IconWithText
        icon={<ClaimRewardIcon size={64} />}
        iconStyle={style.flatten(["margin-bottom-24"]) as ViewStyle}
        title={"Claim Rewards"}
        subtitle={"Claim your pending staking rewards\nto your wallet"}
        titleStyle={style.flatten(["body1"]) as ViewStyle}
        subtitleStyle={
          style.flatten(["body3", "padding-y-0", "margin-top-6"]) as ViewStyle
        }
      />
      <View
        style={
          style.flatten([
            "flex-row",
            "items-center",
            "border-width-1",
            "border-color-gray-100",
            "border-radius-12",
            "padding-12",
            "margin-y-24",
          ]) as ViewStyle
        }
      >
        <Text
          style={
            style.flatten(["body3", "color-gray-300", "flex-2"]) as ViewStyle
          }
        >
          You’ve earned
        </Text>
        <View style={style.flatten(["flex-4", "items-end"])}>
          <Text
            style={
              style.flatten([
                "subtitle3",
                "color-dark",
                "text-right",
              ]) as ViewStyle
            }
          >
            {earnedAmount ? formatBalance(earnedAmount) : ""}
          </Text>
        </View>
      </View>
      <Button
        containerStyle={
          style.flatten([
            "border-radius-32",
            "background-color-green-250",
          ]) as ViewStyle
        }
        textStyle={style.flatten(["body3", "color-dark"]) as ViewStyle}
        text={"Claim My Rewards"}
        onPress={onPress}
        loading={buttonLoading}
        rippleColor="#85cc80"
      />
    </CardModal>
  );
};
