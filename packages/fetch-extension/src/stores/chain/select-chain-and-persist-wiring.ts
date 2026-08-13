import { toGenerator } from "@keplr-wallet/common";
import { ensureSelectedChainAck } from "./ensure-selected-chain-ack";
import type { ProjectionSyncOutcome } from "@keplr-wallet/common";

type SelectChainAndPersistWiringDeps = {
  sendSelectSelectedChain: (
    chainId: string
  ) => PromiseLike<{ chainId: string; revision: number }>;
  /** Pull authoritative projection after ACK. Failure ≠ switch failure. */
  syncProjection: () => PromiseLike<ProjectionSyncOutcome>;
  saveLastViewChainId: () => PromiseLike<unknown>;
};

/**
 * Explicit user selection: await background ack (switch success), then
 * sync projection. Projection retry/errors do not fail the switch.
 */
export function* selectChainAndPersistWiring(
  deps: SelectChainAndPersistWiringDeps,
  chainId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Generator<any, void, any> {
  yield* toGenerator(
    Promise.resolve(
      ensureSelectedChainAck(deps.sendSelectSelectedChain, chainId)
    )
  );

  const outcome = yield* toGenerator(Promise.resolve(deps.syncProjection()));

  if (outcome !== "applied") {
    console.warn(
      "[selectChainAndPersist] projection sync scheduled retry after chain switch;",
      "switch succeeded; last-view persist skipped until projection applies"
    );
    return;
  }

  try {
    yield* toGenerator(Promise.resolve(deps.saveLastViewChainId()));
  } catch (error) {
    console.warn(
      "[selectChainAndPersist] Failed to persist last-view chain id:",
      error
    );
  }
}
