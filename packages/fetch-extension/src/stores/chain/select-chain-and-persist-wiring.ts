import { toGenerator } from "@keplr-wallet/common";
import { ensureSelectedChainAck } from "./ensure-selected-chain-ack";

type SelectChainAndPersistWiringDeps = {
  isInitializing: boolean;
  setDeferChainIdSelect: (chainId: string) => void;
  sendSetSelectedChain: (chainId: string) => Promise<unknown>;
  setSelectedChainIdLocal: (chainId: string) => void;
  saveLastViewChainId: () => PromiseLike<unknown>;
};

export function* selectChainAndPersistWiring(
  deps: SelectChainAndPersistWiringDeps,
  chainId: string
): IterableIterator<unknown> {
  if (deps.isInitializing) {
    deps.setDeferChainIdSelect(chainId);
  }

  yield* toGenerator(
    ensureSelectedChainAck(deps.sendSetSelectedChain, chainId)
  );
  deps.setSelectedChainIdLocal(chainId);
  yield* toGenerator(Promise.resolve(deps.saveLastViewChainId()));
}
