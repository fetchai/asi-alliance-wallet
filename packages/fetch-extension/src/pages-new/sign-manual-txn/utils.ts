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
import {
  AuthInfo,
  TxBody,
} from "@keplr-wallet/proto-types/cosmos/tx/v1beta1/tx";
import {
  ProtoUnsignedTx,
  SignDocParams,
  SingleSignature,
  InputDocType,
  MultisigPubKey,
  ProtoMultisigPubkey,
} from "./types";
/* eslint-disable-next-line import/no-extraneous-dependencies */
import Long from "long";
import { MsgExecuteContract } from "@keplr-wallet/proto-types/cosmwasm/wasm/v1/tx";
import { fromBech32 } from "@cosmjs/encoding";

export const isValidBech32Address = (address: string, prefix: string) => {
  try {
    const { prefix: actualPrefix } = fromBech32(address);
    return actualPrefix === prefix;
  } catch (e) {
    return false;
  }
};

export const isSignatureCollected = (sigStr: string) => {
  if (!sigStr) return false;
  try {
    const sigObj = JSON.parse(sigStr);
    return (
      sigObj.signatures?.some(
        (s: any) => s.data?.single?.signature?.trim() !== ""
      ) || false
    );
  } catch (err) {
    return false;
  }
};

export function buildProtoSignDoc(
  protoTx: ProtoUnsignedTx,
  params: SignDocParams
): SignDoc {
  const body: any = snakeToCamelDeep(protoTx.body);
  const authInfo: any = snakeToCamelDeep(protoTx.auth_info);
  console.log({
    body,
    authInfo,
    messages: convertProtoJsontoProtoMsgs(protoTx.body.messages),
  });
  return {
    bodyBytes: TxBody.encode({
      ...body,
      messages: convertProtoJsontoProtoMsgs(protoTx.body.messages),
    }).finish(),
    authInfoBytes: AuthInfo.encode({
      ...authInfo,
      signerInfos: [
        {
          sequence: Long.fromString(params.sequence),
        },
      ],
    }).finish(),
    chainId: params.chainId,
    accountNumber: Long.fromString(params.accountNumber),
  };
}

export function convertProtoTxToAminoSignDoc(
  protoTx: ProtoUnsignedTx,
  params: SignDocParams
): StdSignDoc {
  // Convert proto messages to Amino messages
  const aminoMsgs = protoJsonToAminoMsg(protoTx.body.messages);

  return {
    chain_id: params.chainId,
    account_number: params.accountNumber,
    sequence: params.sequence,
    fee: {
      amount: protoTx.auth_info.fee.amount,
      gas: protoTx.auth_info.fee.gas_limit,
      payer: protoTx.auth_info.fee?.payer || "",
      granter: protoTx.auth_info.fee?.granter || "",
    },
    msgs: aminoMsgs,
    memo: protoTx.body.memo ?? "",
  };
}

export const createSignaturesMap = (
  bech32PrefixAccAddr: string,
  singleSignatures: SingleSignature[]
) => {
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

  return signaturesMap;
};

export function assembleMultisigTx(
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

  // Assemble final TxRaw
  const finalTx = {
    body: unsignedTx.body,
    auth_info: {
      ...unsignedTx.auth_info,
      signer_infos: [signerInfo],
    },
    signatures,
  };

  return finalTx;
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

export function validateProtoJsonSignDoc(doc: any): asserts doc is {
  body: any;
  auth_info: any;
  signatures: any[];
} {
  if (!doc) throw new Error("Proto JSON doc is null or undefined");

  if (!doc.body) throw new Error("body is missing");

  if (!Array.isArray(doc.body.messages))
    throw new Error("body.messages must be an array");

  if (doc.body.messages.length === 0)
    throw new Error("body.messages must not be empty");

  if (typeof doc.body.memo !== "string")
    throw new Error("body.memo must be a string");

  if (
    doc.body.timeout_height !== undefined &&
    typeof doc.body.timeout_height !== "string"
  )
    throw new Error("body.timeout_height must be a string");

  if (
    (doc.body.extension_options?.length ?? 0) > 0 ||
    (doc.body.non_critical_extension_options?.length ?? 0) > 0
  ) {
    throw new Error("extension options are not supported");
  }

  for (const msg of doc.body.messages) {
    if (!msg["@type"]) throw new Error("message is missing @type");

    if (typeof msg["@type"] !== "string")
      throw new Error("message @type must be a string");
  }

  if (!doc.auth_info) throw new Error("auth_info is missing");

  if (!doc.auth_info.fee) throw new Error("auth_info.fee is missing");

  if (!Array.isArray(doc.auth_info.fee.amount))
    throw new Error("fee.amount must be an array");

  if (
    doc.auth_info.fee.gas_limit === undefined ||
    typeof doc.auth_info.fee.gas_limit !== "string"
  )
    throw new Error("fee.gas_limit must be a string");

  if (doc.auth_info.signer_infos && doc.auth_info.signer_infos.length > 0) {
    throw new Error("signer_infos must be empty for unsigned tx");
  }

  if (!Array.isArray(doc.signatures))
    throw new Error("signatures must be an array");

  if (doc.signatures.length !== 0)
    throw new Error("signatures must be empty for signing");
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

export const CosmosMsgTypesAmino: Record<string, string> = {
  "cosmos-sdk/MsgSend": "send",
  "cosmos-sdk/MsgDelegate": "delegate",
  "cosmos-sdk/MsgUndelegate": "undelegate",
  "cosmos-sdk/MsgBeginRedelegate": "redelegate",
  "cosmos-sdk/MsgWithdrawDelegationReward": "withdrawRewards",
  "cosmos-sdk/MsgVote": "govVote",
};

export const CosmosMsgTypesProto: Record<string, string> = {
  "/cosmos.bank.v1beta1.MsgSend": "send",
  "/cosmos.staking.v1beta1.MsgDelegate": "delegate",
  "/cosmos.staking.v1beta1.MsgUndelegate": "undelegate",
  "/cosmos.staking.v1beta1.MsgBeginRedelegate": "redelegate",
  "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward": "withdrawRewards",
  "/cosmos.gov.v1beta1.MsgVote": "govVote",
};

export const convertAminoToProtoMsgs = (aminoDocMsgs: any[]) => {
  return aminoDocMsgs.map((msg: any) => {
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
      case "wasm/MsgExecuteContract":
        return {
          typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
          value: MsgExecuteContract.encode({
            sender: msg.value.sender,
            contract: msg.value.contract,
            msg: Buffer.from(JSON.stringify(msg.value.msg)) as any,
            funds: msg.value.funds,
          }).finish(),
        };

      default:
        throw new Error(`Unsupported amino message type: ${msg.type}`);
    }
  });
};

export const convertProtoJsontoProtoMsgs = (messages: any[]) => {
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
      case "/cosmwasm.wasm.v1.MsgExecuteContract":
        return {
          typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
          value: MsgExecuteContract.encode({
            sender: msg.sender,
            contract: msg.contract,
            msg: Buffer.from(JSON.stringify(msg.msg)) as any,
            funds: msg.funds,
          }).finish(),
        };

      default:
        throw new Error(`Unsupported message type: ${msg["@type"]}`);
    }
  });
};

export function protoJsonToAminoMsg(messages: any[]) {
  return messages.map((msg: any) => {
    switch (msg["@type"]) {
      case "/cosmos.bank.v1beta1.MsgSend":
        return {
          type: "cosmos-sdk/MsgSend",
          value: {
            from_address: msg.from_address,
            to_address: msg.to_address,
            amount: msg.amount,
          },
        };

      case "/cosmos.staking.v1beta1.MsgDelegate":
        return {
          type: "cosmos-sdk/MsgDelegate",
          value: {
            delegator_address: msg.delegator_address,
            validator_address: msg.validator_address,
            amount: msg.amount,
          },
        };

      case "/cosmos.staking.v1beta1.MsgUndelegate":
        return {
          type: "cosmos-sdk/MsgUndelegate",
          value: {
            delegator_address: msg.delegator_address,
            validator_address: msg.validator_address,
            amount: msg.amount,
          },
        };

      case "/cosmos.staking.v1beta1.MsgBeginRedelegate":
        return {
          type: "cosmos-sdk/MsgBeginRedelegate",
          value: {
            delegator_address: msg.delegator_address,
            validator_src_address: msg.validator_src_address,
            validator_dst_address: msg.validator_dst_address,
            amount: msg.amount,
          },
        };

      case "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward":
        return {
          type: "cosmos-sdk/MsgWithdrawDelegationReward",
          value: {
            delegator_address: msg.delegator_address,
            validator_address: msg.validator_address,
          },
        };

      case "/cosmos.gov.v1beta1.MsgVote":
        return {
          type: "cosmos-sdk/MsgVote",
          value: {
            proposal_id: msg.proposal_id,
            voter: msg.voter,
            option: msg.option,
          },
        };
      case "/cosmwasm.wasm.v1.MsgExecuteContract":
        return {
          type: "wasm/MsgExecuteContract",
          value: {
            sender: msg.sender,
            contract: msg.contract,
            msg: msg.msg,
            funds: msg.funds,
          },
        };

      default:
        throw new Error(`Unsupported proto JSON message: ${msg["@type"]}`);
    }
  });
}

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

const snakeToCamel = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
};

const isPlainObject = (val: unknown): val is Record<string, unknown> => {
  return Object.prototype.toString.call(val) === "[object Object]";
};

export const snakeToCamelDeep = <T>(input: T): T => {
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
};

export const downloadJson = (data: unknown, filename: string) => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
};

export function detectInputType(doc: any): InputDocType {
  if (doc?.msgs && Array.isArray(doc.msgs)) {
    return "amino";
  }

  if (doc?.body?.messages && Array.isArray(doc.body.messages)) {
    return "proto-json";
  }

  throw new Error("Unsupported transaction data format");
}

export const createSignature = (result: any, sequence: string) => {
  return formatJson(
    JSON.stringify({
      signatures: [
        {
          public_key: {
            "@type": "/cosmos.crypto.secp256k1.PubKey",
            key: result.signature.pub_key.value,
          },
          data: {
            single: {
              mode: "SIGN_MODE_LEGACY_AMINO_JSON",
              signature: result.signature.signature,
            },
          },
          sequence,
        },
      ],
    })
  );
};
