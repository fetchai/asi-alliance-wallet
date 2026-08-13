import { flowResult } from "mobx";
import {
  BroadcastKeyringSurfacesSyncMsg,
  KEYRING_SURFACES_SYNC_MESSAGE_TYPE,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { KeyRingStore } from "@keplr-wallet/stores";
import type { ProjectionSyncOutcome } from "@keplr-wallet/common";
import type { NetworkProjectionSurface } from "./network-surfaces-sync";

export { KEYRING_SURFACES_SYNC_MESSAGE_TYPE };

const requester = new InExtensionMessageRequester();

/**
 * Ask background to broadcast a dedicated runtime event so all extension UI surfaces refresh state.
 * Call only after a local selected-keystore transition completed successfully.
 */
export async function requestKeyringSurfacesSyncBroadcast(): Promise<void> {
  await requester.sendMessage(
    BACKGROUND_PORT,
    new BroadcastKeyringSurfacesSyncMsg()
  );
}

/**
 * Refresh multi-key store from background, then sync network projection via
 * the shared controller (no direct selection apply).
 */
export async function syncKeyringSurfacesFromBackground(
  chainStore: NetworkProjectionSurface,
  keyRingStore: KeyRingStore
): Promise<ProjectionSyncOutcome> {
  await flowResult(keyRingStore.refreshMultiKeyStoreInfo());
  return chainStore.syncNetworkProjection();
}
