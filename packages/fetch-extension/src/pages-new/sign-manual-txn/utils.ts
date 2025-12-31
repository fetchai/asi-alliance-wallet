import { MsgSend } from "@keplr-wallet/proto-types/cosmos/bank/v1beta1/tx";
import { MsgWithdrawDelegatorReward } from "@keplr-wallet/proto-types/cosmos/distribution/v1beta1/tx";
import { VoteOption } from "@keplr-wallet/proto-types/cosmos/gov/v1beta1/gov";
import { MsgVote } from "@keplr-wallet/proto-types/cosmos/gov/v1beta1/tx";
import {
  MsgBeginRedelegate,
  MsgDelegate,
  MsgUndelegate,
} from "@keplr-wallet/proto-types/cosmos/staking/v1beta1/tx";
import { SignDoc, StdSignDoc } from "@keplr-wallet/types";
/* eslint-disable-next-line import/no-extraneous-dependencies */
import Long from "long";

//Validate a Direct SignDoc (protobuf)
export function validateDirectSignDoc(
  signDoc: any,
  targetChainId: string
): asserts signDoc is SignDoc {
  if (!signDoc) throw new Error("Signdoc is null or undefined");
  if (!signDoc.bodyBytes) throw new Error("bodyBytes is missing");
  if (!signDoc.authInfoBytes) throw new Error("authInfoBytes is missing");
  if (!signDoc.chainId) throw new Error("chainId is missing");

  if (signDoc.chainId !== targetChainId)
    throw new Error(
      `chainId mismatch. Expected ${targetChainId}, got ${signDoc.chainId}`
    );

  if (
    signDoc.accountNumber === undefined ||
    signDoc.accountNumber === null ||
    !(
      Long.isLong(signDoc.accountNumber) ||
      typeof signDoc.accountNumber === "number"
    )
  )
    throw new Error("accountNumber is missing or invalid");
}

// Validate an amino transaction
export function validateAminoSignDoc(
  signDoc: any,
  targetChainId: string,
  targetAccountAddress: string
): asserts signDoc is StdSignDoc {
  if (!signDoc) throw new Error("SignDoc is null or undefined");
  if (!signDoc.chain_id) throw new Error("chain_id is missing");

  if (signDoc.chain_id !== targetChainId)
    throw new Error(
      `chain_id mismatch. Expected ${targetChainId}, got ${signDoc.chain_id}`
    );

  // account_number and sequence can be 0, so check explicitly for undefined/null
  if (signDoc.account_number === undefined || signDoc.account_number === null)
    throw new Error("account_number is missing");
  if (signDoc.sequence === undefined || signDoc.sequence === null)
    throw new Error("sequence is missing");

  if (!Array.isArray(signDoc.msgs) || signDoc.msgs.length === 0)
    throw new Error("msgs array is missing or empty");

  if (!signDoc.fee || !Array.isArray(signDoc.fee.amount) || !signDoc.fee.gas)
    throw new Error("fee is missing or invalid");

  // Validate signer address (Amino makes this possible)
  const hasValidSigner = signDoc.msgs.some(
    (msg: any) =>
      msg.value?.from_address === targetAccountAddress ||
      msg.value?.delegator_address === targetAccountAddress ||
      msg.value?.sender === targetAccountAddress
  );

  if (!hasValidSigner) {
    throw new Error(`No msg signed by target address ${targetAccountAddress}`);
  }
}

export const formatJson = (value: string) => {
  // Helper to remove trailing commas from JSON-like strings
  const removeTrailingCommas = (str: string) => {
    return (
      str
        // Remove trailing commas in objects
        .replace(/,\s*}/g, "}")
        // Remove trailing commas in arrays
        .replace(/,\s*]/g, "]")
    );
  };

  try {
    // Clean the input first
    const cleaned = removeTrailingCommas(value);
    return JSON.stringify(JSON.parse(cleaned), null, 2);
  } catch {
    try {
      const hex = value.startsWith("0x") ? value.slice(2) : value;

      if (!/^[0-9a-fA-F]+$/.test(hex)) return value;

      const decoded = Buffer.from(hex, "hex").toString("utf8");
      const cleanedDecoded = removeTrailingCommas(decoded);
      return JSON.stringify(JSON.parse(cleanedDecoded), null, 2);
    } catch {
      return value;
    }
  }
};

export const CosmosMsgTypes: Record<string, string> = {
  "cosmos-sdk/MsgSend": "send",
  "cosmos-sdk/MsgTransfer": "ibcTransfer",
  "cosmos-sdk/MsgDelegate": "delegate",
  "cosmos-sdk/MsgUndelegate": "undelegate",
  "cosmos-sdk/MsgBeginRedelegate": "redelegate",
  "cosmos-sdk/MsgWithdrawDelegationReward": "withdrawRewards",
  "cosmos-sdk/MsgVote": "govVote",
};

export const convertAminoToProtoMsg = (aminoMsg: any): any => {
  let protoMsg: any = [];

  switch (aminoMsg.type) {
    case "cosmos-sdk/MsgSend":
      protoMsg = aminoMsg.msgs.map((msg: any) => ({
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: MsgSend.encode({
          fromAddress: msg.value.from_address,
          toAddress: msg.value.to_address,
          amount: msg.value.amount,
        }).finish(),
      }));
      break;
    case "cosmos-sdk/MsgDelegate":
      protoMsg = aminoMsg.msgs.map((msg: any) => ({
        typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
        value: MsgDelegate.encode({
          delegatorAddress: msg.value.delegator_address,
          validatorAddress: msg.value.validator_address,
          amount: msg.value.amount,
        }).finish(),
      }));
      break;
    case "cosmos-sdk/MsgUndelegate":
      protoMsg = aminoMsg.msgs.map((msg: any) => ({
        typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
        value: MsgUndelegate.encode({
          delegatorAddress: msg.value.delegator_address,
          validatorAddress: msg.value.validator_address,
          amount: {
            denom: msg.value.amount.denom,
            amount: msg.value.amount.amount,
          },
        }).finish(),
      }));
      break;
    case "cosmos-sdk/MsgBeginRedelegate":
      protoMsg = aminoMsg.msgs.map((msg: any) => ({
        typeUrl: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
        value: MsgBeginRedelegate.encode({
          delegatorAddress: msg.value.delegator_address,
          validatorSrcAddress: msg.value.validator_src_address,
          validatorDstAddress: msg.value.validator_dst_address,
          amount: {
            denom: msg.value.amount.denom,
            amount: msg.value.amount.amount,
          },
        }).finish(),
      }));
      break;
    case "cosmos-sdk/MsgWithdrawDelegationReward":
      protoMsg = aminoMsg.msgs.map((msg: any) => ({
        typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
        value: MsgWithdrawDelegatorReward.encode({
          delegatorAddress: msg.value.delegator_address,
          validatorAddress: msg.value.validator_address,
        }).finish(),
      }));
      break;
    case "cosmos-sdk/MsgVote":
      protoMsg = aminoMsg.msgs.map((msg: any) => ({
        typeUrl: "/cosmos.gov.v1beta1.MsgVote",
        value: MsgVote.encode({
          proposalId: msg.value.proposal_id,
          voter: msg.value.voter,
          option: (() => {
            switch (msg.value.option) {
              case 1:
                return VoteOption.VOTE_OPTION_YES;
              case 2:
                return VoteOption.VOTE_OPTION_ABSTAIN;
              case 3:
                return VoteOption.VOTE_OPTION_NO;
              case 4:
                return VoteOption.VOTE_OPTION_NO_WITH_VETO;
              default:
                return VoteOption.VOTE_OPTION_UNSPECIFIED;
            }
          })(),
        }).finish(),
      }));
      break;
    default:
      throw new Error(`Unsupported amino message type: ${aminoMsg.type}`);
  }

  return protoMsg;
};
