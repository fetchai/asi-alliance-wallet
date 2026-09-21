/**
 * Single-flight network projection pull controller.
 * Platform-agnostic: no MobX, browser, or React Native dependencies.
 *
 * Pull and apply are separate so dispose() can discard a transport response
 * before it mutates local state.
 */

export type ProjectionSyncOutcome = "applied" | "retry-scheduled";

/** Result of applying a pulled bundle to local state. */
export type ProjectionApplyResult = "accepted" | "rejected";

export type NetworkProjectionControllerDeps<TBundle = unknown> = {
  pullBundle: () => Promise<TBundle>;
  /**
   * Apply must be synchronous. Return "accepted" when local state was updated
   * or confirmed current; "rejected" when the bundle was not applied (e.g. stale).
   */
  applyBundle: (bundle: TBundle) => ProjectionApplyResult;
  onPullError?: (error: unknown) => void;
  /** Injectable clock for tests. Defaults to setTimeout/clearTimeout. */
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
  /** Backoff: attempt 0 → baseMs, then *factor, capped. */
  retryBaseMs?: number;
  retryFactor?: number;
  retryCapMs?: number;
};

export type NetworkProjectionController = {
  readonly projectionReady: boolean;
  readonly disposed: boolean;
  invalidate(): void;
  syncNow(): Promise<ProjectionSyncOutcome>;
  /** Cancel an armed backoff without disposing the controller. */
  cancelPendingRetry(): void;
  dispose(): void;
};

const DEFAULT_BASE_MS = 250;
const DEFAULT_FACTOR = 2;
const DEFAULT_CAP_MS = 5000;

function defaultSchedule(fn: () => void, ms: number): { cancel: () => void } {
  const id = setTimeout(fn, ms);
  return {
    cancel: () => {
      clearTimeout(id);
    },
  };
}

export function createNetworkProjectionController<TBundle = unknown>(
  deps: NetworkProjectionControllerDeps<TBundle>
): NetworkProjectionController {
  const retryBaseMs = deps.retryBaseMs ?? DEFAULT_BASE_MS;
  const retryFactor = deps.retryFactor ?? DEFAULT_FACTOR;
  const retryCapMs = deps.retryCapMs ?? DEFAULT_CAP_MS;
  const schedule = deps.schedule ?? defaultSchedule;

  let disposed = false;
  let projectionReady = false;
  let dirty = false;
  let inFlight: Promise<void> | null = null;
  let retryAttempt = 0;
  let retryHandle: { cancel: () => void } | null = null;
  /** Generation bumped on each invalidate/syncNow so syncNow waits for its dirty. */
  let dirtyGeneration = 0;
  let appliedGeneration = 0;

  const cancelRetry = () => {
    if (retryHandle) {
      retryHandle.cancel();
      retryHandle = null;
    }
  };

  const backoffMs = (): number => {
    const raw = retryBaseMs * Math.pow(retryFactor, retryAttempt);
    return Math.min(retryCapMs, raw);
  };

  const scheduleRetry = () => {
    if (disposed) {
      return;
    }
    cancelRetry();
    const ms = backoffMs();
    retryHandle = schedule(() => {
      retryHandle = null;
      if (disposed) {
        return;
      }
      // Bump attempt when the backoff fires so invalidate cannot inflate delay
      // by repeatedly cancelling/rescheduling.
      retryAttempt += 1;
      dirty = true;
      dirtyGeneration += 1;
      void ensurePull();
    }, ms);
  };

  const runPull = async (): Promise<
    "ok" | "rejected" | "error" | "aborted"
  > => {
    try {
      const bundle = await deps.pullBundle();
      if (disposed) {
        return "aborted";
      }
      const applyResult = deps.applyBundle(bundle);
      if (disposed) {
        return "aborted";
      }
      if (applyResult === "rejected") {
        return "rejected";
      }
      projectionReady = true;
      retryAttempt = 0;
      return "ok";
    } catch (error) {
      try {
        deps.onPullError?.(error);
      } catch {
        // Callback failures must not change syncNow outcome / retry scheduling.
      }
      return "error";
    }
  };

  const ensurePull = (): Promise<void> => {
    if (disposed) {
      return Promise.resolve();
    }
    if (inFlight) {
      return inFlight;
    }

    const run = (async () => {
      for (;;) {
        if (disposed) {
          return;
        }
        if (!dirty) {
          return;
        }
        const genAtStart = dirtyGeneration;
        dirty = false;

        const result = await runPull();
        if (disposed || result === "aborted") {
          return;
        }

        if (result === "ok") {
          appliedGeneration = Math.max(appliedGeneration, genAtStart);
          if (dirty) {
            continue;
          }
          cancelRetry();
          return;
        }

        if (result === "rejected" || result === "error") {
          // Not applied: keep last projection / placeholder, do not reset
          // backoff, do not hot-loop. Arm exactly one retry so syncNow's
          // "retry-scheduled" means a timer is live.
          if (dirty) {
            continue;
          }
          scheduleRetry();
          return;
        }
      }
    })();

    const pending = run.finally(() => {
      if (inFlight === pending) {
        inFlight = null;
      }
    });
    inFlight = pending;
    return pending;
  };

  return {
    get projectionReady() {
      return projectionReady;
    },

    get disposed() {
      return disposed;
    },

    invalidate(): void {
      if (disposed) {
        return;
      }
      dirty = true;
      dirtyGeneration += 1;
      if (inFlight) {
        return;
      }
      if (retryHandle) {
        // Keep the existing backoff deadline; dirty is picked up when it fires.
        return;
      }
      void ensurePull();
    },

    async syncNow(): Promise<ProjectionSyncOutcome> {
      if (disposed) {
        throw new Error("network_projection_controller_disposed");
      }
      dirty = true;
      dirtyGeneration += 1;
      const targetGen = dirtyGeneration;

      cancelRetry();

      await ensurePull();
      while (!disposed && inFlight) {
        await inFlight;
      }

      if (disposed) {
        throw new Error("network_projection_controller_disposed");
      }
      // "applied" and an armed backoff are exclusive. A coalesced
      // follow-up failure after covering targetGen still schedules retry —
      // callers (e.g. endpoint latch) must see "retry-scheduled".
      if (appliedGeneration >= targetGen && projectionReady && !retryHandle) {
        return "applied";
      }
      return "retry-scheduled";
    },

    cancelPendingRetry(): void {
      cancelRetry();
    },

    dispose(): void {
      disposed = true;
      cancelRetry();
      dirty = false;
      inFlight = null;
    },
  };
}
