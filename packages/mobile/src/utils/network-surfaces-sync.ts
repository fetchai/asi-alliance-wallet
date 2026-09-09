import { AppState, type AppStateStatus } from "react-native";
import {
  addNetworkSurfacesSyncListener,
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
  type NetworkSurfacesSyncPayload,
} from "@keplr-wallet/background";
import type { ProjectionSyncOutcome } from "@keplr-wallet/common";

export { NETWORK_SURFACES_SYNC_MESSAGE_TYPE };
export type { NetworkSurfacesSyncPayload };

/** Minimal surface API — avoid importing ChainStore (heavy transitive deps). */
export type NetworkProjectionSurface = {
  invalidateNetworkProjection(): void;
  syncNetworkProjection(): Promise<ProjectionSyncOutcome>;
  cancelPendingNetworkProjectionRetry?: () => void;
};

export function isNetworkSurfacesSyncMessage(
  message: unknown
): message is NetworkSurfacesSyncPayload {
  const m = message as NetworkSurfacesSyncPayload | null;
  return Boolean(m && m.type === NETWORK_SURFACES_SYNC_MESSAGE_TYPE);
}

/**
 * Broadcast is invalidation only — never apply payload chainId/revision.
 */
export function invalidateNetworkProjectionFromBroadcast(
  chainStore: NetworkProjectionSurface,
  message: unknown
): void {
  if (!isNetworkSurfacesSyncMessage(message)) {
    return;
  }
  chainStore.invalidateNetworkProjection();
}

type AttachMobileNetworkProjectionListenersDeps = {
  chainStore: NetworkProjectionSurface;
  addListener?: (
    listener: (message: NetworkSurfacesSyncPayload) => void
  ) => () => void;
  /** Defaults to AppState "active" (foreground resume). */
  addAppStateListener?: (
    listener: (state: AppStateStatus) => void
  ) => () => void;
};

/**
 * Attach in-process listener + AppState resume to the ChainStore projection
 * controller. Controller lifetime is owned by ChainStore.
 */
export function attachMobileNetworkProjectionListeners(
  deps: AttachMobileNetworkProjectionListenersDeps
): () => void {
  const addListener = deps.addListener ?? addNetworkSurfacesSyncListener;

  const addAppStateListener =
    deps.addAppStateListener ??
    ((listener) => {
      const subscription = AppState.addEventListener("change", listener);
      return () => {
        subscription.remove();
      };
    });

  const unsubscribe = addListener((message) => {
    invalidateNetworkProjectionFromBroadcast(deps.chainStore, message);
  });

  const detachAppState = addAppStateListener((state) => {
    if (state === "active") {
      deps.chainStore.invalidateNetworkProjection();
    }
  });

  // Catch-up after subscribe. Swallow dispose mid-pull (and any other reject):
  // fire-and-forget must not surface unhandled rejections.
  void deps.chainStore.syncNetworkProjection().catch(() => undefined);

  return () => {
    unsubscribe();
    detachAppState();
    // Remount catch-up re-arms sync; cancel so backoff cannot fire while detached.
    deps.chainStore.cancelPendingNetworkProjectionRetry?.();
  };
}

/** Wire mobile ChainStore to in-process authority broadcasts + catch-up sync. */
export function startMobileNetworkSurfacesSync(
  chainStore: NetworkProjectionSurface
): () => void {
  return attachMobileNetworkProjectionListeners({ chainStore });
}
