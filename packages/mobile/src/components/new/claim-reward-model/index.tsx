import { CardModal } from "modals/card";
import React, { FunctionComponent } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { IconWithText } from "components/new/icon-with-text/icon-with-text";
import { GradientButton } from "../button/gradient-button";
import { ClaimRewardIcon } from "../icon/claim-reward";

export const ClaimRewardsModal: FunctionComponent<{
  isOpen: boolean;
  earnedAmount?: string;
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
        title={"Claim rewards"}
        subtitle={
          "Transaction has been broadcasted to\nblockchain and pending confirmation"
        }
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
            "border-color-white@20%",
            "border-radius-12",
            "padding-12",
            "margin-y-24",
          ]) as ViewStyle
        }
      >
        <Text
          style={
            style.flatten(["body3", "color-white@60%", "flex-2"]) as ViewStyle
          }
        >
          You’ve earned
        </Text>
        <View style={style.flatten(["flex-4", "items-end"])}>
          <Text
            style={
              style.flatten([
                "subtitle3",
                "color-white",
                "text-right",
              ]) as ViewStyle
            }
          >
            {earnedAmount}
          </Text>
        </View>
      </View>
      <GradientButton
        containerStyle={style.flatten(["border-radius-32"]) as ViewStyle}
        textStyle={style.flatten(["body3"]) as ViewStyle}
        text={"Claim my rewards"}
        onPress={onPress}
        loading={buttonLoading}
      />
    </CardModal>
  );
};
