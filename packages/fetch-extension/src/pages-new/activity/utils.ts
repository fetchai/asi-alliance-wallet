import { AppCurrency } from "@keplr-wallet/types";
import { shortenNumber } from "@utils/format";
import sendIcon from "@assets/svg/wireframe/asi-send.svg";
import recieveIcon from "@assets/svg/wireframe/activity-recieve.svg";
import stakeIcon from "@assets/svg/wireframe/asi-staked.svg";
import { fetchGovProposalTransactions } from "@graphQL/activity-api";

const getAmount = (denom: string, amount: string, chainStore: any) => {
  const amountCurrency = chainStore.current.currencies.find(
    (currency: AppCurrency) => currency.coinMinimalDenom === denom
  );
  if (amountCurrency) {
    const amountValue = shortenNumber(amount, amountCurrency?.coinDecimals);

    return `${amountValue}${amountCurrency.coinDenom}`;
  } else return `${amount} ${denom}`;
};
const parseAmount = (amount: string): [string, string] => {
  const matches = amount.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);

  if (matches) {
    const [, numberPart, alphabeticPart] = matches;
    return [numberPart, alphabeticPart];
  }

  return ["", ""];
};
export const getDetails = (node: any, chainStore: any): any => {
  const { nodes } = node.transaction.messages;
  const { timestamp } = node.block;
  const { typeUrl, json } = nodes[0];
  const parsedJson = JSON.parse(json);
  const toAddress = parsedJson.toAddress;
  const { delegatorAddress, validatorAddress, validatorDstAddress, receiver } =
    parsedJson;
  const {
    fees,
    memo,
    id: hash,
    signerAddress,
    gasUsed,
    gasWanted,
    chainId,
    status,
  } = node.transaction;
  const amt = parsedJson.amount;
  let currency = "afet";
  const isAmountDeducted = parseFloat(node.balanceOffset) < 0;
  if (parsedJson.amount) {
    currency = Array.isArray(parsedJson.amount)
      ? parsedJson.amount[0].denom
      : parsedJson.amount.denom;
  } else if (parsedJson.token) {
    currency = parsedJson.token.denom;
  }

  let verb = "Spent";

  switch (typeUrl) {
    case "/cosmos.staking.v1beta1.MsgBeginRedelegate":
      verb = "Redelegated";
      break;
    case "/cosmos.bank.v1beta1.MsgSend":
      verb = isAmountDeducted ? "Sent" : "Received";
      break;
    case "/ibc.applications.transfer.v1.MsgTransfer":
      verb = "IBC transfer";
      break;
    case "/cosmos.staking.v1beta1.MsgDelegate":
      verb = "Staked";
      break;
    case "/cosmos.staking.v1beta1.MsgUndelegate":
      verb = "Unstaked";
      break;
    case "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward":
      verb = "Claimed";
      break;
    case "/cosmos.authz.v1beta1.MsgExec":
    case "/cosmwasm.wasm.v1.MsgExecuteContract":
    case "/cosmos.authz.v1beta1.MsgRevoke":
      verb = "Smart Contract Interaction";
      break;
    default:
      verb = isAmountDeducted ? "Transferred" : "Received";
  }
  const amount = getAmount(currency, node.balanceOffset, chainStore);
  const [amountNumber, amountAlphabetic] = parseAmount(amount);
  const currentFees = JSON.parse(fees);
  let fee = "";

  if (currentFees.length > 0) {
    fee = getAmount(currentFees[0].denom, currentFees[0].amount, chainStore);
  }
  const [feeNumber, feeAlphabetic] = parseAmount(fee);

  const validatorCount =
    Object.values(nodes).length > 1 ? Object.values(nodes).length - 1 : 0;

  return {
    amountNumber,
    amountAlphabetic,
    verb,
    timestamp,
    fees,
    memo,
    signerAddress,
    hash,
    amt,
    gasUsed,
    gasWanted,
    toAddress,
    validatorAddress,
    delegatorAddress,
    validatorDstAddress,
    receiver,
    feeNumber,
    feeAlphabetic,
    chainId,
    status,
    nodes,
    validatorCount,
  };
};

export const getActivityIcon = (type: string, verb: string): string => {
  switch (type) {
    case "/cosmos.bank.v1beta1.MsgSend":
      return verb === "Sent" ? sendIcon : recieveIcon;
    case "/cosmos.staking.v1beta1.MsgDelegate":
    case "/cosmos.staking.v1beta1.MsgUndelegate":
    case "/cosmos.staking.v1beta1.MsgBeginRedelegate":
    case "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward":
    case "contract":
      return stakeIcon;
    default:
      return stakeIcon;
  }
};

//gov utils
export const govOptions = [
  { value: "YES", label: "Voted Yes" },
  { value: "NO", label: "Voted No" },
  { value: "ABSTAIN", label: "Voted Abstain" },
  { value: "NO_WITH_VETO", label: "Voted No With Veto" },
];

export const calculatePercentages = (
  yes: string,
  abstain: string,
  no: string,
  noWithVeto: string
) => {
  const yesVotes = BigInt(yes);
  const abstainVotes = BigInt(abstain);
  const noVotes = BigInt(no);
  const noWithVetoVotes = BigInt(noWithVeto);

  const totalVotes = yesVotes + abstainVotes + noVotes + noWithVetoVotes;
  if (totalVotes === BigInt(0)) {
    return {
      yesPercentage: "0",
      abstainPercentage: "0",
      noPercentage: "0",
      noWithVetoPercentage: "0",
    };
  }

  const yesPercentage = (Number(yesVotes) / Number(totalVotes)) * 100;
  const abstainPercentage = (Number(abstainVotes) / Number(totalVotes)) * 100;
  const noPercentage = (Number(noVotes) / Number(totalVotes)) * 100;
  const noWithVetoPercentage =
    (Number(noWithVetoVotes) / Number(totalVotes)) * 100;

  return {
    yesPercentage: yesPercentage.toFixed(2),
    abstainPercentage: abstainPercentage.toFixed(2),
    noPercentage: noPercentage.toFixed(2),
    noWithVetoPercentage: noWithVetoPercentage.toFixed(2),
  };
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
          transaction: {
            ...node.transaction,
            chainId,
            signerAddress: bech32Address,
          },
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
