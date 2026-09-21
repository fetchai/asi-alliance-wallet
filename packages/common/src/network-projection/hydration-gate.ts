export type ProjectionHydrationGateDeps = {
  releaseInitialQueries: () => void;
  setInitializing: (value: boolean) => void;
  /** Runs once on the first successful pull (bootstrap side effects). */
  onFirstSuccess?: () => void;
};

export type ProjectionHydrationGate = {
  readonly hasReleasedInitialQueries: boolean;
  onPullSucceeded(): void;
};

/**
 * Cold-start gate: deferred queries and isInitializing stay locked until the
 * first successful authoritative pull (including late backoff retry).
 */
export function createProjectionHydrationGate(
  deps: ProjectionHydrationGateDeps
): ProjectionHydrationGate {
  let released = false;

  return {
    get hasReleasedInitialQueries() {
      return released;
    },

    onPullSucceeded(): void {
      if (!released) {
        released = true;
        deps.releaseInitialQueries();
        deps.onFirstSuccess?.();
      }
      deps.setInitializing(false);
    },
  };
}
