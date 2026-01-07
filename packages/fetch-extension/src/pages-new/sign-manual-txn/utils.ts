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
import {
  MultisigThresholdPubkey,
  pubkeyToAddress,
  SinglePubkey,
} from "@cosmjs/amino";
import { SignMode } from "@keplr-wallet/background";
/* eslint-disable-next-line import/no-extraneous-dependencies */
import Long from "long";

type SingleSignature = {
  public_key: { "@type": string; key: string };
  data: {
    single: {
      mode: string;
      signature: string;
    };
  };
  sequence: string;
};

type ProtoMultisigPubkey = {
  "@type": "/cosmos.crypto.multisig.LegacyAminoPubKey";
  threshold: number;
  public_keys: Array<{
    "@type": "/cosmos.crypto.secp256k1.PubKey";
    key: string;
  }>;
};

type MultisigPubKey = {
  threshold: number;
  pubKeys: { "@type": string; key: string }[];
};

export function assembleMultisigTx(
  bech32PrefixAccAddr: string,
  unsignedTx: any,
  threshold: number,
  singleSignatures: SingleSignature[],
  sequence: string
) {
  if (
    !unsignedTx ||
    !unsignedTx.body ||
    !unsignedTx.auth_info ||
    singleSignatures.length === 0
  ) {
    throw new Error("Invalid unsigned TxRaw");
  }

  const multisigPubKey: MultisigPubKey = {
    threshold,
    pubKeys: singleSignatures.map((value) => value.public_key),
  };

  // Build the auth_info for multisig
  const modeInfos = singleSignatures.map((sig) => ({
    single: { mode: sig.data.single.mode },
  }));

  const bitarray = {
    extra_bits_stored: singleSignatures.length,
    elems: "4A==",
  };

  const multisigModeInfo = {
    multi: {
      bitarray,
      mode_infos: modeInfos,
    },
  };

  const signerInfo = {
    public_key: {
      "@type": "/cosmos.crypto.multisig.LegacyAminoPubKey",
      threshold: multisigPubKey.threshold,
      public_keys: multisigPubKey.pubKeys,
    },
    mode_info: multisigModeInfo,
    sequence,
  };

  // Collect the signatures in the same order
  const signatures = singleSignatures.map((sig) => sig.data.single.signature);
  const signaturesMap = singleSignatures.reduce((map, sig) => {
    const pubkey = {
      type: "tendermint/PubKeySecp256k1",
      value: sig.public_key.key,
    };
    const address = pubkeyToAddress(pubkey, bech32PrefixAccAddr);
    map.set(
      address,
      Uint8Array.from(atob(sig.data.single.signature), (c) => c.charCodeAt(0))
    );
    return map;
  }, new Map<string, Uint8Array>());

  // Assemble final TxRaw
  const finalTx = {
    body: unsignedTx.body,
    auth_info: {
      ...unsignedTx.auth_info,
      signer_infos: [signerInfo],
    },
    signatures,
  };

  return { txRaw: finalTx, signatures: signaturesMap, multisigPubKey };
}

export function protoMultisigToAmino(
  proto: ProtoMultisigPubkey
): MultisigThresholdPubkey {
  if (proto["@type"] !== "/cosmos.crypto.multisig.LegacyAminoPubKey") {
    throw new Error("Unsupported multisig pubkey type");
  }

  return {
    type: "tendermint/PubKeyMultisigThreshold",
    value: {
      threshold: proto.threshold.toString(),
      pubkeys: proto.public_keys.map<SinglePubkey>((pk) => {
        if (pk["@type"] !== "/cosmos.crypto.secp256k1.PubKey") {
          throw new Error("Unsupported inner pubkey type");
        }

        return {
          type: "tendermint/PubKeySecp256k1",
          value: pk.key,
        };
      }),
    },
  };
}

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

export const formatJson = (value: string): string => {
  const cleanJsonString = (str: string) =>
    str.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  const tryParseJson = (str: string): string | null => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return null;
    }
  };

  const tryDecodeHex = (str: string): string | null => {
    try {
      const hex = str.startsWith("0x") ? str.slice(2) : str;
      // Remove spaces/newlines just in case
      const cleanedHex = hex.replace(/\s+/g, "");
      if (!/^[0-9a-fA-F]+$/.test(cleanedHex)) return null;
      return Buffer.from(cleanedHex, "hex").toString("utf8");
    } catch {
      return null;
    }
  };

  const tryDecodeBase64 = (str: string): string | null => {
    try {
      return Buffer.from(str, "base64").toString("utf8");
    } catch {
      return null;
    }
  };

  const strategies: Array<() => string | null> = [
    // Raw JSON-like
    () => tryParseJson(cleanJsonString(value)),

    // Hex-encoded
    () => {
      const decoded = tryDecodeHex(value);
      return decoded ? tryParseJson(cleanJsonString(decoded)) : null;
    },

    // Base64-encoded
    () => {
      const decoded = tryDecodeBase64(value);
      return decoded ? tryParseJson(cleanJsonString(decoded)) : null;
    },
  ];

  for (const parse of strategies) {
    const result = parse();
    if (result) return result;
  }

  return value;
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

export const convertAminoToProtoMsgs = (aminoDoc: any) => {
  return aminoDoc.msgs.map((msg: any) => {
    switch (msg.type) {
      case "cosmos-sdk/MsgSend":
        return {
          typeUrl: "/cosmos.bank.v1beta1.MsgSend",
          value: MsgSend.encode({
            fromAddress: msg.value.from_address,
            toAddress: msg.value.to_address,
            amount: msg.value.amount,
          }).finish(),
        };

      case "cosmos-sdk/MsgDelegate":
        return {
          typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
          value: MsgDelegate.encode({
            delegatorAddress: msg.value.delegator_address,
            validatorAddress: msg.value.validator_address,
            amount: msg.value.amount,
          }).finish(),
        };

      case "cosmos-sdk/MsgUndelegate":
        return {
          typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
          value: MsgUndelegate.encode({
            delegatorAddress: msg.value.delegator_address,
            validatorAddress: msg.value.validator_address,
            amount: {
              denom: msg.value.amount.denom,
              amount: msg.value.amount.amount,
            },
          }).finish(),
        };

      case "cosmos-sdk/MsgBeginRedelegate":
        return {
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
        };

      case "cosmos-sdk/MsgWithdrawDelegationReward":
        return {
          typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
          value: MsgWithdrawDelegatorReward.encode({
            delegatorAddress: msg.value.delegator_address,
            validatorAddress: msg.value.validator_address,
          }).finish(),
        };

      case "cosmos-sdk/MsgVote":
        return {
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
        };

      default:
        throw new Error(`Unsupported amino message type: ${msg.type}`);
    }
  });
};

export const convertMultiSigToProtoMsgs = (messages: any[]) => {
  return messages.map((msg: any) => {
    switch (msg["@type"]) {
      case "/cosmos.bank.v1beta1.MsgSend":
        return {
          typeUrl: msg["@type"],
          value: MsgSend.encode({
            fromAddress: msg.from_address,
            toAddress: msg.to_address,
            amount: msg.amount,
          }).finish(),
        };

      case "/cosmos.staking.v1beta1.MsgDelegate":
        return {
          typeUrl: msg["@type"],
          value: MsgDelegate.encode({
            delegatorAddress: msg.delegator_address,
            validatorAddress: msg.validator_address,
            amount: msg.amount,
          }).finish(),
        };

      case "/cosmos.staking.v1beta1.MsgUndelegate":
        return {
          typeUrl: msg["@type"],
          value: MsgUndelegate.encode({
            delegatorAddress: msg.delegator_address,
            validatorAddress: msg.validator_address,
            amount: {
              denom: msg.amount.denom,
              amount: msg.amount.amount,
            },
          }).finish(),
        };

      case "/cosmos.staking.v1beta1.MsgBeginRedelegate":
        return {
          typeUrl: msg["@type"],
          value: MsgBeginRedelegate.encode({
            delegatorAddress: msg.delegator_address,
            validatorSrcAddress: msg.validator_src_address,
            validatorDstAddress: msg.validator_dst_address,
            amount: {
              denom: msg.amount.denom,
              amount: msg.amount.amount,
            },
          }).finish(),
        };

      case "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward":
        return {
          typeUrl: msg["@type"],
          value: MsgWithdrawDelegatorReward.encode({
            delegatorAddress: msg.delegator_address,
            validatorAddress: msg.validator_address,
          }).finish(),
        };

      case "/cosmos.gov.v1beta1.MsgVote":
        return {
          typeUrl: msg["@type"],
          value: MsgVote.encode({
            proposalId: msg.proposal_id,
            voter: msg.voter,
            option: (() => {
              switch (msg.option) {
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
        };

      default:
        throw new Error(`Unsupported message type: ${msg.type}`);
    }
  });
};

export const detectTxType = (tx: any): SignMode.Amino | SignMode.Direct => {
  if (!tx || typeof tx !== "object") {
    throw new Error("Invalid tx object");
  }

  if (
    "bodyBytes" in tx &&
    tx.bodyBytes != null &&
    "authInfoBytes" in tx &&
    tx.authInfoBytes != null
  ) {
    return SignMode.Direct;
  }

  // Amino transaction detection
  if (Array.isArray(tx.msgs) && "chain_id" in tx && "account_number" in tx) {
    return SignMode.Amino;
  }

  throw new Error("Unknown transaction format");
};

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Object.prototype.toString.call(val) === "[object Object]";
}

export function snakeToCamelDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map(snakeToCamelDeep) as T;
  }

  if (isPlainObject(input)) {
    return Object.entries(input).reduce((acc, [key, value]) => {
      const camelKey = snakeToCamel(key);
      acc[camelKey] = snakeToCamelDeep(value);
      return acc;
    }, {} as Record<string, unknown>) as T;
  }

  return input;
}
