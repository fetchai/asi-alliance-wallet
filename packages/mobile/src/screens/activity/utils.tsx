import { UpDownArrowIcon } from "components/new/icon/up-down-arrow";
import { StakeIcon } from "components/new/icon/stake-icon";
import { UnstakedIcon } from "components/new/icon/unstaked";
import { EditIcon } from "components/new/icon/edit";
import { LeftRightCrossIcon } from "components/new/icon/left-right-cross";
import { ClaimIcon } from "components/new/icon/claim-icon";
import { IbcUpDownIcon } from "components/new/icon/ibc-up-down";
import React from "react";
import { FilterItem } from "components/filter";
import { fetchGovProposalTransactions } from "../../graphQL/activity-api";

export const govOptions: FilterItem[] = [
  { title: "Voted Yes", value: "YES", isSelected: true },
  { title: "Voted No", value: "NO", isSelected: true },
  {
    title: "Voted Abstain",
    value: "ABSTAIN",
    isSelected: true,
  },
  {
    title: "Voted No With Veto",
    value: "NO_WITH_VETO",
    isSelected: true,
  },
];

export const txOptions: FilterItem[] = [
  {
    icon: (
      <UpDownArrowIcon
        size={14}
        color1={"white"}
        color2={"white"}
        color3={"white"}
      />
    ),
    title: "Funds transfers",
    value: "/cosmos.bank.v1beta1.MsgSend",
    isSelected: true,
  },
  {
    icon: <StakeIcon size={14} />,
    title: "Staked Funds",
    value: "/cosmos.staking.v1beta1.MsgDelegate",
    isSelected: true,
  },
  {
    icon: <UnstakedIcon />,
    title: "Unstaked Funds",
    value: "/cosmos.staking.v1beta1.MsgUndelegate",
    isSelected: true,
  },
  {
    icon: <EditIcon />,
    title: "Redelegate Funds",
    value: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
    isSelected: true,
  },
  {
    icon: <LeftRightCrossIcon size={20} />,
    title: "Contract Interactions",
    value:
      "/cosmos.authz.v1beta1.MsgExec,/cosmwasm.wasm.v1.MsgExecuteContract,/cosmos.authz.v1beta1.MsgRevoke",
    isSelected: true,
  },
  {
    icon: <ClaimIcon />,
    title: "Claim Rewards",
    value: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
    isSelected: true,
  },
  {
    icon: <IbcUpDownIcon size={20} />,
    title: "IBC transfers",
    value: "/ibc.applications.transfer.v1.MsgTransfer",
    isSelected: true,
  },
];

export const processFilters = (filters: FilterItem[]) => {
  let result: any[] = [];
  filters
    .filter((filter) => filter.isSelected)
    .map((data) => {
      result = result.concat(data.value.split(","));
    });
  return result;
};

export const getProposalIdFromLogs = (logs: string) => {
  let proposalId = "";
  const parsedLogs = JSON.parse(logs);
  let log = [];

  if (Array.isArray(parsedLogs) && parsedLogs.length) {
    log = parsedLogs?.[0]?.events || [];
  }

  const attributes =
    log
      .map((item: any) => {
        if (item.type && item.type === "proposal_vote") {
          return item?.attributes;
        }
      })
      .find((item: any) => item) || [];

  if (Array.isArray(attributes) && attributes.length) {
    proposalId = attributes.find(
      (item: any) => item.key === "proposal_id"
    ).value;
  }

  return proposalId;
};

export const fetchProposalNodes = async (
  cursor: any,
  chainId: string,
  bech32Address: string
) => {
  try {
    let parsedNodes: any = [];
    // avoid fetching for test networks (remote and local)
    if (
      chainId &&
      chainId !== "test" &&
      chainId !== "test-local" &&
      bech32Address
    ) {
      const fetchedData = await fetchGovProposalTransactions(
        chainId,
        cursor,
        bech32Address,
        govOptions.map((option) => option.value)
      );
      if (fetchedData) {
        parsedNodes = fetchedData.nodes.map((node: any) => ({
          ...node,
          proposalId: getProposalIdFromLogs(node.transaction.log),
        }));
        return parsedNodes;
      } else {
        return parsedNodes;
      }
    } else {
      return parsedNodes;
    }
  } catch (error) {
    return [];
  }
};
