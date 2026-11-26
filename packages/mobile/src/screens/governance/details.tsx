import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { PageWithScrollView } from "components/page";
import { Platform, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { Button } from "components/button";
import { useStore } from "stores/index";
import {
  useRoute,
  RouteProp,
  useNavigation,
  NavigationProp,
  ParamListBase,
} from "@react-navigation/native";
import { LoadingSpinner } from "components/spinner";
import { Governance } from "@keplr-wallet/stores";
import { IntPretty } from "@keplr-wallet/unit";
import { GovernanceProposalStatusChip } from "./card";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { GovernanceVoteModal } from "./vote-modal";
import { SimpleCardView } from "components/new/card-view/simple-card";
import { FileIcon } from "components/new/icon/file-icon";
import { ExternalLinkIcon } from "components/new/icon/external-link";
import { IconButton } from "components/new/button/icon";
import { BlurButton } from "components/new/button/blur-button";
import { CheckIcon } from "components/new/icon/check";
import moment from "moment";
import { TransactionModal } from "modals/transaction";
import { Buffer } from "buffer";
import { ActivityEnum } from "screens/activity";
import Toast from "react-native-toast-message";
import { useSmartNavigation } from "navigation/smart-navigation";
import { txnTypeKey, txType } from "components/new/txn-status.tsx";

export type VoteType = "Yes" | "No" | "NoWithVeto" | "Abstain" | "Unspecified";
export const TallyVoteInfoView: FunctionComponent<{
  vote: "yes" | "no" | "abstain" | "noWithVeto";
  voted: boolean;
  percentage: IntPretty;
}> = ({ vote, percentage, voted }) => {
  const style = useStyle();

  const text = (() => {
    switch (vote) {
      case "yes":
        return "Yes";
      case "no":
        return "No";
      case "abstain":
        return "Abstain";
      case "noWithVeto":
        return "No with veto";
    }
  })();

  const backgroundColorDefinitions = (() => {
    switch (vote) {
      case "yes":
        return "background-color-indigo-600";
      case "no":
        return "background-color-indigo";
      case "noWithVeto":
        return "background-color-indigo-300";
      case "abstain":
        return "background-color-indigo-200";
    }
  })();

  return (
    <BlurBackground
      borderRadius={12}
      containerStyle={
        style.flatten([
          "height-56",
          "margin-bottom-6",
          "justify-center",
        ]) as ViewStyle
      }
    >
      <View
        style={
          StyleSheet.flatten([
            style.flatten([
              backgroundColorDefinitions,
              "height-56",
              "border-radius-12",
            ]),
            {
              width: `${parseFloat(percentage.toDec().toString(1))}%`,
            },
          ]) as ViewStyle
        }
      />
      <View
        style={
          style.flatten([
            "absolute",
            "margin-left-12",
            "flex-row",
            "items-center",
          ]) as ViewStyle
        }
      >
        <Text
          style={
            style.flatten([
              "body3",
              "color-white",
              "margin-right-6",
            ]) as ViewStyle
          }
        >{`${text} ${percentage.trim(true).maxDecimals(1).toString()}%`}</Text>
        {voted ? (
          <BlurButton
            text={"You voted"}
            backgroundBlur={false}
            leftIcon={<CheckIcon color="white" size={11} />}
            borderRadius={4}
            containerStyle={
              style.flatten([
                "border-width-1",
                "padding-x-8",
                "padding-y-4",
                "justify-center",
                "border-color-white@60%",
              ]) as ViewStyle
            }
            textStyle={
              style.flatten([
                "text-caption2",
                "font-medium",
                "color-white",
                "margin-0",
              ]) as ViewStyle
            }
          />
        ) : null}
      </View>
    </BlurBackground>
  );
};

export const GovernanceDetailsCardBody: FunctionComponent<{
  containerStyle?: ViewStyle;
  proposalId: string;
}> = observer(({ proposalId, containerStyle }) => {
  const { chainStore, queriesStore, accountStore, analyticsStore } = useStore();

  const style = useStyle();

  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const account = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);

  const proposal = queries.cosmos.queryGovernance.getProposal(proposalId);

  const voted = (() => {
    if (!proposal) {
      return undefined;
    }

    if (proposal.proposalStatus === Governance.ProposalStatus.DEPOSIT_PERIOD) {
      return undefined;
    }

    return queries.cosmos.queryProposalVote.getVote(
      proposal.id,
      account.bech32Address
    ).vote;
  })();

  return (
    <React.Fragment>
      {proposal ? (
        <View style={containerStyle}>
          <Text
            style={
              style.flatten([
                "h3",
                "font-normal",
                "color-white",
                "margin-bottom-12",
              ]) as ViewStyle
            }
            // Text selection is only supported well in android.
            // In IOS, the whole text would be selected, this process is somewhat strange, so it is disabled in IOS.
            selectable={Platform.OS === "android"}
          >
            {proposal.title}
          </Text>
          <Text
            numberOfLines={4}
            ellipsizeMode="head"
            style={style.flatten(["body2", "color-white"]) as ViewStyle}
          >
            {proposal.description}
          </Text>
          <View
            style={
              style.flatten([
                "flex-row",
                "items-center",
                "margin-y-16",
                "justify-between",
                "flex-wrap",
              ]) as ViewStyle
            }
          >
            <View
              style={
                style.flatten([
                  "flex-row",
                  "items-center",
                  "margin-right-16",
                ]) as ViewStyle
              }
            >
              <View style={style.flatten(["margin-right-16"]) as ViewStyle}>
                <Text
                  style={
                    style.flatten([
                      "text-caption2",
                      "color-white@60%",
                      "margin-bottom-6",
                    ]) as ViewStyle
                  }
                >
                  Voting start time
                </Text>
                <Text
                  style={
                    style.flatten(["text-caption2", "color-white"]) as ViewStyle
                  }
                >
                  {moment(proposal.raw.voting_start_time)
                    .utc()
                    .format("ddd, DD MMM")}
                </Text>
              </View>
              <View>
                <Text
                  style={
                    style.flatten([
                      "text-caption2",
                      "color-white@60%",
                      "margin-bottom-6",
                    ]) as ViewStyle
                  }
                >
                  Voting end time
                </Text>
                <Text
                  style={
                    style.flatten(["text-caption2", "color-white"]) as ViewStyle
                  }
                >
                  {moment(proposal.raw.voting_end_time)
                    .utc()
                    .format("ddd, DD MMM")}
                </Text>
              </View>
            </View>
            <GovernanceProposalStatusChip status={proposal.proposalStatus} />
          </View>
          {chainStore.current.govUrl && (
            <SimpleCardView
              heading="View full text of the proposal"
              leadingIconComponent={
                <IconButton
                  icon={<FileIcon />}
                  blurIntensity={20}
                  borderRadius={50}
                  iconStyle={
                    style.flatten([
                      "width-32",
                      "height-32",
                      "items-center",
                      "justify-center",
                    ]) as ViewStyle
                  }
                />
              }
              trailingIconComponent={<ExternalLinkIcon />}
              cardStyle={
                style.flatten(["padding-y-18", "margin-bottom-16"]) as ViewStyle
              }
              onPress={() => {
                analyticsStore.logEvent(
                  "proposal_view_in_block_explorer_click",
                  {
                    pageName: "Proposals Detail",
                  }
                );
                navigation.navigate("Others", {
                  screen: "WebView",
                  params: {
                    url: `${chainStore.current.govUrl}${proposalId}`,
                  },
                });
              }}
            />
          )}
          <View style={style.flatten(["margin-bottom-16"]) as ViewStyle}>
            <Text
              style={
                style.flatten([
                  "text-caption2",
                  "color-white@60%",
                  "margin-bottom-10",
                ]) as ViewStyle
              }
            >
              Turnout
            </Text>
            <View>
              <BlurBackground
                borderRadius={6}
                containerStyle={
                  style.flatten(["height-30", "justify-center"]) as ViewStyle
                }
              >
                <View
                  style={
                    StyleSheet.flatten([
                      style.flatten([
                        "height-30",
                        "background-color-orange-500",
                        "border-radius-6",
                      ]),
                      {
                        width: `${parseFloat(
                          proposal.turnout.toDec().toString(1)
                        )}%`,
                      },
                    ]) as ViewStyle
                  }
                />
                <Text
                  style={
                    style.flatten([
                      "body3",
                      "color-white",
                      "absolute",
                      "margin-left-12",
                    ]) as ViewStyle
                  }
                >{`${proposal.turnout
                  .trim(true)
                  .maxDecimals(1)
                  .toString()}%`}</Text>
              </BlurBackground>
            </View>
          </View>
          <TallyVoteInfoView
            vote="yes"
            percentage={proposal.tallyRatio.yes}
            voted={voted === "Yes"}
          />
          <TallyVoteInfoView
            vote="no"
            percentage={proposal.tallyRatio.no}
            voted={voted === "No"}
          />
          <TallyVoteInfoView
            vote="noWithVeto"
            percentage={proposal.tallyRatio.noWithVeto}
            voted={voted === "NoWithVeto"}
          />
          <TallyVoteInfoView
            vote="abstain"
            percentage={proposal.tallyRatio.abstain}
            voted={voted === "Abstain"}
          />
        </View>
      ) : (
        <LoadingSpinner
          color={style.flatten(["color-white"]).color}
          size={20}
        />
      )}
    </React.Fragment>
  );
});

export const GovernanceDetailsScreen: FunctionComponent = observer(() => {
  const {
    chainStore,
    queriesStore,
    accountStore,
    analyticsStore,
    activityStore,
  } = useStore();

  const style = useStyle();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const smartNavigation = useSmartNavigation();

  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          proposalId: string;
        }
      >,
      string
    >
  >();

  const proposalId = route.params.proposalId;

  const [txnHash, setTxnHash] = useState<string>("");
  const [openTxStateModal, setTxStateModal] = useState(false);
  const [isSendingTx, setIsSendingTx] = useState(false);
  const [openGovModel, setGovModalOpen] = useState(false);

  const queries = queriesStore.get(chainStore.current.chainId);
  const account = accountStore.getAccount(chainStore.current.chainId);

  const proposal = queries.cosmos.queryGovernance.getProposal(proposalId);

  const voteEnabled =
    proposal?.proposalStatus === Governance.ProposalStatus.VOTING_PERIOD;

  const voted = (() => {
    if (!proposal) {
      return undefined;
    }

    return queries.cosmos.queryProposalVote.getVote(
      proposal.id,
      account.bech32Address
    ).vote;
  })();
  const [vote, setVote] = useState<VoteType>(
    voted !== undefined ? voted : "Unspecified"
  );
  const voteText = (() => {
    if (!proposal) {
      return "Loading...";
    }
    switch (proposal.proposalStatus) {
      case Governance.ProposalStatus.DEPOSIT_PERIOD:
        return "Vote Not Started";
      case Governance.ProposalStatus.VOTING_PERIOD:
        return voted !== "Unspecified" ? "Change your vote" : "Vote";
      default:
        return "Voting closed";
    }
  })();

  const onSubmit = async () => {
    if (vote !== "Unspecified" && account.isReadyToSendTx) {
      const tx = account.cosmos.makeGovVoteTx(proposalId, vote);
      analyticsStore.logEvent("vote_txn_click");
      setIsSendingTx(true);

      try {
        let gas = account.cosmos.msgOpts.govVote.gas;

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
        setGovModalOpen(false);
        await tx.send({ amount: [], gas: gas.toString() }, "", undefined, {
          onBroadcasted: (txHash) => {
            setTxnHash(Buffer.from(txHash).toString("hex"));
            setTxStateModal(true);
            analyticsStore.logEvent("vote_txn_broadcasted", {
              chainId: chainStore.current.chainId,
              chainName: chainStore.current.chainName,
            });
          },
        });
      } catch (e) {
        setVote(voted !== undefined ? voted : "Unspecified");
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
        smartNavigation.navigateSmart("Home", {});
        analyticsStore.logEvent("vote_txn_broadcasted_fail", {
          chainId: chainStore.current.chainId,
          chainName: chainStore.current.chainName,
          message: e?.message ?? "",
        });
      } finally {
        setIsSendingTx(false);
      }
    }
  };

  return (
    <PageWithScrollView
      backgroundMode="image"
      style={style.flatten(["padding-x-page"]) as ViewStyle}
      containerStyle={style.flatten(["overflow-scroll"]) as ViewStyle}
      contentContainerStyle={style.get("flex-grow-1")}
    >
      <GovernanceDetailsCardBody proposalId={proposalId} />
      <View style={style.flatten(["flex-1"])} />
      <Button
        text={voteText}
        size="large"
        mode={voteText === "Change your vote" ? "outline" : "fill"}
        containerStyle={
          style.flatten(
            ["border-radius-64", "margin-top-16"],
            [voteText === "Change your vote" && "border-color-white@20%"]
          ) as ViewStyle
        }
        textStyle={style.flatten(["body2"]) as ViewStyle}
        rippleColor="black@50%"
        loading={isSendingTx}
        showLoadingSpinner={true}
        disabled={!voteEnabled || !account.isReadyToSendTx || isSendingTx}
        onPress={() => {
          if (activityStore.getPendingTxnTypes[txnTypeKey.govVote]) {
            Toast.show({
              type: "error",
              text1: `${txType[txnTypeKey.govVote]} in progress`,
            });
            return;
          }
          setGovModalOpen(true);
        }}
      />
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      <GovernanceVoteModal
        isOpen={openGovModel}
        close={() => setGovModalOpen(false)}
        vote={vote}
        setVote={setVote}
        prevVote={voted}
        isSendingTx={isSendingTx}
        onPress={onSubmit}
      />
      <TransactionModal
        isOpen={openTxStateModal}
        close={() => {
          setTxStateModal(false);
        }}
        txnHash={txnHash}
        chainId={chainStore.current.chainId}
        buttonText="Go to activity screen"
        onHomeClick={() => {
          navigation.navigate("MainTab", {
            screen: "ActivityTab",
            params: {
              tabId: ActivityEnum.GovProposals,
            },
          });
        }}
        onTryAgainClick={onSubmit}
      />
    </PageWithScrollView>
  );
});
