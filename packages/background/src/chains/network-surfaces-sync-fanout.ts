import { NetworkAuthoritySnapshot } from "./authority/types";

export const NETWORK_SURFACES_SYNC_MESSAGE_TYPE = "network-surfaces-sync";

export type NetworkSurfacesSyncPayload = {
  type: string;
  chainId: string;
  revision: number;
};

type NetworkSurfacesSyncListener = (
  payload: NetworkSurfacesSyncPayload
) => void;

const listeners = new Set<NetworkSurfacesSyncListener>();

/**
 * In-process fan-out for platforms without chrome.runtime (e.g. React Native).
 * Extension UIs still use browser.runtime.onMessage.
 */
export function addNetworkSurfacesSyncListener(
  listener: NetworkSurfacesSyncListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyNetworkSurfacesSyncListeners(
  snapshot: NetworkAuthoritySnapshot
): void {
  const payload: NetworkSurfacesSyncPayload = {
    type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
    chainId: snapshot.chainId,
    revision: snapshot.revision,
  };
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (error) {
      console.warn("[NetworkSurfacesSync] in-process listener failed:", error);
    }
  }
}
