import {
  armEndpointsQueryRefresh,
  createEndpointsQueryRefreshLatch,
  disarmEndpointsQueryRefresh,
  noteEndpointsMutationSyncOutcome,
  shouldRefreshQueriesOnAcceptedApply,
} from "./endpoints-query-refresh-latch";

describe("endpointsQueryRefreshLatch", () => {
  it("stale in-flight accept refreshes but does not clear before mutation sync settles", () => {
    const latch = createEndpointsQueryRefreshLatch();
    armEndpointsQueryRefresh(latch);

    // Pre-write pull applies while pending is already armed.
    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(true);
    expect(latch.pending).toBe(true);
    expect(latch.clearOnNextAccept).toBe(false);

    // Post-write pull applies during the same syncNow.
    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(true);
    expect(latch.pending).toBe(true);

    noteEndpointsMutationSyncOutcome(latch, "applied");
    expect(latch.pending).toBe(false);

    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(false);
  });

  it("retry-scheduled keeps latch until a later accepted apply", () => {
    const latch = createEndpointsQueryRefreshLatch();
    armEndpointsQueryRefresh(latch);

    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(true);
    expect(latch.pending).toBe(true);

    noteEndpointsMutationSyncOutcome(latch, "retry-scheduled");
    expect(latch.pending).toBe(true);
    expect(latch.clearOnNextAccept).toBe(true);

    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(true);
    expect(latch.pending).toBe(false);
    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(false);
  });

  it("BG failure disarm prevents refresh", () => {
    const latch = createEndpointsQueryRefreshLatch();
    armEndpointsQueryRefresh(latch);
    disarmEndpointsQueryRefresh(latch);
    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(false);
  });

  it("re-arm after retry-scheduled cancels clear-on-next until sync settles again", () => {
    const latch = createEndpointsQueryRefreshLatch();
    armEndpointsQueryRefresh(latch);
    noteEndpointsMutationSyncOutcome(latch, "retry-scheduled");
    expect(latch.clearOnNextAccept).toBe(true);

    armEndpointsQueryRefresh(latch);
    expect(latch.clearOnNextAccept).toBe(false);
    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(true);
    expect(latch.pending).toBe(true);
  });

  it("coalesced success-then-failure must note retry-scheduled so backoff accept still refreshes", () => {
    const latch = createEndpointsQueryRefreshLatch();
    armEndpointsQueryRefresh(latch);

    // First pull accepted (covers targetGen); do not clear yet — mutation sync
    // has not settled.
    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(true);
    expect(latch.pending).toBe(true);

    // Controller returns retry-scheduled when follow-up failed with timer armed.
    noteEndpointsMutationSyncOutcome(latch, "retry-scheduled");
    expect(latch.pending).toBe(true);
    expect(latch.clearOnNextAccept).toBe(true);

    // Backoff accept with post-write registry must still refresh.
    expect(shouldRefreshQueriesOnAcceptedApply(latch)).toBe(true);
    expect(latch.pending).toBe(false);
  });
});
