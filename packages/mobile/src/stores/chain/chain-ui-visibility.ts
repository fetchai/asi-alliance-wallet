import { ChainIdHelper } from "@keplr-wallet/cosmos";

/**
 * Pick a still-visible chain when hiding a set of networks (by identifier).
 * `hideChainIds` may be full chain ids or identifiers.
 */
export function pickFallbackWhenHidingChains(
  visibleChainIds: string[],
  hideChainIds: string[]
): string | undefined {
  const hideIdentifiers = new Set(
    hideChainIds.map((id) => ChainIdHelper.parse(id).identifier)
  );

  return visibleChainIds.find(
    (chainId) => !hideIdentifiers.has(ChainIdHelper.parse(chainId).identifier)
  );
}

export function toChainIdentifierSet(chainIds: string[]): Set<string> {
  return new Set(chainIds.map((id) => ChainIdHelper.parse(id).identifier));
}
