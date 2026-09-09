export type SelectedChainAuthoritySnapshot = {
  chainId: string;
  revision: number;
};

export type SelectedChainApplyResult =
  | "applied"
  | "already-current"
  | "stale"
  | "protocol-violation";

/**
 * Decide whether a background `{ chainId, revision }` should replace the local
 * projection. Newer revision wins; equal revision must match chainId.
 */
export function applySelectedChainAuthority(
  current: SelectedChainAuthoritySnapshot,
  incoming: SelectedChainAuthoritySnapshot
): SelectedChainApplyResult {
  if (
    !Number.isSafeInteger(incoming.revision) ||
    incoming.revision < 1 ||
    !incoming.chainId
  ) {
    return "stale";
  }

  if (incoming.revision > current.revision) {
    return "applied";
  }

  if (incoming.revision < current.revision) {
    return "stale";
  }

  if (incoming.chainId !== current.chainId) {
    return "protocol-violation";
  }

  return "already-current";
}

export function shouldPersistLastViewAfterApply(
  result: SelectedChainApplyResult
): boolean {
  return result === "applied" || result === "already-current";
}
