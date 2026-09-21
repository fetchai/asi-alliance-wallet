/**
 * UI gate-cache contract: overlapping BG reads must not corrupt
 * switchTicketValid / authorityChainId after epoch invalidation.
 *
 * Epoch drop means "superseded query" — not "BG says invalid/mismatch".
 * Callers that need a SoT answer must retry at the current epoch.
 */

export function nextGateCacheEpoch(currentEpoch: number): number {
  return currentEpoch + 1;
}

/** @deprecated Use nextGateCacheEpoch — same counter for ticket + authority. */
export function nextTicketCacheEpoch(currentEpoch: number): number {
  return nextGateCacheEpoch(currentEpoch);
}

/**
 * Whether a completed gate query may write into the UI cache.
 * Stale in-flight answers (epoch mismatch) are dropped.
 */
export function shouldApplyGateRefreshResult(
  queryEpoch: number,
  currentEpoch: number
): boolean {
  return queryEpoch === currentEpoch;
}

/** @deprecated Use shouldApplyGateRefreshResult */
export function shouldApplyTicketRefreshResult(
  queryEpoch: number,
  currentEpoch: number
): boolean {
  return shouldApplyGateRefreshResult(queryEpoch, currentEpoch);
}

export type TicketRefreshClassification =
  | { kind: "applied"; valid: boolean }
  | { kind: "dropped" };

/** Classify a finished ticket query: write-eligible answer vs superseded (retry). */
export function classifyTicketRefreshResult(
  queryEpoch: number,
  currentEpoch: number,
  valid: boolean
): TicketRefreshClassification {
  if (!shouldApplyGateRefreshResult(queryEpoch, currentEpoch)) {
    return { kind: "dropped" };
  }
  return { kind: "applied", valid };
}

export type AuthorityRefreshClassification =
  | { kind: "applied"; chainId: string | undefined }
  | { kind: "dropped" };

/** Classify a finished authority query: write-eligible vs superseded (retry). */
export function classifyAuthorityRefreshResult(
  queryEpoch: number,
  currentEpoch: number,
  chainId: string | undefined
): AuthorityRefreshClassification {
  if (!shouldApplyGateRefreshResult(queryEpoch, currentEpoch)) {
    return { kind: "dropped" };
  }
  return { kind: "applied", chainId };
}

/**
 * Sequence after IssueSignSwitchTicket: bump epoch so any pre-Issue
 * GetSignSwitchTicketValid (started by surfaces-sync after Persist) cannot
 * write valid:false over the post-Issue refresh.
 */
export function epochAfterIssueSignSwitchTicket(
  epochBeforeIssueRefresh: number
): number {
  return nextGateCacheEpoch(epochBeforeIssueRefresh);
}

const DEFAULT_GATE_REFRESH_MAX_ATTEMPTS = 8;

/**
 * Query BG ticket validity until an answer applies at the current epoch.
 * Dropped (superseded) attempts are retried — never treated as valid:false.
 * Exhausted retries fail closed.
 */
export async function resolveTicketValidWithEpochRetry(params: {
  getEpoch: () => number;
  queryValid: () => Promise<boolean>;
  maxAttempts?: number;
}): Promise<{ applied: true; valid: boolean } | { applied: false }> {
  const maxAttempts = params.maxAttempts ?? DEFAULT_GATE_REFRESH_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const epoch = params.getEpoch();
    let valid: boolean;
    try {
      valid = await params.queryValid();
    } catch {
      if (!shouldApplyGateRefreshResult(epoch, params.getEpoch())) {
        continue;
      }
      return { applied: true, valid: false };
    }

    const classified = classifyTicketRefreshResult(
      epoch,
      params.getEpoch(),
      valid
    );
    if (classified.kind === "dropped") {
      continue;
    }
    return { applied: true, valid: classified.valid };
  }

  return { applied: false };
}

/**
 * Query BG authority chain id until an answer applies at the current epoch.
 * Dropped attempts are retried — never written as a stale match arm value.
 * Exhausted retries fail closed (caller keeps authority cleared).
 */
export async function resolveAuthorityChainIdWithEpochRetry(params: {
  getEpoch: () => number;
  queryChainId: () => Promise<string | undefined>;
  maxAttempts?: number;
}): Promise<
  { applied: true; chainId: string | undefined } | { applied: false }
> {
  const maxAttempts = params.maxAttempts ?? DEFAULT_GATE_REFRESH_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const epoch = params.getEpoch();
    let chainId: string | undefined;
    try {
      chainId = await params.queryChainId();
    } catch {
      if (!shouldApplyGateRefreshResult(epoch, params.getEpoch())) {
        continue;
      }
      return { applied: true, chainId: undefined };
    }

    const classified = classifyAuthorityRefreshResult(
      epoch,
      params.getEpoch(),
      chainId
    );
    if (classified.kind === "dropped") {
      continue;
    }
    return { applied: true, chainId: classified.chainId };
  }

  return { applied: false };
}

/**
 * Pre-approve SoT reads for the Cardano live gate.
 *
 * Never Promise.all(ticket ∥ authority) — a pre-Select ticket:true must not
 * pair with a post-Select authority mismatch via the ticket short-circuit.
 *
 * Order: authority → ticket; if ticket is false, re-read authority after ticket.
 * The match arm must not keep an authority snapshot from before the ticket
 * query (Select-between would leave requested + ticket:false → fail-open).
 */
export async function resolvePreApproveGateReads(params: {
  refreshAuthorityChainId: () => Promise<string | undefined>;
  queryTicketValid: () => Promise<boolean>;
}): Promise<{
  authorityChainId: string | undefined;
  ticketValid: boolean;
}> {
  const authorityBeforeTicket = await params.refreshAuthorityChainId();
  const ticketValid = await params.queryTicketValid();
  if (ticketValid) {
    return { authorityChainId: authorityBeforeTicket, ticketValid: true };
  }
  const authorityAfterTicket = await params.refreshAuthorityChainId();
  return { authorityChainId: authorityAfterTicket, ticketValid: false };
}
