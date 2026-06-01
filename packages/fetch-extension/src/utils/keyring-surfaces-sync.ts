import { flowResult } from "mobx";
import {
  BroadcastKeyringSurfacesSyncMsg,
  GetSelectedChainIdMsg,
  KEYRING_SURFACES_SYNC_MESSAGE_TYPE,
  getDefaultFallbackChainId,
  walletShouldLeaveCardanoChain,
} from "@keplr-wallet/background";
import type { ChainInfo } from "@keplr-wallet/types";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { ChainStore } from "../stores/chain";
import { KeyRingStore } from "@keplr-wallet/stores";

export { KEYRING_SURFACES_SYNC_MESSAGE_TYPE };

const requester = new InExtensionMessageRequester();

function chainInfoIsCardano(
  chainInfos: Array<Pick<ChainInfo, "chainId" | "features">>,
  chainId: string
): boolean {
  const info = chainInfos.find((c) => c.chainId === chainId);
  return info?.features?.includes("cardano") ?? false;
}

/**
 * Single target chain for local MobX: never apply background Cardano selection
 * when the selected keystore cannot use Cardano (avoids transient incompatible state).
 */
function resolveTargetChainIdForSync(
  chainInfos: Array<Pick<ChainInfo, "chainId" | "features">>,
  backgroundChainId: string,
  selected: Parameters<typeof walletShouldLeaveCardanoChain>[0] | undefined
): string {
  if (
    selected &&
    chainInfoIsCardano(chainInfos, backgroundChainId) &&
    walletShouldLeaveCardanoChain(selected)
  ) {
    const fb = getDefaultFallbackChainId(chainInfos);
    return fb || backgroundChainId;
  }
  return backgroundChainId;
}

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
 * Refresh multi-key store from background, then apply one chain selection aligned with
 * background intent and Cardano/keystore compatibility (no intermediate Cardano apply).
 */
export async function syncKeyringSurfacesFromBackground(
  chainStore: ChainStore,
  keyRingStore: KeyRingStore
): Promise<void> {
  await flowResult(keyRingStore.refreshMultiKeyStoreInfo());

  const { chainId: backgroundChainId } = (await requester.sendMessage(
    BACKGROUND_PORT,
    new GetSelectedChainIdMsg()
  )) as { chainId: string };

  const selected = keyRingStore.multiKeyStoreInfo.find((k) => k.selected);
  const targetChainId = resolveTargetChainIdForSync(
    chainStore.chainInfos,
    backgroundChainId,
    selected
  );

  if (targetChainId && targetChainId !== chainStore.selectedChainId) {
    await flowResult(chainStore.selectChainAndPersist(targetChainId));
  }
}
