import { toGenerator } from "@keplr-wallet/common";
import { ensureSelectedChainAck } from "./ensure-selected-chain-ack";
import {
  SelectedChainApplyResult,
  shouldPersistLastViewAfterApply,
} from "./apply-selected-chain-authority";

type SelectChainAndPersistWiringDeps = {
  sendSelectSelectedChain: (
    chainId: string
  ) => PromiseLike<{ chainId: string; revision: number }>;
  tryApplyBackgroundSelectedChain: (
    chainId: string,
    revision: number
  ) => SelectedChainApplyResult | PromiseLike<SelectedChainApplyResult>;
  saveLastViewChainId: () => PromiseLike<unknown>;
};

/**
 * Explicit user selection: await background ack, apply revision locally, then
 * best-effort last-view persist.
 */
export function* selectChainAndPersistWiring(
  deps: SelectChainAndPersistWiringDeps,
  chainId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Generator<any, void, any> {
  const authority = yield* toGenerator(
    Promise.resolve(
      ensureSelectedChainAck(deps.sendSelectSelectedChain, chainId)
    )
  );

  const result = yield* toGenerator(
    Promise.resolve(
      deps.tryApplyBackgroundSelectedChain(
        authority.chainId,
        authority.revision
      )
    )
  );

  if (result === "stale" || result === "protocol-violation") {
    throw new Error("network_switch_superseded");
  }

  if (!shouldPersistLastViewAfterApply(result)) {
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
