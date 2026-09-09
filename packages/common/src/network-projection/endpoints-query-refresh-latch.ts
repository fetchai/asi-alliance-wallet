import type { ProjectionSyncOutcome } from "./controller";

/**
 * Latch so endpoint mutations refresh observed queries when the registry
 * actually receives post-write endpoints — not when a stale in-flight pull
 * applies an older bundle (controller coalescing).
 *
 * - Arm before the BG write (invalidation may apply before syncNow).
 * - Refresh on every accepted apply while armed (stale + fresh).
 * - Clear only after the mutation's syncNow returns "applied", or on the
 *   next accepted apply after "retry-scheduled" (backoff recovery).
 */
export type EndpointsQueryRefreshLatch = {
  pending: boolean;
  clearOnNextAccept: boolean;
};

export function createEndpointsQueryRefreshLatch(): EndpointsQueryRefreshLatch {
  return { pending: false, clearOnNextAccept: false };
}

export function armEndpointsQueryRefresh(
  latch: EndpointsQueryRefreshLatch
): void {
  latch.pending = true;
  latch.clearOnNextAccept = false;
}

export function disarmEndpointsQueryRefresh(
  latch: EndpointsQueryRefreshLatch
): void {
  latch.pending = false;
  latch.clearOnNextAccept = false;
}

/** After mutation syncNow settles: clear now, or clear on next accept. */
export function noteEndpointsMutationSyncOutcome(
  latch: EndpointsQueryRefreshLatch,
  outcome: ProjectionSyncOutcome
): void {
  if (!latch.pending) {
    return;
  }
  if (outcome === "applied") {
    disarmEndpointsQueryRefresh(latch);
  } else {
    latch.clearOnNextAccept = true;
  }
}

/**
 * On accepted projection apply: whether to call refreshAllObserved.
 * Does not clear while the mutation syncNow may still be waiting for a
 * follow-up pull (stale in-flight apply must not drop the latch).
 */
export function shouldRefreshQueriesOnAcceptedApply(
  latch: EndpointsQueryRefreshLatch
): boolean {
  if (!latch.pending) {
    return false;
  }
  if (latch.clearOnNextAccept) {
    disarmEndpointsQueryRefresh(latch);
  }
  return true;
}
