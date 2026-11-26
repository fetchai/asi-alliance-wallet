import { SimpleCardView } from "components/new/card-view/simple-card";
import { ChevronRightIcon } from "components/new/icon/chevron-right";
import { StakeIcon } from "components/new/icon/stake-icon";
import { txnTypeKey, txType } from "components/new/txn-status.tsx";
import React, { FunctionComponent } from "react";
import { ActivityIndicator, TouchableOpacity, ViewStyle } from "react-native";
import LinearGradient from "react-native-linear-gradient";
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
            text1: `${txType[txnTypeKey.withdrawRewards]} in progress`,
          });
          return;
        }
        analyticsStore.logEvent("claim_all_staking_reward_click", {
          pageName: "Home",
        });
        setClaimModel(true);
      }}
    >
      <LinearGradient
        colors={["#F9774B", "#CF447B"]}
        start={{ y: 0.0, x: 0.5 }}
        end={{ y: 1.0, x: 0.0 }}
        style={
          [style.flatten(["border-radius-12"]), { padding: 1 }] as ViewStyle
        }
      >
        <SimpleCardView
          backgroundBlur={false}
          heading={"You’ve claimable staking rewards"}
          leadingIconComponent={<StakeIcon size={14} />}
          trailingIconComponent={
            loadingClaimButton ? (
              <ActivityIndicator
                size="small"
                color={style.get("color-white").color}
              />
            ) : (
              <ChevronRightIcon />
            )
          }
          cardStyle={
            [
              style.flatten(["background-color-indigo-900"]),
              { borderRadius: 11 },
            ] as ViewStyle
          }
          headingStyle={style.flatten(["body3"]) as ViewStyle}
        />
      </LinearGradient>
    </TouchableOpacity>
  ) : null;
};
