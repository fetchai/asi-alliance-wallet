import { toGenerator } from "@keplr-wallet/common";
import {
  SelectedChainApplyResult,
  SelectedChainAuthoritySnapshot,
} from "./apply-selected-chain-authority";

type StartupSyncSelectedChainWiringDeps = {
  getBackgroundSnapshot: () => PromiseLike<SelectedChainAuthoritySnapshot>;
  tryApplyBackgroundSelectedChain: (
    chainId: string,
    revision: number
  ) => SelectedChainApplyResult | PromiseLike<SelectedChainApplyResult>;
};

/**
 * Bootstrap local projection from background. Never writes selection.
 */
export function* startupSyncSelectedChainWiring(
  deps: StartupSyncSelectedChainWiringDeps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Generator<any, void, any> {
  const snapshot = yield* toGenerator(
    Promise.resolve(deps.getBackgroundSnapshot())
  );

  yield* toGenerator(
    Promise.resolve(
      deps.tryApplyBackgroundSelectedChain(snapshot.chainId, snapshot.revision)
    )
  );
}
