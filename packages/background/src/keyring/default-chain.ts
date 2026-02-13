import { ChainInfo } from "@keplr-wallet/types";

/**
 * Preferred default chain when we need to leave a Cardano network (e.g. after
 * switching to a wallet that does not support Cardano). Can be overridden to
 * another chain id or the resolution can rely on list order via getDefaultFallbackChainId.
 */
export const PREFERRED_DEFAULT_CHAIN_ID = "fetchhub-4";

/**
 * Returns the chain id to use as fallback when the current chain is Cardano
 * but the selected wallet does not support Cardano. Prefers PREFERRED_DEFAULT_CHAIN_ID
 * if it exists in the list and is not Cardano; otherwise the first non-Cardano chain.
 */
export function getDefaultFallbackChainId(
  chainInfos: Array<Pick<ChainInfo, "chainId" | "features">>
): string {
  const isCardano = (c: Pick<ChainInfo, "chainId" | "features">) =>
    c.features?.includes("cardano") ?? false;

  const preferred = chainInfos.find(
    (c) => c.chainId === PREFERRED_DEFAULT_CHAIN_ID && !isCardano(c)
  );
  if (preferred) return preferred.chainId;

  const nonCardano = chainInfos.find((c) => !isCardano(c));
  return nonCardano?.chainId ?? chainInfos[0]?.chainId ?? "";
}
