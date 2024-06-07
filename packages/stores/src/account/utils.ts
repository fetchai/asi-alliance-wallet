import { EthermintChainIdHelper } from "@keplr-wallet/cosmos";
import { ProtoMsgsOrWithAminoMsgs } from "./types";

export function txEventsWithPreOnFulfill(
  onTxEvents:
    | ((tx: any) => void)
    | {
        onBroadcasted?: (txHash: Uint8Array) => void;
        onFulfill?: (tx: any) => void;
      }
    | undefined,
  preOnTxEvents:
    | ((tx: any) => void)
    | {
        onBroadcasted?: (txHash: Uint8Array) => void;
        onFulfill?: (tx: any) => void;
      }
    | undefined
):
  | {
      onBroadcasted?: (txHash: Uint8Array) => void;
      onFulfill?: (tx: any) => void;
    }
  | undefined {
  const onBroadcasted = onTxEvents
    ? typeof onTxEvents === "function"
      ? undefined
      : onTxEvents.onBroadcasted
    : undefined;
  const onFulfill = onTxEvents
    ? typeof onTxEvents === "function"
      ? onTxEvents
      : onTxEvents.onFulfill
    : undefined;

  const onPreBroadcasted = preOnTxEvents
    ? typeof preOnTxEvents === "function"
      ? undefined
      : preOnTxEvents.onBroadcasted
    : undefined;
  const onPreFulfill = preOnTxEvents
    ? typeof preOnTxEvents === "function"
      ? preOnTxEvents
      : preOnTxEvents.onFulfill
    : undefined;

  if (!onBroadcasted && !onFulfill && !onPreBroadcasted && !onPreFulfill) {
    return undefined;
  }

  return {
    onBroadcasted:
      onBroadcasted || onPreBroadcasted
        ? (txHash: Uint8Array) => {
            if (onPreBroadcasted) {
              onPreBroadcasted(txHash);
            }

            if (onBroadcasted) {
              onBroadcasted(txHash);
            }
          }
        : undefined,
    onFulfill:
      onFulfill || onPreFulfill
        ? (tx: any) => {
            if (onPreFulfill) {
              onPreFulfill(tx);
            }

            if (onFulfill) {
              onFulfill(tx);
            }
          }
        : undefined,
  };
}

export const getEip712TypedDataBasedOnChainId = (
  chainId: string,
  msgs: ProtoMsgsOrWithAminoMsgs
): {
  types: Record<string, { name: string; type: string }[] | undefined>;
  domain: Record<string, any>;
  primaryType: string;
} => {
  const chainIsInjective = chainId.startsWith("injective");
  const { ethChainId } = EthermintChainIdHelper.parse(chainId);

  const types = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        // XXX: Maybe, non-standard format?
        { name: "verifyingContract", type: "string" },
        // XXX: Maybe, non-standard format?
        { name: "salt", type: "string" },
      ],
      Tx: [
        { name: "account_number", type: "string" },
        { name: "chain_id", type: "string" },
        { name: "fee", type: "Fee" },
        { name: "memo", type: "string" },
        { name: "msgs", type: "Msg[]" },
        { name: "sequence", type: "string" },
      ],
      Fee: [
        { name: "feePayer", type: "string" },
        { name: "amount", type: "Coin[]" },
        { name: "gas", type: "string" },
      ],
      Coin: [
        { name: "denom", type: "string" },
        { name: "amount", type: "string" },
      ],
      Msg: [
        { name: "type", type: "string" },
        { name: "value", type: "MsgValue" },
      ],
      ...msgs.rlpTypes,
    },
    domain: {
      name: "Cosmos Web3",
      version: "1.0.0",
      chainId: ethChainId.toString(),
      verifyingContract: "cosmos",
      salt: "0",
    },
    primaryType: "Tx",
  };

  // Injective doesn't need feePayer to be included but requires
  // timeout_height in the types
  if (chainIsInjective) {
    types.types.Tx = [
      ...types.types.Tx,
      { name: "timeout_height", type: "string" },
    ];
    types.domain.name = "Injective Web3";
    types.domain.chainId = "0x" + ethChainId.toString(16);
    types.types.Fee = [
      { name: "amount", type: "Coin[]" },
      { name: "gas", type: "string" },
    ];

    return types;
  }

  // Return default types for Evmos
  return types;
};

export const getJson = (addresses: any, type: string) => {
  let json = {};

  if (type === "withdrawRewards") {
    json = {
      delegatorAddress: addresses.delegator_address,
      validatorAddress: addresses.validator_address,
    };
  }

  if (type === "send") {
    json = {
      fromAddress: addresses.from_address,
      toAddress: addresses.to_address,
      amount: {
        denom: addresses.amount[0].denom,
        amount: addresses.amount[0].amount,
      },
    };
  }

  if (type === "delegate" || type === "undelegate") {
    json = {
      delegatorAddress: addresses.delegator_address,
      validatorAddress: addresses.validator_address,
      amount: {
        denom: addresses.amount.denom,
        amount: addresses.amount.amount,
      },
    };
  }

  if (type === "redelegate") {
    json = {
      delegatorAddress: addresses.delegator_address,
      validatorSrcAddress: addresses.validator_src_address,
      validatorDstAddress: addresses.validator_dst_address,
      amount: {
        denom: addresses.amount.denom,
        amount: addresses.amount.amount,
      },
    };
  }

  if (type === "ibcTransfer") {
    json = {
      sourcePort: addresses.source_port,
      sourceChannel: addresses.source_channel,
      sender: addresses.sender,
      receiver: addresses.receiver,
      timeoutTimestamp: {
        low: 0,
        high: 0,
        unsigned: true,
      },
      token: {
        denom: addresses.token.denom,
        amount: addresses.token.amount,
      },
      timeoutHeight: {
        revisionNumber: addresses.timeout_height.revision_number,
        revisionHeight: addresses.timeout_height.revision_height,
      },
    };
  }

  return JSON.stringify(json);
};

export const getNodes = (msgs: any, type: string) => {
  const nodes = msgs.protoMsgs.map((node: any, index: number) => {
    return {
      typeUrl: node.typeUrl,
      json: getJson(msgs.aminoMsgs[index].value, type),
      __typename: "Message",
    };
  });

  let balanceOffset = "";
  let signerAddress = "";

  if (type === "send") {
    balanceOffset = `-${msgs.aminoMsgs[0].value.amount[0].amount}`;
    signerAddress = msgs.aminoMsgs[0].value.from_address;
  }

  if (type === "withdrawRewards") {
    balanceOffset = "";
    signerAddress = msgs.aminoMsgs[0].value.delegator_address;
  }

  if (type === "delegate" || type === "redelegate" || type === "undelegate") {
    balanceOffset = `${msgs.aminoMsgs[0].value.amount.amount}`;
    signerAddress = msgs.aminoMsgs[0].value.delegator_address;
  }

  if (type === "ibcTransfer") {
    balanceOffset = `${msgs.aminoMsgs[0].value.token.amount}`;
    signerAddress = msgs.aminoMsgs[0].value.sender;
  }

  return { nodes, balanceOffset, signerAddress };
};

export const parseAmount = (amount: string): [string, string] => {
  const matches = amount.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);

  if (matches) {
    const [, numberPart, alphabeticPart] = matches;
    return [numberPart, alphabeticPart];
  }

  return ["", ""];
};
