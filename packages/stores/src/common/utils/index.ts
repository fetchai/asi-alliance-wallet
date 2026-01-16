import { Currency } from "@keplr-wallet/types";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { GenericAuthorization as ProtoGenericAuthorization } from "cosmjs-types/cosmos/authz/v1beta1/authz";
import { SendAuthorization as ProtoSendAuthorization } from "cosmjs-types/cosmos/bank/v1beta1/authz";
import { CommunityPoolSpendProposal } from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
import { MsgExecLegacyContent } from "cosmjs-types/cosmos/gov/v1/tx";
import { TextProposal } from "cosmjs-types/cosmos/gov/v1beta1/gov";
import { ParameterChangeProposal } from "cosmjs-types/cosmos/params/v1beta1/params";
import {
  AuthorizationType,
  StakeAuthorization as ProtoStakeAuthorization,
} from "cosmjs-types/cosmos/staking/v1beta1/authz";
import {
  CancelSoftwareUpgradeProposal,
  SoftwareUpgradeProposal,
} from "cosmjs-types/cosmos/upgrade/v1beta1/upgrade";
import {
  ClearAdminProposal,
  ExecuteContractProposal,
  InstantiateContractProposal,
  MigrateContractProposal,
  StoreCodeProposal,
  SudoContractProposal,
  UpdateAdminProposal,
} from "cosmjs-types/cosmwasm/wasm/v1/proposal_legacy";
import { Any } from "cosmjs-types/google/protobuf/any";
import {
  ClientUpdateProposal,
  UpgradeProposal as IbcUpgradeProposal,
} from "@keplr-wallet/proto-types/ibc/core/client/v1/client";
import { ClientState } from "cosmjs-types/ibc/lightclients/tendermint/v1/tendermint";
import {
  GenericAuthorization,
  Grant,
  SendAuthorization,
  StakeAuthorization,
} from "../../query/cosmos/authz/types";
import { CoinPrimitive } from "../types";
import { BaseAccount } from "cosmjs-types/cosmos/auth/v1beta1/auth";
import {
  ContinuousVestingAccount,
  DelayedVestingAccount,
  PeriodicVestingAccount,
} from "cosmjs-types/cosmos/vesting/v1beta1/vesting";
/* eslint-disable-next-line import/no-extraneous-dependencies */
import { decodePubkey } from "@cosmjs/proto-signing";

export class StoreUtils {
  public static getBalancesFromCurrencies(
    currenciesMap: {
      [denom: string]: Currency;
    },
    bals: CoinPrimitive[]
  ): CoinPretty[] {
    const result: CoinPretty[] = [];
    for (const bal of bals) {
      const currency = currenciesMap[bal.denom];
      if (currency) {
        const amount = new Dec(bal.amount);
        if (amount.truncate().gt(new Int(0))) {
          result.push(new CoinPretty(currency, amount));
        }
      }
    }

    return result;
  }

  public static getBalanceFromCurrency(
    currency: Currency,
    bals: CoinPrimitive[]
  ): CoinPretty {
    const result = StoreUtils.getBalancesFromCurrencies(
      {
        [currency.coinMinimalDenom]: currency,
      },
      bals
    );

    if (result.length === 1) {
      return result[0];
    }

    return new CoinPretty(currency, new Int(0)).ready(false);
  }
}

// Convert a single camelCase string to snake_case
const camelToSnakeKey = (key: string): string => {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

// Recursively convert all keys in an object/array
export const camelToSnake = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(camelToSnake);
  }

  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        camelToSnakeKey(key),
        camelToSnake(value),
      ])
    );
  }

  return obj;
};

const decoderMap: Record<string, any> = {
  "/cosmos.gov.v1beta1.TextProposal": TextProposal,
  "/cosmos.params.v1beta1.ParameterChangeProposal": ParameterChangeProposal,
  "/cosmos.distribution.v1beta1.CommunityPoolSpendProposal":
    CommunityPoolSpendProposal,
  "/cosmos.upgrade.v1beta1.SoftwareUpgradeProposal": SoftwareUpgradeProposal,
  "/cosmos.upgrade.v1beta1.CancelSoftwareUpgradeProposal":
    CancelSoftwareUpgradeProposal,
  "/cosmos.gov.v1.MsgExecLegacyContent": MsgExecLegacyContent,
  "/ibc.core.client.v1.ClientUpdateProposal": ClientUpdateProposal,
  "/ibc.core.client.v1.UpgradeProposal": IbcUpgradeProposal,
  "/cosmwasm.wasm.v1.StoreCodeProposal": StoreCodeProposal,
  "/cosmwasm.wasm.v1.InstantiateContractProposal": InstantiateContractProposal,
  "/cosmwasm.wasm.v1.MigrateContractProposal": MigrateContractProposal,
  "/cosmwasm.wasm.v1.SudoContractProposal": SudoContractProposal,
  "/cosmwasm.wasm.v1.ExecuteContractProposal": ExecuteContractProposal,
  "/cosmwasm.wasm.v1.UpdateAdminProposal": UpdateAdminProposal,
  "/cosmwasm.wasm.v1.ClearAdminProposal": ClearAdminProposal,
};

export function decodeProposalContent(content?: Any): any {
  if (!content) return null;
  let typeUrl = content.typeUrl;

  if (typeUrl === "/cosmos.gov.v1.MsgExecLegacyContent") {
    const msg = MsgExecLegacyContent.decode(content.value);
    typeUrl = msg.content?.typeUrl ?? typeUrl;
    content = msg.content;
  }

  const decoder = decoderMap[typeUrl];

  if (!decoder) {
    return {
      typeUrl: typeUrl,
      raw: content?.value || "",
      decoded: null,
      note: "Unknown proposal type not in decoder map",
    };
  }

  return decoder.decode(content?.value);
}

export const base64ToBytes = (base64: string): Uint8Array => {
  return Uint8Array.from(Buffer.from(base64, "base64"));
};

const decodeAuthorization = (auth?: { typeUrl: string; value: string }) => {
  if (!auth) return undefined;

  const bytes = base64ToBytes(auth.value);

  switch (auth.typeUrl) {
    case "/cosmos.authz.v1beta1.GenericAuthorization": {
      const proto = ProtoGenericAuthorization.decode(bytes);
      const decoded: GenericAuthorization = {
        "@type": auth.typeUrl,
        msg: proto?.msg,
      };
      return decoded;
    }
    case "/cosmos.bank.v1beta1.SendAuthorization": {
      const proto = ProtoSendAuthorization.decode(bytes);
      const decoded: SendAuthorization = {
        "@type": auth.typeUrl,
        spend_limit: proto?.spendLimit.map((t) => ({
          denom: t?.denom,
          amount: t?.amount,
        })),
      };
      return decoded;
    }
    case "/cosmos.staking.v1beta1.StakeAuthorization": {
      const proto = ProtoStakeAuthorization.decode(bytes);
      const decoded: StakeAuthorization = {
        "@type": auth.typeUrl,
        authorization_type: AuthorizationType[proto.authorizationType],
        max_tokens: proto?.maxTokens
          ? { denom: proto.maxTokens?.denom, amount: proto.maxTokens?.amount }
          : undefined,
        allow_list: proto?.allowList
          ? { address: proto.allowList?.address }
          : undefined,
        deny_list: proto?.denyList
          ? { address: proto.denyList?.address }
          : undefined,
      };
      return decoded;
    }
    default:
      return { "@type": auth.typeUrl }; // fallback to BaseAuthorization
  }
};

export const decodeGrantAuthorization = (rawGrant: any): Grant => {
  return {
    granter: rawGrant.granter,
    grantee: rawGrant.grantee,
    authorization: decodeAuthorization(rawGrant.authorization) as any,
    expiration: rawGrant.expiration,
  };
};

export const decodeIBCClientState = (anyClientState?: {
  typeUrl: string;
  value: string;
}) => {
  if (!anyClientState) return { "@type": "" };

  const { typeUrl, value } = anyClientState;
  const bytes = base64ToBytes(value);

  switch (typeUrl) {
    case "/ibc.lightclients.tendermint.v1.ClientState": {
      const decoded = ClientState.toJSON(ClientState.decode(bytes));
      return {
        "@type": typeUrl,
        ...decoded,
      };
    }
    default:
      // fallback
      return { "@type": typeUrl };
  }
};

export const decodeAccount = (result: Any) => {
  const any = Any.fromPartial(result);

  let decoded: any = null;

  switch (any.typeUrl) {
    case "/cosmos.auth.v1beta1.BaseAccount":
      decoded = BaseAccount.decode(any.value);
      break;

    case "/cosmos.vesting.v1beta1.ContinuousVestingAccount":
      decoded = ContinuousVestingAccount.decode(any.value);
      break;

    case "/cosmos.vesting.v1beta1.DelayedVestingAccount":
      decoded = DelayedVestingAccount.decode(any.value);
      break;

    case "/cosmos.vesting.v1beta1.PeriodicVestingAccount":
      decoded = PeriodicVestingAccount.decode(any.value);
      break;

    default:
      throw new Error(`Unsupported account type: ${any.typeUrl}`);
  }

  const pubkey = decoded?.pubKey || decoded?.baseAccount?.pubKey;

  const normalizedPubKey = pubkey
    ? {
        "@type": pubkey.typeUrl,
        key: decodePubkey(pubkey).value,
      }
    : null;

  let normalized: any = {
    "@type": any.typeUrl,
    address: decoded.baseAccount?.address || decoded.address,
    pubKey: normalizedPubKey,
    accountNumber: (
      decoded.baseAccount?.accountNumber ||
      decoded.accountNumber ||
      0
    ).toString(),
    sequence: (
      decoded.baseAccount?.sequence ||
      decoded.sequence ||
      0
    ).toString(),
  };

  // Vesting fields (if present)
  if (decoded.baseVestingAccount) {
    normalized = {
      "@type": any.typeUrl,
      baseVestingAccount: decoded.baseVestingAccount,
      startTime: decoded.startTime ? decoded.startTime.toString() : undefined,
    };
  }

  return normalized;
};
