import { flowResult } from "mobx";
import {
  BroadcastKeyringSurfacesSyncMsg,
  GetSelectedChainSnapshotMsg,
  KEYRING_SURFACES_SYNC_MESSAGE_TYPE,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { ChainStore } from "../stores/chain";
import { KeyRingStore } from "@keplr-wallet/stores";

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
 * Refresh multi-key store from background, then project the committed snapshot.
 * Wallet/chain compatibility repair runs in background before this broadcast;
 * surfaces must not write Select back (that can overwrite a newer explicit choice).
 */
export async function syncKeyringSurfacesFromBackground(
  chainStore: ChainStore,
  keyRingStore: KeyRingStore
): Promise<void> {
  await flowResult(keyRingStore.refreshMultiKeyStoreInfo());

  const snapshot = await requester.sendMessage(
    BACKGROUND_PORT,
    new GetSelectedChainSnapshotMsg()
  );

  await flowResult(
    chainStore.applyBackgroundSelectedChain(snapshot.chainId, snapshot.revision)
  );
}
