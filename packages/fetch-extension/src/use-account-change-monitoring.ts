/**
 * Account / keyring refresh listens on KEYRING_SURFACES_SYNC, network-surfaces
 * sync, and legacy RefreshAccountList.
 */
import { useEffect, useState } from "react";
import {
  KEYRING_SURFACES_SYNC_MESSAGE_TYPE,
  RefreshAccountList,
} from "@keplr-wallet/background";
import { useStore } from "./stores";
import { syncKeyringSurfacesFromBackground } from "./utils/keyring-surfaces-sync";
import { attachExtensionNetworkProjectionListeners } from "./utils/network-surfaces-sync";

function isExtensionUiContext(): boolean {
  try {
    return Boolean(
      typeof browser !== "undefined" && (browser as any).runtime?.id
    );
  } catch {
    return false;
  }
}

export const useAccountChangeMonitoring = () => {
  const { keyRingStore, chainStore } = useStore();
  const [isPopupOrSidepanel, setIsPopupOrSidepanel] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const currentTab = await browser.tabs.getCurrent();
        if (!currentTab) {
          setIsPopupOrSidepanel(true);
        }
      } catch (e) {
        console.error("Error detecting tab context:", e);
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (!isExtensionUiContext()) {
      return;
    }

    return attachExtensionNetworkProjectionListeners({
      chainStore,
      onOtherMessage: (message) => {
        const m = message as { type?: string };
        if (m?.type === KEYRING_SURFACES_SYNC_MESSAGE_TYPE) {
          void syncKeyringSurfacesFromBackground(chainStore, keyRingStore)
            .then((outcome) => {
              if (outcome === "retry-scheduled") {
                console.warn(
                  "[surfaces] keyring sync scheduled projection retry"
                );
              }
            })
            .catch((error) => {
              console.warn("[surfaces] keyring sync failed:", error);
            });
        }
      },
    });
  }, [chainStore, keyRingStore]);

  useEffect(() => {
    if (!isPopupOrSidepanel) {
      return;
    }

    const messageHandler = (message: any) => {
      const RefreshAccountListMsg = new RefreshAccountList().type();
      if (RefreshAccountListMsg === message.type) {
        keyRingStore.refreshMultiKeyStoreInfo();
        window.location.hash = "/";
        return true;
      }
    };

    browser.runtime.onMessage.addListener(messageHandler);
    return () => {
      browser.runtime.onMessage.removeListener(messageHandler);
    };
  }, [isPopupOrSidepanel, keyRingStore]);

  return null;
};
