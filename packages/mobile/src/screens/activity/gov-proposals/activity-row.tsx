import React, { FunctionComponent } from "react";
import { View, Text, TouchableOpacity, ViewStyle } from "react-native";
import { ColorPalette, useStyle } from "styles/index";
import {
  NavigationProp,
  ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { BlurButton } from "components/new/button/blur-button";
import { useStore } from "stores/index";
import { formatToTruncated } from "utils/format/format";
import { EXPLORER_URL } from "../../../config";

const getHash = (proposal: any) => {
  if (proposal && proposal.id) {
    return formatToTruncated(proposal.id);
  }
  return null;
};

export const GovActivityRow: FunctionComponent<{
  node: any;
}> = ({ node }) => {
  const { queriesStore, chainStore, analyticsStore } = useStore();

  const { proposalId, transaction } = node;
  const { status, id } = transaction;

  const style = useStyle();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  const queries = queriesStore.get(chainStore.current.chainId);
  // const proposalId = JSON.parse(node.message.json).proposalId.low;
  const proposal = queries.cosmos.queryGovernance.getProposal(
    proposalId.toString()
  );
  const vote = node.option;
  // const { status, id } = node.transaction;

  function getVote(vote: string) {
    switch (vote.toUpperCase()) {
      default:
      case "YES":
        return "Yes";

      case "NO":
        return "No";

      case "ABSTAIN":
        return "Abstain";

      case "NO_WITH_VETO":
        return "No with veto";
    }
  }

  function getVoteBadgeColors(vote: string): {
    backgroundColor: string;
    color: string;
  } {
    switch (vote.toUpperCase()) {
      case "YES":
        return {
          backgroundColor: ColorPalette["green-250"],
          color: ColorPalette["dark"],
        };
      case "ABSTAIN":
        return { backgroundColor: "#E8E8E8", color: ColorPalette["dark"] };
      case "NO":
      case "NO_WITH_VETO":
      default:
        return { backgroundColor: "#FEE1E1", color: "#B24D4D" };
    }
  }

  return (
    <TouchableOpacity
      style={style.flatten(["flex-row", "items-center"]) as ViewStyle}
      onPress={() => {
        analyticsStore.logEvent("proposal_view_in_block_explorer_click", {
          tabName: "Gov proposal",
          pageName: "Activity detail",
        });
        navigation.navigate("Others", {
          screen: "WebView",
          params: {
            url: `${EXPLORER_URL}/${chainStore.current.chainId}/transactions/${id}`,
          },
        });
      }}
    >
      <View style={style.flatten(["flex-1", "margin-left-16"]) as ViewStyle}>
        <Text
          style={
            style.flatten([
              "body3",
              "padding-y-6",
              "color-dark",
              "font-medium",
            ]) as ViewStyle
          }
        >
          {proposal ? proposal.title : getHash(node)}
        </Text>
        <Text
          style={
            style.flatten([
              "body3",
              "color-gray-300",
              "font-medium",
            ]) as ViewStyle
          }
        >
          {`PROPOSAL #${proposalId} • ${
            status === "Success" ? "Confirmed" : status ? status : "Failed"
          }`}
        </Text>
      </View>

      <View style={style.flatten(["margin-right-16"]) as ViewStyle}>
        <BlurButton
          text={getVote(vote)}
          borderRadius={5}
          backgroundBlur={false}
          textStyle={
            [
              style.flatten(["text-caption2"]),
              { lineHeight: 14, color: getVoteBadgeColors(vote).color },
            ] as ViewStyle
          }
          containerStyle={
            [
              style.flatten(["padding-x-12", "margin-y-4"]),
              { backgroundColor: getVoteBadgeColors(vote).backgroundColor },
            ] as ViewStyle
          }
        />
      </View>
    </TouchableOpacity>
  );
};
