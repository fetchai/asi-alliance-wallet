import React, { FunctionComponent, useState } from "react";
import { useStore } from "stores/index";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { useSmartNavigation } from "navigation/smart-navigation";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { Button } from "components/button";
import Toast from "react-native-toast-message";
import { useNetInfo } from "@react-native-community/netinfo";
import { Dec } from "@keplr-wallet/unit";
import { TransactionModal } from "modals/transaction";
import { ClaimRewardsModal } from "components/new/claim-reward-model";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { txnTypeKey, txType } from "components/new/txn-status.tsx";
import { formatBalance } from "utils/format/format";

export const DelegatedCard: FunctionComponent<{
  containerStyle?: ViewStyle;

  validatorAddress: string;
}> = ({ containerStyle, validatorAddress }) => {
  const {
    chainStore,
    queriesStore,
    accountStore,
    analyticsStore,
    activityStore,
  } = useStore();

  const [isSendingTx, setIsSendingTx] = useState(false);
  const [showTransectionModal, setTransectionModal] = useState(false);
  const [txnHash, setTxnHash] = useState<string>("");
  const [showClaimModel, setClaimModel] = useState(false);

  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const smartNavigation = useSmartNavigation();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const style = useStyle();

  const staked = queries.cosmos.queryDelegations
    .getQueryBech32Address(account.bech32Address)
    .getDelegationTo(validatorAddress);

  const stakableReward = queries.cosmos.queryRewards
    .getQueryBech32Address(account.bech32Address)
    .getStakableRewardOf(validatorAddress);

  const handleClaim = async () => {
    if (!networkIsConnected) {
      Toast.show({
        type: "error",
        text1: "No Internet Connection",
      });
      return;
    }

    setIsSendingTx(true);

    try {
      analyticsStore.logEvent("claim_click", {
        pageName: "Validator Details",
      });

      setClaimModel(false);
      Toast.show({
        type: "success",
        text1: "Claim In Progress",
      });
      await account.cosmos.sendWithdrawDelegationRewardMsgs(
        [validatorAddress],
        "",
        undefined,
        undefined,
        {
          onBroadcasted: (txHash) => {
            analyticsStore.logEvent("claim_txn_broadcasted", {
              chainId: chainStore.current.chainId,
              chainName: chainStore.current.chainName,
              pageName: "Validator Details",
            });
            setTxnHash(Buffer.from(txHash).toString("hex"));
            setTransectionModal(true);
          },
        }
      );
    } catch (e) {
      analyticsStore.logEvent("claim_txn_broadcasted_fail", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        pageName: "Validator Details",
      });
      if (
        e?.message === "Request rejected" ||
        e?.message === "Transaction rejected"
      ) {
        Toast.show({
          type: "error",
          text1: "Transaction Rejected",
        });
        return;
      } else {
        Toast.show({
          type: "error",
          text1: e?.message,
        });
      }
      console.log(e);
      navigation.navigate("Home", {});
    } finally {
      setClaimModel(false);
      setIsSendingTx(false);
    }
  };
  const txnInProgressMessage = () => {
    if (activityStore.getPendingTxnTypes[txnTypeKey.undelegate]) {
      return txType[txnTypeKey.undelegate];
    } else if (activityStore.getPendingTxnTypes[txnTypeKey.redelegate]) {
      return txType[txnTypeKey.redelegate];
    } else if (activityStore.getPendingTxnTypes[txnTypeKey.delegate]) {
      return txType[txnTypeKey.delegate];
    }

    return "Transaction";
  };

  return (
    <React.Fragment>
      <BlurBackground
        borderRadius={12}
        backgroundBlur={false}
        containerStyle={
          [
            {
              ...style.flatten(["padding-14"]),
              backgroundColor: "#e3fee1",
            },
            containerStyle,
          ] as ViewStyle
        }
      >
        <View
          style={
            style.flatten([
              "flex-row",
              "justify-between",
              "margin-bottom-12",
            ]) as ViewStyle
          }
        >
          <Text
            style={
              style.flatten(["body3", "color-gray-300", "flex-1"]) as ViewStyle
            }
          >
            Staked amount
          </Text>
          <Text
            style={
              style.flatten([
                "color-dark",
                "subtitle3",
                "text-right",
              ]) as ViewStyle
            }
          >
            {formatBalance(staked, 10, false)}
          </Text>
        </View>
        <View
          style={
            style.flatten([
              "flex-row",
              "justify-between",
              "margin-bottom-4",
            ]) as ViewStyle
          }
        >
          <Text
            style={
              style.flatten(["body3", "color-gray-300", "flex-1"]) as ViewStyle
            }
          >
            Earned rewards
          </Text>
          <Text
            style={
              style.flatten([
                "color-dark",
                "subtitle3",
                "text-right",
              ]) as ViewStyle
            }
          >
            {formatBalance(stakableReward, 10, false)}
          </Text>
        </View>
        {/* <View
        style={
          style.flatten([
            "flex-row",
            "justify-between",
            "margin-y-2",
          ]) as ViewStyle
        }
      >
        <Text style={style.flatten(["color-gray-200"]) as ViewStyle}>
          Claimable rewards
        </Text>
        <Text style={style.flatten(["color-white", "h7"]) as ViewStyle}>
          {"123 FET"}
        </Text>
      </View> */}
        <Button
          text="Unstake"
          size="small"
          containerStyle={
            style.flatten([
              "border-radius-32",
              "margin-top-12",
              "background-color-dark",
            ]) as ViewStyle
          }
          textStyle={style.flatten(["body3", "color-white"]) as ViewStyle}
          onPress={() => {
            analyticsStore.logEvent("unstake_click", {
              chainId: chainStore.current.chainId,
              chainName: chainStore.current.chainName,
              pageName: "Validator Detail",
            });
            if (
              activityStore.getPendingTxnTypes[txnTypeKey.undelegate] ||
              activityStore.getPendingTxnTypes[txnTypeKey.redelegate] ||
              activityStore.getPendingTxnTypes[txnTypeKey.delegate]
            ) {
              Toast.show({
                type: "error",
                text1: `${txnInProgressMessage()} In Progress`,
              });
              return;
            }
            smartNavigation.navigateSmart("Undelegate", {
              validatorAddress,
            });
          }}
        />
        {!(
          !networkIsConnected ||
          !account.isReadyToSendTx ||
          stakableReward.toDec().equals(new Dec(0))
        ) ? (
          <Button
            text="Claim Rewards"
            size="small"
            containerStyle={
              {
                ...style.flatten(["border-radius-32", "margin-top-12"]),
                backgroundColor: style.get("background-color-green-250")
                  .backgroundColor,
              } as ViewStyle
            }
            textStyle={style.flatten(["body3", "color-dark"]) as ViewStyle}
            onPress={() => {
              if (
                activityStore.getPendingTxnTypes[txnTypeKey.withdrawRewards]
              ) {
                Toast.show({
                  type: "error",
                  text1: `${txType[txnTypeKey.withdrawRewards]} In Progress`,
                });
                return;
              }
              analyticsStore.logEvent("claim_staking_reward_click", {
                pageName: "Validator Details",
              });
              setClaimModel(true);
            }}
            loading={isSendingTx}
          />
        ) : null}
      </BlurBackground>
      <TransactionModal
        isOpen={showTransectionModal}
        close={() => {
          setTransectionModal(false);
        }}
        txnHash={txnHash}
        chainId={chainStore.current.chainId}
        buttonText="Go to activity screen"
        onHomeClick={() => navigation.navigate("ActivityTab", {})}
        onTryAgainClick={handleClaim}
      />
      <ClaimRewardsModal
        isOpen={showClaimModel}
        close={() => setClaimModel(false)}
        earnedAmount={formatBalance(stakableReward)}
        onPress={handleClaim}
        buttonLoading={
          isSendingTx ||
          activityStore.getPendingTxnTypes[txnTypeKey.withdrawRewards]
        }
      />
    </React.Fragment>
  );
};
