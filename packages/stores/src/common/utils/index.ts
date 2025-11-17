import { Currency } from "@keplr-wallet/types";
import { CoinPrimitive } from "../types";
import { CoinPretty, Dec, Int } from "@keplr-wallet/unit";
import { Any } from "cosmjs-types/google/protobuf/any";
import { TextProposal } from "cosmjs-types/cosmos/gov/v1beta1/gov";
import { CommunityPoolSpendProposal } from "cosmjs-types/cosmos/distribution/v1beta1/distribution";
import { ParameterChangeProposal } from "cosmjs-types/cosmos/params/v1beta1/params";
import {
  SoftwareUpgradeProposal,
  CancelSoftwareUpgradeProposal,
} from "cosmjs-types/cosmos/upgrade/v1beta1/upgrade";
import { MsgExecLegacyContent } from "cosmjs-types/cosmos/gov/v1/tx";
import {
  ClientUpdateProposal,
  UpgradeProposal as IbcUpgradeProposal,
} from "cosmjs-types/ibc/core/client/v1/client";
import {
  StoreCodeProposal,
  InstantiateContractProposal,
  MigrateContractProposal,
  SudoContractProposal,
  ExecuteContractProposal,
  UpdateAdminProposal,
  ClearAdminProposal,
} from "cosmjs-types/cosmwasm/wasm/v1/proposal_legacy";

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
  if (Array.isArray(obj)) {
    return obj.map(camelToSnake);
  } else if (obj !== null && typeof obj === "object") {
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

  // unwrap MsgExecLegacyContent (gov v1)
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

export function parseRPCTimestamp(ts: {
  seconds?: bigint;
  nanos?: number;
}): string {
  if (ts.seconds === undefined) return "";

  // Convert only the seconds to a Date (safe)
  const date = new Date(Number(ts.seconds) * 1000);

  // ISO without fractional seconds: "2025-03-20T22:55:43"
  const iso = date.toISOString();
  const base = iso.split(".")[0];

  // nanos must be exactly 9 digits
  const nanos = String(ts.nanos ?? 0).padStart(9, "0");

  return `${base}.${nanos}Z`;
}
