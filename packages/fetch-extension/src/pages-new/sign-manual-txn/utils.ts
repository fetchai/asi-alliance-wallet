import {
  MultisigThresholdPubkey,
  pubkeyToAddress,
  SinglePubkey,
} from "@cosmjs/amino";
import { fromBech32 } from "@cosmjs/encoding";
import { Registry } from "@cosmjs/proto-signing";
import {
  AminoTypes,
  createDefaultAminoConverters,
  defaultRegistryTypes,
} from "@cosmjs/stargate";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  createWasmAminoConverters,
  wasmTypes,
} from "@cosmjs/cosmwasm-stargate";
import { CommunityPoolSpendProposal } from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
import { MsgExecLegacyContent } from "cosmjs-types/cosmos/gov/v1/tx";
import { ParameterChangeProposal } from "cosmjs-types/cosmos/params/v1beta1/params";
import { SignMode } from "@keplr-wallet/background";
import { sortObjectByKey } from "@keplr-wallet/common";
import { MsgSend } from "@keplr-wallet/proto-types/cosmos/bank/v1beta1/tx";
import { MsgWithdrawDelegatorReward } from "@keplr-wallet/proto-types/cosmos/distribution/v1beta1/tx";
import {
  TextProposal,
  VoteOption,
} from "@keplr-wallet/proto-types/cosmos/gov/v1beta1/gov";
import {
  MsgSubmitProposal,
  MsgVote,
} from "@keplr-wallet/proto-types/cosmos/gov/v1beta1/tx";
import {
  MsgBeginRedelegate,
  MsgDelegate,
  MsgUndelegate,
} from "@keplr-wallet/proto-types/cosmos/staking/v1beta1/tx";
import {
  AuthInfo,
  TxBody,
} from "@keplr-wallet/proto-types/cosmos/tx/v1beta1/tx";
import {
  CancelSoftwareUpgradeProposal,
  SoftwareUpgradeProposal,
} from "@keplr-wallet/proto-types/cosmos/upgrade/v1beta1/upgrade";
import { MsgExecuteContract } from "@keplr-wallet/proto-types/cosmwasm/wasm/v1/tx";
import { Any } from "@keplr-wallet/proto-types/google/protobuf/any";
import {
  ClientUpdateProposal,
  UpgradeProposal as IbcUpgradeProposal,
} from "@keplr-wallet/proto-types/ibc/core/client/v1/client";
import { PubKey, SignDoc, StdSignDoc } from "@keplr-wallet/types";
// eslint-disable-next-line import/no-extraneous-dependencies
import Long from "long";
import {
  BaseTxnFileParams,
  GetTxnDocFileNameParams,
  InputDocType,
  MultisigAccountErrorParams,
  MultisigPubKey,
  ProtoMultisigPubkey,
  ProtoUnsignedTx,
  SignDocData,
  SignDocParams,
  SingleSignature,
  UpdateSignerInfoParams,
} from "./types";
import {
  NEEDS_EXPLICIT_PARSING_MESSAGE_TYPES,
  TRANSACTION_SIGNER_FIELDS,
} from "./constants";

const govProposalSubTypes: any = [
  ["/cosmos.gov.v1beta1.TextProposal", TextProposal],
  ["/cosmos.params.v1beta1.ParameterChangeProposal", ParameterChangeProposal],
  [
    "/cosmos.distribution.v1beta1.CommunityPoolSpendProposal",
    CommunityPoolSpendProposal,
  ],
  ["/cosmos.upgrade.v1beta1.SoftwareUpgradeProposal", SoftwareUpgradeProposal],
  [
    "/cosmos.upgrade.v1beta1.CancelSoftwareUpgradeProposal",
    CancelSoftwareUpgradeProposal,
  ],
  ["/cosmos.gov.v1.MsgExecLegacyContent", MsgExecLegacyContent],
  ["/ibc.core.client.v1.ClientUpdateProposal", ClientUpdateProposal],
  ["/ibc.core.client.v1.UpgradeProposal", IbcUpgradeProposal],
];

const registry = new Registry([
  ...defaultRegistryTypes,
  ...wasmTypes,
  ...govProposalSubTypes,
]);

const proposalAminoConverters: Record<
  string,
  {
    aminoType: string;
    toAmino: (content: any) => any;
  }
> = {
  "/cosmos.gov.v1beta1.TextProposal": {
    aminoType: "cosmos-sdk/TextProposal",
    toAmino: (content) => ({
      title: content.title,
      description: content.description,
    }),
  },

  "/cosmos.distribution.v1beta1.CommunityPoolSpendProposal": {
    aminoType: "cosmos-sdk/CommunityPoolSpendProposal",
    toAmino: (content) => ({
      title: content.title,
      description: content.description,
      recipient: content.recipient,
      amount: content.amount,
    }),
  },

  "/cosmos.params.v1beta1.ParameterChangeProposal": {
    aminoType: "cosmos-sdk/ParameterChangeProposal",
    toAmino: (content) => ({
      title: content.title,
      description: content.description,
      changes: content.changes,
    }),
  },

  "/cosmos.upgrade.v1beta1.SoftwareUpgradeProposal": {
    aminoType: "cosmos-sdk/SoftwareUpgradeProposal",
    toAmino: (content) => ({
      title: content.title,
      description: content.description,
      plan: content.plan
        ? {
            name: content.plan.name,
            height: content.plan.height,
            info: content.plan.info ?? "",
            time: content.plan.time ?? undefined,
            upgraded_client_state:
              content.plan.upgradedClientState ?? undefined,
          }
        : undefined,
    }),
  },

  "/cosmos.upgrade.v1beta1.CancelSoftwareUpgradeProposal": {
    aminoType: "cosmos-sdk/CancelSoftwareUpgradeProposal",
    toAmino: (content) => ({
      title: content.title,
      description: content.description,
    }),
  },

  "/ibc.core.client.v1.ClientUpdateProposal": {
    aminoType: "ibc/ClientUpdateProposal",
    toAmino: (content) => ({
      title: content.title,
      description: content.description,
      subject_client_id: content.subjectClientId,
      substitute_client_id: content.substituteClientId,
    }),
  },

  "/cosmos.gov.v1.MsgExecLegacyContent": {
    aminoType: "cosmos-sdk/MsgExecLegacyContent",
    toAmino: (content) => {
      const contentTypeUrl =
        content.content?.["@type"] ?? content.content?.typeUrl;

      if (!contentTypeUrl) {
        throw new Error("Missing content type in MsgExecLegacyContent");
      }

      const converter = proposalAminoConverters[contentTypeUrl];

      if (!converter) {
        throw new Error(`Unsupported legacy content type: ${contentTypeUrl}`);
      }

      return {
        content: {
          type: converter.aminoType,
          value: converter.toAmino(content.content),
        },
        authority: content.authority,
      };
    },
  },
};

const customGovConverters = {
  "/cosmos.gov.v1beta1.MsgSubmitProposal": {
    aminoType: "cosmos-sdk/MsgSubmitProposal",
    toAmino: (msg: any) => {
      const converter = proposalAminoConverters[msg.content.typeUrl];

      if (!converter) {
        throw new Error(`Unsupported proposal type: '${msg.content.typeUrl}'`);
      }

      return {
        content: {
          type: converter.aminoType,
          value: converter.toAmino(msg.content.value),
        },
        initial_deposit: msg.initialDeposit,
        proposer: msg.proposer,
      };
    },
    fromAmino: () => {
      throw new Error("fromAmino not implemented");
    },
  },
};

/**
 * Registry for protobuf fromJSON decoders
 */
const aminoTypes = new AminoTypes({
  ...createDefaultAminoConverters(),
  ...createWasmAminoConverters(),
  ...customGovConverters,
});

const parseExplicit = (typeUrl: string, msg: any): any => {
  switch (typeUrl) {
    case "/cosmos.staking.v1beta1.MsgCreateValidator":
      return {
        type: "cosmos-sdk/MsgCreateValidator",
        value: {
          description: msg.description,
          commission: msg.commission,
          min_self_delegation: msg.min_self_delegation,
          delegator_address: msg.delegator_address,
          validator_address: msg.validator_address,
          pubkey: {
            type: msg.pubkey["@type"],
            value: msg.pubkey.key,
          },
          value: msg.value,
        },
      };

    case "/cosmos.staking.v1beta1.MsgEditValidator":
      return {
        type: "cosmos-sdk/MsgEditValidator",
        value: {
          description: msg.description,
          validator_address: msg.validator_address,
          commission_rate: msg.commission_rate,
          min_self_delegation: msg.min_self_delegation,
        },
      };

    case "/cosmos.authz.v1beta1.MsgExec":
      return {
        type: "cosmos-sdk/MsgExec",
        value: {
          grantee: msg.grantee,
          msgs: protoJsonToAminoMsg(msg.msgs ?? []),
        },
      };
    case "/cosmos.authz.v1beta1.MsgGrant":
      return {
        type: "cosmos-sdk/MsgGrant",
        value: {
          granter: msg.granter,
          grantee: msg.grantee,
          grant: msg.grant,
        },
      };

    case "/cosmos.authz.v1beta1.MsgRevoke":
      return {
        type: "cosmos-sdk/MsgRevoke",
        value: {
          granter: msg.granter,
          grantee: msg.grantee,
          msg_type_url: msg.msg_type_url,
        },
      };

    case "/cosmos.feegrant.v1beta1.MsgGrantAllowance": {
      const { "@type": allowanceType, ...allowanceRest } = msg.allowance;
      return {
        type: "cosmos-sdk/MsgGrantAllowance",
        value: {
          granter: msg.granter,
          grantee: msg.grantee,
          allowance: msg.allowance
            ? {
                type: allowanceType,
                value: allowanceRest,
              }
            : undefined,
        },
      };
    }

    case "/cosmos.feegrant.v1beta1.MsgRevokeAllowance":
      return {
        type: "cosmos-sdk/MsgRevokeAllowance",
        value: {
          granter: msg.granter,
          grantee: msg.grantee,
        },
      };

    case "/cosmwasm.wasm.v1.MsgExecuteContract":
    case "/cosmwasm.wasm.v1.MsgInstantiateContract":
    case "/cosmwasm.wasm.v1.MsgMigrateContract":
      return {
        type: `wasm/${typeUrl.split(".").pop()}`,
        value: {
          ...msg,
          msg: typeof msg.msg === "object" ? msg.msg : JSON.parse(msg.msg),
        },
      };

    default:
      throw new Error(`Unsupported message type: ${msg["@type"]}`);
  }
};

/**
 * Converts raw proto-json tx msg into EncodeObject
 */
export const protoJsonToEncodeObject = (msg: any): any => {
  const typeUrl = msg["@type"];
  if (!typeUrl) {
    throw new Error("Missing @type");
  }

  const GeneratedType = registry.lookupType(typeUrl) as any;
  if (!GeneratedType) {
    throw new Error(`Unsupported proto type: ${typeUrl}`);
  }

  const normalized = snakeToCamelDeep(msg);
  const decoded = GeneratedType.fromJSON(normalized);

  // Gov proposal handling
  if (
    typeUrl === "/cosmos.gov.v1beta1.MsgSubmitProposal" &&
    normalized.content?.["@type"]
  ) {
    const contentTypeUrl = normalized.content["@type"];
    const ContentType = registry.lookupType(contentTypeUrl) as any;

    if (!ContentType) {
      throw new Error(`Unsupported proposal content type: ${contentTypeUrl}`);
    }

    const { "@type": _nestedType, ...contentRest } = normalized.content;
    decoded.content = {
      typeUrl: contentTypeUrl,
      value: ContentType.fromJSON(contentRest),
    };
  }

  return {
    typeUrl,
    value: decoded,
  };
};

/**
 * Generic proto-json to amino msg conversion
 */
export const protoJsonToAmino = (msg: any) => {
  const typeUrl = msg["@type"];

  if (!typeUrl) {
    throw new Error("Missing @type");
  }

  // Explicit parsing for unsupported messages or those that require special handling
  if (NEEDS_EXPLICIT_PARSING_MESSAGE_TYPES.has(typeUrl)) {
    const { "@type": _, ...rest } = msg;
    return parseExplicit(typeUrl, rest);
  }

  // cosmJS handles other types via AminoTypes registry
  const encodeObject = protoJsonToEncodeObject(msg);
  return aminoTypes.toAmino(encodeObject);
};

/**
 * Convert array of proto-json msgs
 */
export const protoJsonToAminoMsg = (msgs: any[]) => {
  return msgs.map(protoJsonToAmino);
};

export function getMultisigAccountError({
  multisigAccount,
  offlineSigning,
  bech32Prefix,
  accountData,
  multiSigPubKeys,
}: MultisigAccountErrorParams): string {
  if (!multisigAccount || offlineSigning) return "";

  if (!isValidBech32Address(multisigAccount, bech32Prefix)) {
    return "Please enter a valid bech32 address.";
  }

  const pubKey: any = accountData?.account?.pub_key;

  if (pubKey) {
    if (pubKey["@type"] !== "/cosmos.crypto.multisig.LegacyAminoPubKey") {
      return "The provided address is not a multisig account.";
    }
  }

  if (!pubKey && !multiSigPubKeys) {
    return "Multisig public key not found on-chain yet. Please provide the multisig public key manually.";
  }

  return "";
}

export function makeCompactBitArray(bits: boolean[]) {
  const byteLength = Math.ceil(bits.length / 8);
  const bytes = new Uint8Array(byteLength);

  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      bytes[byteIndex] |= 1 << (7 - bitIndex);
    }
  }

  return {
    cextraBitsStored:
      bits.length === 0 ? 0 : bits.length % 8 === 0 ? 8 : bits.length % 8,
    elems: Buffer.from(bytes).toString("base64"),
  };
}

export function convertToProtoJsonPubKey(pubkey: any) {
  return {
    "@type": "/cosmos.crypto.multisig.LegacyAminoPubKey",
    threshold: parseInt(pubkey.key.threshold),
    public_keys: pubkey.key.pubkeys.map((pk: any) => ({
      "@type": "/cosmos.crypto.secp256k1.PubKey",
      key: pk.value,
    })),
  };
}

function getProcessedFileName(filename: string) {
  const regex = /^([0-9]+)\.((.*)\.)?contents\.json$/;

  if (regex.test(filename)) {
    // Remove ".contents.json"
    return filename.replace(/\.contents\.json$/, "");
  }

  // Otherwise remove just ".json"
  return filename.replace(/\.json$/, "");
}

export const getTxnDocFileName = ({
  accountNumber,
  sequence,
  accountName,
  fileName,
  type,
}: GetTxnDocFileNameParams) => {
  const fileType =
    type === "transaction" ? "tx.json" : `${accountName}.sig.json`;
  const processedFileName = fileName ? getProcessedFileName(fileName) : "";

  return processedFileName
    ? `${processedFileName}.${fileType}`
    : `${accountNumber}.${sequence}.${fileType}`;
};

export const getTxnAndSignatureFileNames = ({
  accountName,
  accountNumber,
  sequence,
  fileName,
}: BaseTxnFileParams) => {
  const baseParams = {
    accountName,
    accountNumber,
    sequence,
    fileName,
  };

  return {
    signature: getTxnDocFileName({
      ...baseParams,
      type: "signature",
    }),
    transaction: getTxnDocFileName({
      ...baseParams,
      type: "transaction",
    }),
  };
};

export function buildSignedTxnPayload({
  txnPayload,
  signingMode,
  sequence,
  pubKey,
  signature,
  isMultisig = false,
  signerIndex,
}: {
  txnPayload: any;
  signingMode: "amino" | "direct";
  sequence: string;
  pubKey: any;
  isMultisig?: boolean;
  signerIndex?: number;
  signature?: any;
}) {
  const updatedSignerInfos = updateSignerInfosForSigning({
    signerInfos: txnPayload.auth_info?.signer_infos,
    signingMode,
    sequence,
    pubKey,
    isMultisig,
    signerIndex,
  });

  return {
    ...txnPayload,
    auth_info: {
      ...txnPayload.auth_info,
      signer_infos: updatedSignerInfos,
    },
    signatures: signature
      ? Array.isArray(signature)
        ? [...signature]
        : [signature]
      : [],
  };
}

const makeSignedElemsMultisig = (
  pubKey: ProtoMultisigPubkey,
  signerIndex: number | undefined,
  signerInfo: any
) => {
  const elems = signerInfo?.mode_info?.multi?.bitarray?.elems?.trim();
  const multiPubKey = pubKey;
  const totalSigners = multiPubKey.public_keys.length;

  // Restore existing signed map or initialize new
  const signedMap = new Array(totalSigners).fill(false);

  if (elems) {
    const existingBytes = Buffer.from(elems, "base64");
    for (let i = 0; i < totalSigners; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      if (existingBytes[byteIndex] & (1 << (7 - bitIndex))) {
        signedMap[i] = true;
      }
    }
  }

  // Mark current signer
  if (typeof signerIndex === "number") {
    signedMap[signerIndex] = true;
  }

  // Generate compact bit array safely
  const compact = makeCompactBitArray(signedMap);

  return compact.elems;
};

export function buildMultisigModeInfos(
  elemsBase64: string,
  extraBitsStored: number,
  signingMode: "amino" | "direct"
) {
  const elems = elemsBase64?.trim();

  if (!elems) {
    return [];
  }

  const bytes = Buffer.from(elems, "base64");

  const modeInfos: any[] = [];

  bytes.forEach((byte, byteIndex) => {
    const isLastByte = byteIndex === bytes.length - 1;
    const bitsToRead = isLastByte && extraBitsStored > 0 ? extraBitsStored : 8;

    for (let i = 0; i < bitsToRead; i++) {
      const bit = (byte >> (7 - i)) & 1;

      if (bit === 1) {
        modeInfos.push({
          single: {
            mode:
              signingMode === "amino"
                ? "SIGN_MODE_LEGACY_AMINO_JSON"
                : "SIGN_MODE_DIRECT",
          },
        });
      }
    }
  });

  return modeInfos;
}

export function updateSignerInfosForSigning({
  signerInfos,
  signingMode,
  sequence,
  pubKey,
  isMultisig,
  signerIndex,
}: UpdateSignerInfoParams): UpdateSignerInfoParams["signerInfos"] {
  // if signerInfos is empty, create a default one
  if (!signerInfos || signerInfos.length === 0) {
    signerInfos = [{} as UpdateSignerInfoParams["signerInfos"]];
  }
  const modeInfo = {
    single: {
      mode:
        signingMode === "amino"
          ? "SIGN_MODE_LEGACY_AMINO_JSON"
          : "SIGN_MODE_DIRECT",
    },
  };

  return signerInfos.map((signerInfo) => {
    if (isMultisig) {
      const signedElems = makeSignedElemsMultisig(
        pubKey as ProtoMultisigPubkey,
        signerIndex,
        signerInfo
      );
      const extraBitsStored =
        (pubKey as ProtoMultisigPubkey)?.public_keys?.length || 0;

      return {
        ...signerInfo,
        public_key: pubKey,
        sequence,
        mode_info: {
          multi: {
            bitarray: {
              extra_bits_stored: extraBitsStored,
              elems: signedElems,
            },
            mode_infos: buildMultisigModeInfos(
              signedElems,
              extraBitsStored,
              "amino"
            ),
          },
        },
      };
    }

    // single-sign
    return {
      ...signerInfo,
      public_key: {
        "@type": "/cosmos.crypto.secp256k1.PubKey",
        key: (pubKey as PubKey).value,
      },
      sequence,
      mode_info: modeInfo,
    };
  });
}

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
  }, new Map<string, Uint8Array | null>());

  return signaturesMap;
};

export function orderMultisigSignatures(
  multiSignatures: SingleSignature[],
  publicKeys: {
    type: string;
    value: string;
  }[]
): (SingleSignature | null)[] {
  // Map pubkey -> signature
  const signatureByPubKey = new Map<string, SingleSignature>();
  multiSignatures.forEach((sig) => {
    const pubKey = sig?.public_key?.key;
    if (pubKey) {
      signatureByPubKey.set(pubKey, sig);
    }
  });

  // Order signatures according to multisig public_keys
  return publicKeys
    .map((pubKey) => {
      return signatureByPubKey.get(pubKey.value) ?? null;
    })
    .filter(Boolean);
}

export function assembleMultisigTx(
  unsignedTx: any,
  threshold: number,
  singleSignatures: SingleSignature[],
  sequence: string,
  publicKeys?: MultisigPubKey["pubKeys"],
  addressPrefix?: string
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
    threshold: threshold,
    pubKeys: publicKeys?.length
      ? publicKeys.map((value) => ({
          ...value,
          "@type": "/cosmos.crypto.secp256k1.PubKey",
        }))
      : singleSignatures.map((value) => value.public_key),
  };

  // Build the auth_info for multisig
  const modeInfos = singleSignatures.map((sig) => ({
    single: { mode: sig.data.single.mode },
  }));

  const pubKeyAddresses = multisigPubKey?.pubKeys?.map((pk) =>
    pubkeyToAddress(
      { value: pk.key, type: "tendermint/PubKeySecp256k1" },
      addressPrefix || ""
    )
  );

  const signedAddressSet = new Set(
    singleSignatures.map((sig) =>
      pubkeyToAddress(
        { value: sig.public_key?.key, type: "tendermint/PubKeySecp256k1" },
        addressPrefix || ""
      )
    )
  );

  const bitArray = pubKeyAddresses.map((addr) => signedAddressSet.has(addr));

  const bitarray = {
    extra_bits_stored: publicKeys?.length || singleSignatures?.length,
    elems: makeCompactBitArray(bitArray).elems,
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

export function validateProtoJsonSignDoc(
  doc: any,
  targetAddress?: string
): asserts doc is {
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

  if (targetAddress) {
    const hasMatchingSigner = doc.body.messages.some((msg: any) =>
      TRANSACTION_SIGNER_FIELDS.some((field) => msg?.[field] === targetAddress)
    );

    if (!hasMatchingSigner) {
      throw new Error(
        `no message signed by the signer address ${targetAddress}`
      );
    }
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

  if (
    !doc.auth_info.signer_infos &&
    !Array.isArray(doc.auth_info.signer_infos)
  ) {
    throw new Error("signer_infos must be an array");
  }

  if (!Array.isArray(doc.signatures))
    throw new Error("signatures must be an array");

  if (doc.signatures.length !== 0)
    throw new Error("signatures must be empty for signing");
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

const encodeProposalContent = (content: any): Any => {
  try {
    switch (content["@type"]) {
      case "/cosmos.gov.v1beta1.TextProposal":
        return {
          typeUrl: "/cosmos.gov.v1beta1.TextProposal",
          value: TextProposal.encode({
            title: content.title,
            description: content.description,
          }).finish(),
        };

      case "/cosmos.distribution.v1beta1.CommunityPoolSpendProposal":
        return {
          typeUrl: "/cosmos.distribution.v1beta1.CommunityPoolSpendProposal",
          value: CommunityPoolSpendProposal.encode({
            title: content.title,
            description: content.description,
            recipient: content.recipient,
            amount: content.amount,
          }).finish(),
        };

      case "/cosmos.params.v1beta1.ParameterChangeProposal":
        return {
          typeUrl: "/cosmos.params.v1beta1.ParameterChangeProposal",
          value: ParameterChangeProposal.encode({
            title: content.title,
            description: content.description,
            changes: content.changes.map((c: any) => ({
              subspace: c.subspace,
              key: c.key,
              value: c.value,
            })),
          }).finish(),
        };

      case "/cosmos.upgrade.v1beta1.SoftwareUpgradeProposal":
        return {
          typeUrl: "/cosmos.upgrade.v1beta1.SoftwareUpgradeProposal",
          value: SoftwareUpgradeProposal.encode({
            title: content.title,
            description: content.description,
            plan: content.plan
              ? {
                  name: content.plan.name,
                  height: content.plan.height,
                  info: content.plan.info ?? "",
                  time: content.plan.time ?? undefined,
                  upgradedClientState:
                    content.plan.upgraded_client_state ?? undefined,
                }
              : undefined,
          }).finish(),
        };

      case "/cosmos.upgrade.v1beta1.CancelSoftwareUpgradeProposal":
        return {
          typeUrl: "/cosmos.upgrade.v1beta1.CancelSoftwareUpgradeProposal",
          value: CancelSoftwareUpgradeProposal.encode({
            title: content.title,
            description: content.description,
          }).finish(),
        };

      case "/ibc.core.client.v1.ClientUpdateProposal":
        return {
          typeUrl: "/ibc.core.client.v1.ClientUpdateProposal",
          value: ClientUpdateProposal.encode({
            title: content.title,
            description: content.description,
            subjectClientId: content.subject_client_id,
            substituteClientId: content.substitute_client_id,
          }).finish(),
        };

      default: {
        const { "@type": typeUrl, ...rest } = content;

        // Convert snake_case keys to camelCase for proto encoding
        const camelCaseMsg = Object.fromEntries(
          Object.entries(rest).map(([key, value]) => [
            key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
            value,
          ])
        );

        try {
          const encoded = registry.encode({ typeUrl, value: camelCaseMsg });
          return { typeUrl, value: encoded };
        } catch {
          // Raw fallback — pass JSON bytes directly
          return {
            typeUrl,
            value: new TextEncoder().encode(JSON.stringify(rest)),
          };
        }
      }
    }
  } catch {
    throw new Error(`Unsupported proposal content type: ${content["@type"]}`);
  }
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
      case "/cosmos.gov.v1beta1.MsgSubmitProposal":
        return {
          typeUrl: "/cosmos.gov.v1beta1.MsgSubmitProposal",
          value: MsgSubmitProposal.encode({
            content: encodeProposalContent(msg.content),
            initialDeposit: msg.initial_deposit,
            proposer: msg.proposer,
          }).finish(),
        };

      default:
        throw new Error(`Unsupported message type: ${msg["@type"]}`);
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

const requestDownloadsPermission = async (): Promise<boolean> => {
  try {
    if (typeof browser !== "undefined" && browser.permissions?.request) {
      return await browser.permissions.request({
        permissions: ["downloads"],
      });
    }

    if (typeof chrome !== "undefined" && chrome.permissions?.request) {
      return await new Promise<boolean>((resolve) => {
        chrome.permissions.request({ permissions: ["downloads"] }, (granted) =>
          resolve(granted)
        );
      });
    }
  } catch {
    return false;
  }

  return false;
};

export const downloadJson = async (data: unknown, filename: string) => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  try {
    // Request optional permission
    const granted = await requestDownloadsPermission();

    if (granted) {
      // use downloads API with Save As dialog
      const downloadId = await browser.downloads.download({
        url,
        filename,
        conflictAction: "uniquify",
        saveAs: true,
      });

      const listener = (delta: any) => {
        if (delta.id === downloadId && delta.state) {
          if (
            delta.state.current === "complete" ||
            delta.state.current === "interrupted"
          ) {
            browser.downloads.onChanged.removeListener(listener);
            URL.revokeObjectURL(url);
          }
        }
      };

      browser.downloads.onChanged.addListener(listener);
    } else {
      // Permission denied (fallback download)
      URL.revokeObjectURL(url);
      fallbackDownload(json, filename);
    }
  } catch {
    // error (fallback)
    URL.revokeObjectURL(url);
    fallbackDownload(json, filename);
  }
};

const fallbackDownload = (json: string, filename: string) => {
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

export const prepareSignDoc = async (
  txnPayload: any,
  accountData: any,
  chainId: string
): Promise<SignDocData> => {
  // Parse txn payload
  const payloadObj = JSON.parse(txnPayload);

  // Detect sign doc type
  const signDocType = detectInputType(payloadObj);

  const signDocParams = {
    chainId,
    sequence: accountData?.sequence,
    accountNumber: accountData?.account_number,
  };

  // Build Amino signDoc
  const signDoc =
    signDocType === "amino"
      ? sortObjectByKey({
          ...payloadObj,
          sequence: signDocParams.sequence,
          account_number: signDocParams.accountNumber,
        })
      : convertProtoTxToAminoSignDoc(payloadObj, signDocParams);

  return { payloadObj, signDocType, signDocParams, signDoc };
};
