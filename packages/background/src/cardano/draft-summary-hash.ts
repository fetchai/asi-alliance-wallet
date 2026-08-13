import { Hash } from "@keplr-wallet/crypto";
import { Buffer } from "buffer/";
import type { CardanoAssetAmount } from "./messages";

export const computeDraftSummaryHash = (draft: {
  to: string;
  amount: string;
  memo?: string;
  assets?: CardanoAssetAmount[];
  fee: string;
  total: string;
  minAdaForTokens?: string;
  networkId: string;
  selectedAccountAddress: string;
}): string => {
  const normalizedAssets = (draft.assets ?? [])
    .map((a) => `${a.assetId}:${a.amount}`)
    .sort();

  const normalizedPayload = JSON.stringify({
    to: draft.to,
    amount: draft.amount,
    memo: draft.memo ?? "",
    fee: draft.fee,
    total: draft.total,
    minAdaForTokens: draft.minAdaForTokens ?? "",
    assets: normalizedAssets,
    networkId: draft.networkId,
    sender: draft.selectedAccountAddress,
  });

  return Buffer.from(Hash.sha256(Buffer.from(normalizedPayload))).toString(
    "hex"
  );
};
