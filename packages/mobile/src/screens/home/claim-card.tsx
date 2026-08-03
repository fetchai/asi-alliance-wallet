import { SimpleCardView } from "components/new/card-view/simple-card";
import { ChevronRightIcon } from "components/new/icon/chevron-right";
import { StakeIcon } from "components/new/icon/stake-icon";
import { txnTypeKey, txType } from "components/new/txn-status.tsx";
import React, { FunctionComponent } from "react";
import {
  ActivityIndicator,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Toast from "react-native-toast-message";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";

export const ClaimCard: FunctionComponent<{
  setClaimModel: any;
  loadingClaimButton: boolean;
  isShowClaimOption: boolean;
}> = ({ setClaimModel, loadingClaimButton, isShowClaimOption }) => {
  const style = useStyle();
  const { analyticsStore, activityStore } = useStore();

  return isShowClaimOption ? (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => {
        if (activityStore.getPendingTxnTypes[txnTypeKey.withdrawRewards]) {
          Toast.show({
            type: "error",
            text1: `${txType[txnTypeKey.withdrawRewards]} In Progress`,
          });
          return;
        }
        analyticsStore.logEvent("claim_all_staking_reward_click", {
          pageName: "Home",
        });
        setClaimModel(true);
      }}
    >
      <View style={style.flatten(["border-radius-12"]) as ViewStyle}>
        <SimpleCardView
          backgroundBlur={false}
          heading={"You’ve claimable staking rewards"}
          leadingIconComponent={<StakeIcon size={14} color="black" />}
          trailingIconComponent={
            loadingClaimButton ? (
              <ActivityIndicator
                size="small"
                color={style.get("color-gray-500").color}
              />
            ) : (
              <ChevronRightIcon color="black" />
            )
          }
          cardStyle={
            [
              style.flatten(["border-radius-12"]),
              {
                backgroundColor: style.get("background-color-green-250")
                  .backgroundColor,
              },
            ] as ViewStyle
          }
          headingStyle={style.flatten(["body3", "color-black"]) as ViewStyle}
        />
      </View>
    </TouchableOpacity>
  ) : null;
};
