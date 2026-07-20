import { NETWORK_SURFACES_SYNC_MESSAGE_TYPE } from "@keplr-wallet/background";
import { flowResult } from "mobx";
import { ChainStore } from "../stores/chain";

export { NETWORK_SURFACES_SYNC_MESSAGE_TYPE };

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
 * Apply a background network-surfaces broadcast to local projection only.
 * Never writes selection back to background.
 */
export async function applyNetworkSurfacesSyncFromBroadcast(
  chainStore: ChainStore,
  message: NetworkSurfacesSyncMessage
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
