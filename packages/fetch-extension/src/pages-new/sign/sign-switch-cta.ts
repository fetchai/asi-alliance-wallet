/**
 * Pure Cardano sign-switch CTA helpers.
 * Extracted so tests can cover mid-CTA supersede and double BG ticket
 * without mounting React.
 */

/** Fresh BG ticket reads for approve (double-query). Sticky UI true alone is insufficient. */
export async function queryTicketValidForApprove(
  refreshSwitchTicket: () => Promise<boolean>
): Promise<boolean> {
  const first = await refreshSwitchTicket();
  if (!first) {
    return false;
  }
  const second = await refreshSwitchTicket();
  return first && second;
}

export type UndoPersistAfterSupersedeDeps = {
  clearTicket: () => Promise<void>;
  invalidateGateCache: () => void;
  previousAuthorityChainId: string;
  effectiveChainId: string;
  restorePreviousAuthority: (chainId: string) => Promise<void>;
};

/**
 * Mid-CTA supersede after Persist ACK: clear ticket + restore previous BG authority.
 */
export async function undoPersistAfterSupersede(
  deps: UndoPersistAfterSupersedeDeps
): Promise<void> {
  await deps.clearTicket();
  deps.invalidateGateCache();
  if (deps.previousAuthorityChainId !== deps.effectiveChainId) {
    try {
      await deps.restorePreviousAuthority(deps.previousAuthorityChainId);
    } catch {
      // Best-effort restore; caller surfaces the original CTA error.
    }
  }
}

/** Reject / unmount / shell dismiss: clear BG ticket; invalidate UI gate cache when present. */
export async function clearTicketOnSignDismiss(deps: {
  clearTicket: () => Promise<void>;
  /** Omit when dismissing outside SignRequestContent (no UI gate cache). */
  invalidateGateCache?: () => void;
}): Promise<void> {
  await deps.clearTicket();
  deps.invalidateGateCache?.();
}
