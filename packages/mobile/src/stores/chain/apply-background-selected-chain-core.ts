import {
  applySelectedChainAuthority,
  SelectedChainApplyResult,
  SelectedChainAuthoritySnapshot,
} from "./apply-selected-chain-authority";

export type ApplyBackgroundSelectedChainCoreDeps = {
  getLocalSnapshot: () => SelectedChainAuthoritySnapshot;
  setLocalSnapshot: (snapshot: SelectedChainAuthoritySnapshot) => void;
  hasChain: (chainId: string) => boolean;
  refreshRegistry: () => PromiseLike<void>;
  onProtocolViolation?: (
    local: SelectedChainAuthoritySnapshot,
    incoming: SelectedChainAuthoritySnapshot
  ) => void;
  onMissingChain?: (chainId: string) => void;
};

/**
 * Apply an incoming background snapshot with a revision re-check after every
 * await (registry refresh) so a stale refresh cannot overwrite a newer apply.
 */
export async function applyBackgroundSelectedChainCore(
  deps: ApplyBackgroundSelectedChainCoreDeps,
  incoming: SelectedChainAuthoritySnapshot
): Promise<SelectedChainApplyResult> {
  const decide = (): SelectedChainApplyResult =>
    applySelectedChainAuthority(deps.getLocalSnapshot(), incoming);

  let decision = decide();
  if (decision === "stale" || decision === "protocol-violation") {
    if (decision === "protocol-violation") {
      deps.onProtocolViolation?.(deps.getLocalSnapshot(), incoming);
    }
    return decision;
  }

  if (!deps.hasChain(incoming.chainId)) {
    await deps.refreshRegistry();
    decision = decide();
    if (decision === "stale" || decision === "protocol-violation") {
      return decision;
    }
  }

  if (!deps.hasChain(incoming.chainId)) {
    deps.onMissingChain?.(incoming.chainId);
    return "stale";
  }

  decision = decide();
  if (decision === "stale" || decision === "protocol-violation") {
    return decision;
  }

  deps.setLocalSnapshot({
    chainId: incoming.chainId,
    revision: incoming.revision,
  });
  return decision;
}
