import React, { FunctionComponent, useState } from "react";
import { Text, ViewStyle } from "react-native";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { useStyle } from "styles/index";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { AppCurrency } from "@keplr-wallet/types";
import { useStore } from "stores/index";
import { Dec } from "@keplr-wallet/unit";
import { useNetInfo } from "@react-native-community/netinfo";
import Toast from "react-native-toast-message";
import { TransactionModal } from "modals/transaction";
import { GradientButton } from "components/new/button/gradient-button";
import { ClaimRewardsModal } from "../claim-reward-model";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { StakeCard } from "screens/stake/dashboard/stake-card";
import { txType } from "components/new/txn-status.tsx";
import { observer } from "mobx-react-lite";

export const PortfolioStakingCard: FunctionComponent<{
  cardStyle?: ViewStyle;
}> = observer(({ cardStyle }) => {
  const [isSendingTx, setIsSendingTx] = useState(false);
  const [showClaimModel, setClaimModel] = useState(false);

  const style = useStyle();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const netInfo = useNetInfo();
  const networkIsConnected =
    typeof netInfo.isConnected !== "boolean" || netInfo.isConnected;

  const { chainStore, accountStore, queriesStore, analyticsStore } = useStore();
  const current = chainStore.current;
  const queries = queriesStore.get(current.chainId);
  const accountInfo = accountStore.getAccount(current.chainId);
  const balanceQuery = queries.queryBalances.getQueryBech32Address(
    accountInfo.bech32Address
  );
  const balanceStakableQuery = balanceQuery.stakable;

  const isNoble =
    ChainIdHelper.parse(chainStore.current.chainId).identifier === "noble";
  const hasUSDC = chainStore.current.currencies.find(
    (currency: AppCurrency) => currency.coinMinimalDenom === "uusdc"
  );

  const stakable = (() => {
    if (isNoble && hasUSDC) {
      return balanceQuery.getBalanceFromCurrency(hasUSDC);
    }

    return balanceStakableQuery.balance;
  })();

  const rewards = queries.cosmos.queryRewards.getQueryBech32Address(
    accountInfo.bech32Address
  );

  const stakableReward = rewards.stakableReward;

  const [txnHash, setTxnHash] = useState<string>("");
  const [openModal, setOpenModal] = useState(false);

  async function onSubmit() {
    const validatorAddresses =
      rewards.getDescendingPendingRewardValidatorAddresses(8);
    const tx =
      accountInfo.cosmos.makeWithdrawDelegationRewardTx(validatorAddresses);

    setIsSendingTx(true);

    try {
      analyticsStore.logEvent("claim_click", {
        pageName: "Portfolio",
      });
      let gas =
        accountInfo.cosmos.msgOpts.withdrawRewards.gas *
        validatorAddresses.length;

      // Gas adjustment is 1.5
      // Since there is currently no convenient way to adjust the gas adjustment on the UI,
      // Use high gas adjustment to prevent failure.
      try {
        gas = (await tx.simulate()).gasUsed * 1.5;
      } catch (e) {
        // Some chain with older version of cosmos sdk (below @0.43 version) can't handle the simulation.
        // Therefore, the failure is expected. If the simulation fails, simply use the default value.
        console.log(e);
      }
      setClaimModel(false);
      Toast.show({
        type: "success",
        text1: "claim in process",
      });
      await tx.send({ amount: [], gas: gas.toString() }, "", undefined, {
        onBroadcasted: (txHash) => {
          analyticsStore.logEvent("claim_txn_broadcasted", {
            chainId: chainStore.current.chainId,
            chainName: chainStore.current.chainName,
            pageName: "Portfolio",
          });
          setTxnHash(Buffer.from(txHash).toString("hex"));
          setOpenModal(true);
        },
      });
    } catch (e) {
      if (
        e?.message === "Request rejected" ||
        e?.message === "Transaction rejected"
      ) {
        Toast.show({
          type: "error",
          text1: "Transaction rejected",
        });
        return;
      } else {
        Toast.show({
          type: "error",
          text1: e?.message,
        });
      }
      console.log(e);
      analyticsStore.logEvent("claim_txn_broadcasted_fail", {
        chainId: chainStore.current.chainId,
        chainName: chainStore.current.chainName,
        pageName: "Portfolio",
      });
      navigation.navigate("Home", {});
    } finally {
      setClaimModel(false);
      setIsSendingTx(false);
    }
  }

  return (
    <BlurBackground
      blurIntensity={10}
      containerStyle={
        [
          style.flatten(["padding-18", "border-radius-16"]),
          cardStyle,
        ] as ViewStyle
      }
    >
      <Text
        style={
          style.flatten([
            "color-white",
            "subtitle3",
            "margin-bottom-20",
          ]) as ViewStyle
        }
      >
        STAKING
      </Text>
      <StakeCard />
      {!(
        !networkIsConnected ||
        !accountInfo.isReadyToSendTx ||
        stakableReward.toDec().equals(new Dec(0)) ||
        stakable.toDec().lte(new Dec(0)) ||
        rewards.pendingRewardValidatorAddresses.length === 0
      ) ? (
        <GradientButton
          text="Claim rewards"
          size="default"
          containerStyle={
            style.flatten(["border-radius-64", "margin-top-20"]) as ViewStyle
          }
          textStyle={style.flatten(["body3"]) as ViewStyle}
          rippleColor="black@50%"
          onPress={() => {
            if (accountInfo.txTypeInProgress === "withdrawRewards") {
              Toast.show({
                type: "error",
                text1: `${txType[accountInfo.txTypeInProgress]} in progress`,
              });
              return;
            }
            setClaimModel(true);
            analyticsStore.logEvent("claim_all_staking_reward_click", {
              pageName: "Portfolio",
            });
          }}
          loading={isSendingTx}
        />
      ) : null}
      <TransactionModal
        isOpen={openModal}
        close={() => {
          setOpenModal(false);
        }}
        txnHash={txnHash}
        chainId={chainStore.current.chainId}
        buttonText="Go to activity screen"
        onHomeClick={() => navigation.navigate("ActivityTab", {})}
        onTryAgainClick={onSubmit}
      />
      <ClaimRewardsModal
        isOpen={showClaimModel}
        close={() => setClaimModel(false)}
        earnedAmount={`${Number(
          stakableReward.trim(true).shrink(true).toString().split(" ")[0]
        ).toLocaleString("en-US")} ${
          stakableReward.trim(true).shrink(true).toString().split(" ")[1]
        }`}
        onPress={onSubmit}
        buttonLoading={
          isSendingTx || accountInfo.txTypeInProgress === "withdrawRewards"
        }
      />
    </BlurBackground>
  );
});
