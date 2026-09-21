import type { Observable } from "rxjs";
// eslint-disable-next-line import/no-extraneous-dependencies
import { firstValueFrom, of } from "rxjs";
import { parseAssetId } from "@keplr-wallet/cardano";
import type { CardanoTxHistoryAsset, CardanoTxHistoryItem } from "./messages";

/** Minimal wallet shape for pending tx history (SDK ObservableWallet compatibility). */
export interface WalletForPendingHistory {
  addresses$: Observable<{ address?: string }[]>;
  transactions?: {
    outgoing?: {
      inFlight$: Observable<unknown[]>;
      signed$: Observable<unknown[]>;
    };
  };
  assetInfo$?: Observable<Map<string, AssetInfoLike>>;
}

/** Minimal asset metadata shape aligned with Asset.AssetInfo (tokenMetadata, nftMetadata, fingerprint). */
export interface AssetInfoLike {
  nftMetadata?: { name?: string };
  tokenMetadata?: { name?: string; ticker?: string; decimals?: number };
  fingerprint?: string;
  name?: string;
  ticker?: string;
  decimals?: number;
}

/** Extract assets Map from a tx output/input value (TokenMap = Map<AssetId, bigint>). */
export function getAssetsFromValue(value: unknown): Map<string, bigint> {
  const assets = (value as { assets?: unknown })?.assets;
  if (!assets) return new Map();
  if (assets instanceof Map) return assets as Map<string, bigint>;
  const map = new Map<string, bigint>();
  if (typeof assets === "object") {
    for (const [k, v] of Object.entries(assets)) {
      map.set(k, typeof v === "bigint" ? v : BigInt(String(v)));
    }
  }
  return map;
}

export async function getWalletAddressSet(
  wallet: WalletForPendingHistory
): Promise<Set<string>> {
  const addressObjects =
    (await firstValueFrom(wallet.addresses$).catch(() => [])) || [];
  return new Set(addressObjects.map((a) => String(a.address ?? a)));
}

export type ResolveAssetMetadata = (
  assetId: string,
  assetInfoMap: Map<string, AssetInfoLike> | undefined
) => {
  displayName?: string;
  ticker?: string;
  decimals?: number;
  fingerprint?: string;
};

export async function transformPendingTxsToItems(
  wallet: WalletForPendingHistory,
  walletAddresses: Set<string>,
  resolveAssetMetadata: ResolveAssetMetadata
): Promise<CardanoTxHistoryItem[]> {
  const inFlight = (await firstValueFrom(
    wallet?.transactions?.outgoing?.inFlight$ ?? of([])
  ).catch(() => [])) as unknown[];
  const signed = (await firstValueFrom(
    wallet?.transactions?.outgoing?.signed$ ?? of([])
  ).catch(() => [])) as unknown[];
  const pendingTxs = [...(inFlight || []), ...(signed || [])];
  if (!pendingTxs.length) return [];

  let assetInfoMap: Map<string, AssetInfoLike> | undefined;
  try {
    if (wallet.assetInfo$) {
      assetInfoMap = (await firstValueFrom(wallet.assetInfo$).catch(
        () => undefined
      )) as Map<string, AssetInfoLike> | undefined;
    }
  } catch {
    /* non-critical */
  }

  const getCoins = (value: unknown): bigint => {
    const coins = (value as { coins?: unknown })?.coins ?? value;
    if (typeof coins === "bigint") return coins;
    if (typeof coins === "number") return BigInt(coins);
    if (typeof coins === "string") return BigInt(coins);
    return BigInt(0);
  };

  const items: CardanoTxHistoryItem[] = [];
  type PendingTx = {
    id?: string;
    body?: { outputs?: unknown[]; fee?: unknown };
    outputs?: unknown[];
    fee?: unknown;
  };
  type PendingItem = { tx?: PendingTx; id?: string };
  type TxOutput = { address?: string; value?: unknown };

  for (const pending of pendingTxs) {
    const p = pending as PendingItem;
    const tx: PendingTx | undefined = p?.tx ?? (p as unknown as PendingTx);
    const txId = String(tx?.id ?? p?.id ?? "");
    if (!txId) continue;

    const body = tx?.body ?? {};
    const outputs = body?.outputs ?? tx?.outputs ?? [];
    const fee = getCoins(body?.fee ?? tx?.fee);

    let sentCoins = BigInt(0);
    const sentAssets = new Map<string, bigint>();

    for (const out of outputs) {
      const o = out as TxOutput;
      const addr = String(o?.address ?? "");
      if (!addr) continue;
      if (!walletAddresses.has(addr)) {
        sentCoins += getCoins(o?.value);
        for (const [assetId, qty] of getAssetsFromValue(o?.value)) {
          sentAssets.set(assetId, (sentAssets.get(assetId) ?? BigInt(0)) + qty);
        }
      }
    }

    const assetTransfers: CardanoTxHistoryAsset[] = [];
    for (const [assetId, qty] of sentAssets) {
      const { policyId, assetName } = parseAssetId(assetId);
      const meta = resolveAssetMetadata(assetId, assetInfoMap);
      assetTransfers.push({
        policyId,
        assetName,
        assetId,
        amount: qty.toString(),
        displayName: meta.displayName,
        ticker: meta.ticker,
        decimals: meta.decimals,
        fingerprint: meta.fingerprint,
      });
    }

    items.push({
      id: txId,
      status: "pending",
      direction: "sent",
      amount: sentCoins.toString(),
      fee: fee.toString(),
      assets: assetTransfers.length > 0 ? assetTransfers : undefined,
    });
  }

  return items;
}
