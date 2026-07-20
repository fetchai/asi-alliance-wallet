import { flowResult } from "mobx";
import { ChainStore } from "../stores/chain";
import {
  addNetworkSurfacesSyncListener,
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
  type NetworkSurfacesSyncPayload,
} from "@keplr-wallet/background";

export { NETWORK_SURFACES_SYNC_MESSAGE_TYPE };
export type { NetworkSurfacesSyncPayload };

export function isNetworkSurfacesSyncMessage(
  message: unknown
): message is NetworkSurfacesSyncPayload {
  const m = message as NetworkSurfacesSyncPayload | null;
  return Boolean(m && m.type === NETWORK_SURFACES_SYNC_MESSAGE_TYPE);
}

/**
 * Apply a background network-surfaces broadcast to local projection only.
 * Never writes selection back to background.
 */
export async function applyNetworkSurfacesSyncFromBroadcast(
  chainStore: ChainStore,
  message: NetworkSurfacesSyncPayload
): Promise<void> {
  if (
    typeof message.chainId !== "string" ||
    message.chainId.length === 0 ||
    typeof message.revision !== "number"
  ) {
    return;
  }

  await flowResult(
    chainStore.applyBackgroundSelectedChain(message.chainId, message.revision)
  );
}

type SubscribeAndCatchUpDeps = {
  addListener: (
    listener: (message: NetworkSurfacesSyncPayload) => void
  ) => () => void;
  applyFromBroadcast: (
    message: NetworkSurfacesSyncPayload
  ) => PromiseLike<void>;
  catchUpFromBackground: () => PromiseLike<unknown>;
  onCatchUpError?: (error: unknown) => void;
};

/**
 * Subscribe first, then catch-up in the background. Returns unsubscribe
 * synchronously so Provider remount can detach immediately even if catch-up
 * is still pending.
 */
export function subscribeNetworkSurfacesAndCatchUp(
  deps: SubscribeAndCatchUpDeps
): () => void {
  const unsubscribe = deps.addListener((message) => {
    void Promise.resolve(deps.applyFromBroadcast(message)).catch((error) => {
      console.warn("[surfaces] network sync failed:", error);
    });
  });

  void Promise.resolve(deps.catchUpFromBackground()).catch((error) => {
    deps.onCatchUpError?.(error);
    console.warn("[surfaces] network catch-up failed:", error);
  });

  return unsubscribe;
}

/** Wire mobile ChainStore to in-process authority broadcasts + catch-up read. */
export function startMobileNetworkSurfacesSync(
  chainStore: ChainStore
): () => void {
  return subscribeNetworkSurfacesAndCatchUp({
    addListener: addNetworkSurfacesSyncListener,
    applyFromBroadcast: (message) =>
      applyNetworkSurfacesSyncFromBroadcast(chainStore, message),
    catchUpFromBackground: () =>
      flowResult(chainStore.catchUpSelectedChainFromBackground()),
  });
}
