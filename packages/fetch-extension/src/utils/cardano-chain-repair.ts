import {
  getDefaultFallbackChainId,
  walletShouldLeaveCardanoChain,
} from "@keplr-wallet/background/cardano-chain-policy";
import type { ChainInfo } from "@keplr-wallet/types";

export type CardanoRepairSnapshot = {
  chainId: string;
  walletId: string;
};

export type MultiKeyStoreLikeForCardanoRepair = Array<{
  selected?: boolean;
  meta?: Record<string, unknown>;
  type?: string;
}>;

/**
 * Shared logic for RootStore Cardano repair reaction: if persisted UI has Cardano selected
 * but the selected wallet cannot stay on Cardano, return non-Cardano fallback chain id.
 */
export function getCardanoChainRepairFallbackIfStale(
  snap: CardanoRepairSnapshot | null | undefined,
  multiKeyStoreInfo: MultiKeyStoreLikeForCardanoRepair,
  currentChain: { features?: string[] } | null | undefined,
  chainInfos: Array<Pick<ChainInfo, "chainId" | "features">>
): string | null {
  if (!snap?.walletId) {
    return null;
  }
  const selected = multiKeyStoreInfo.find((k) => k.selected);
  if (!selected || String(selected.meta?.["__id__"] ?? "") !== snap.walletId) {
    return null;
  }
  const isCardano = currentChain?.features?.includes("cardano") ?? false;
  if (!isCardano) {
    return null;
  }
  if (!walletShouldLeaveCardanoChain(selected)) {
    return null;
  }
  const fallback = getDefaultFallbackChainId(chainInfos);
  if (!fallback || fallback === snap.chainId) {
    return null;
  }
  return fallback;
}
