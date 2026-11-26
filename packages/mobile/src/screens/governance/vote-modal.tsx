import React, { FunctionComponent } from "react";
import { observer } from "mobx-react-lite";
import { ViewStyle, Text } from "react-native";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { RectButton } from "components/rect-button";
import { Button } from "components/button";
import { CardModal } from "modals/card";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { VoteType } from "./details";
import { txnTypeKey } from "components/new/txn-status.tsx";

export const GovernanceVoteModal: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  onPress: () => void;
  vote: VoteType;
  prevVote: VoteType | undefined;
  setVote: any;
  isSendingTx: boolean;

  // Modal can't use the `useSmartNavigation` hook directly.
  // So need to get the props from the parent.
}> = observer(
  ({ close, isOpen, vote, setVote, onPress, isSendingTx, prevVote }) => {
    const { chainStore, accountStore, activityStore } = useStore();

    const account = accountStore.getAccount(chainStore.current.chainId);
    const style = useStyle();

    if (!isOpen) {
      return null;
    }

    return (
      <CardModal
        isOpen={isOpen}
        close={() => {
          setVote(prevVote);
          close();
        }}
        title="Vote"
      >
        <VoteButton
          text={"Yes"}
          select={vote === "Yes"}
          onPress={() => setVote("Yes")}
        />
        <VoteButton
          text={"No"}
          select={vote === "No"}
          onPress={() => setVote("No")}
        />
        <VoteButton
          text={"No with veto"}
          select={vote === "NoWithVeto"}
          onPress={() => setVote("NoWithVeto")}
        />
        <VoteButton
          text={"Abstain"}
          select={vote === "Abstain"}
          onPress={() => setVote("Abstain")}
        />

        <Button
          text="Submit"
          size="large"
          containerStyle={
            style.flatten(["border-radius-64", "margin-top-18"]) as ViewStyle
          }
          textStyle={style.flatten(["body2"]) as ViewStyle}
          disabled={
            vote === "Unspecified" ||
            !account.isReadyToSendTx ||
            prevVote === vote
          }
          loading={
            isSendingTx || activityStore.getPendingTxnTypes[txnTypeKey.govVote]
          }
          onPress={onPress}
        />
      </CardModal>
    );
  }
);

const VoteButton: FunctionComponent<{
  text: string;
  onPress: () => void;
  select: boolean;
}> = ({ text, onPress, select }) => {
  const style = useStyle();
  return (
    <BlurBackground
      borderRadius={12}
      blurIntensity={15}
      containerStyle={style.flatten(["margin-bottom-6"]) as ViewStyle}
    >
      <RectButton
        style={
          style.flatten(
            ["flex-row", "items-center", "justify-between", "padding-18"],
            [select && "background-color-indigo"]
          ) as ViewStyle
        }
        onPress={onPress}
      >
        <Text style={style.flatten(["body3", "color-white"]) as ViewStyle}>
          {text}
        </Text>
      </RectButton>
    </BlurBackground>
  );
};
