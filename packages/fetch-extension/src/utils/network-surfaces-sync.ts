import { NETWORK_SURFACES_SYNC_MESSAGE_TYPE } from "@keplr-wallet/background";
import type { ProjectionSyncOutcome } from "@keplr-wallet/common";

export { NETWORK_SURFACES_SYNC_MESSAGE_TYPE };

/** Minimal surface API — avoid importing ChainStore (heavy transitive deps). */
export type NetworkProjectionSurface = {
  invalidateNetworkProjection(): void;
  syncNetworkProjection(): Promise<ProjectionSyncOutcome>;
  cancelPendingNetworkProjectionRetry?: () => void;
};

export type NetworkSurfacesSyncMessage = {
  type: string;
  chainId?: string;
  revision?: number;
};

export function isNetworkSurfacesSyncMessage(
  message: unknown
): message is NetworkSurfacesSyncMessage {
  const m = message as NetworkSurfacesSyncMessage | null;
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

type StartExtensionNetworkSurfacesSyncDeps = {
  chainStore: NetworkProjectionSurface;
  onOtherMessage?: (message: unknown) => void;
  addRuntimeMessageListener?: (
    listener: (message: unknown) => void
  ) => () => void;
  addFocusListener?: (listener: () => void) => () => void;
};

/**
 * Attach runtime listener + focus recovery to the ChainStore projection
 * controller. Controller lifetime is owned by ChainStore.
 */
export function attachExtensionNetworkProjectionListeners(
  deps: StartExtensionNetworkSurfacesSyncDeps
): () => void {
  const addRuntimeMessageListener =
    deps.addRuntimeMessageListener ??
    ((listener) => {
      browser.runtime.onMessage.addListener(listener);
      return () => {
        browser.runtime.onMessage.removeListener(listener);
      };
    });

  const addFocusListener =
    deps.addFocusListener ??
    ((listener) => {
      const onVis = () => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          listener();
        }
      };
      const onFocus = () => listener();
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVis);
      }
      if (typeof window !== "undefined") {
        window.addEventListener("focus", onFocus);
      }
      return () => {
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", onVis);
        }
        if (typeof window !== "undefined") {
          window.removeEventListener("focus", onFocus);
        }
      };
    });

  const onMessage = (message: unknown) => {
    if (isNetworkSurfacesSyncMessage(message)) {
      deps.chainStore.invalidateNetworkProjection();
      return;
    }
    deps.onOtherMessage?.(message);
  };

  const detachRuntime = addRuntimeMessageListener(onMessage);
  const detachFocus = addFocusListener(() => {
    deps.chainStore.invalidateNetworkProjection();
  });

  // Catch-up after subscribe. Swallow dispose mid-pull (and any other reject):
  // fire-and-forget must not surface unhandled rejections.
  void deps.chainStore.syncNetworkProjection().catch(() => undefined);

  return () => {
    detachRuntime();
    detachFocus();
    deps.chainStore.cancelPendingNetworkProjectionRetry?.();
  };
}
