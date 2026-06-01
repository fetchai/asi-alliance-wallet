/**
 * Account / keyring refresh listens on both KEYRING_SURFACES_SYNC and legacy
 * RefreshAccountList plus background `keystore-changed`; extra listeners can mean
 * duplicate UI refresh — consolidate when maintaining this area (see plan / tech debt).
 */
import { useEffect, useState } from "react";
import {
  KEYRING_SURFACES_SYNC_MESSAGE_TYPE,
  RefreshAccountList,
} from "@keplr-wallet/background";
import { useStore } from "./stores";
import { syncKeyringSurfacesFromBackground } from "./utils/keyring-surfaces-sync";

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
        // if currentTab exists, running in a normal tab
        // else it is a popup or sidepanel
        if (!currentTab) {
          setIsPopupOrSidepanel(true);
        }
      } catch (e) {
        console.error("Error detecting tab context:", e);
      }
    };

    init();
  }, []);

  // Dedicated keyring/chain sync for any extension UI page (popup, side panel, full-page tab).
  useEffect(() => {
    if (!isExtensionUiContext()) {
      return;
    }

    const onKeyringSurfacesSync = (message: unknown) => {
      const m = message as { type?: string };
      if (m?.type === KEYRING_SURFACES_SYNC_MESSAGE_TYPE) {
        void syncKeyringSurfacesFromBackground(chainStore, keyRingStore);
      }
    };

    browser.runtime.onMessage.addListener(onKeyringSurfacesSync);
    return () => {
      browser.runtime.onMessage.removeListener(onKeyringSurfacesSync);
    };
  }, [chainStore, keyRingStore]);

  // Legacy: refresh account list and navigate home (popup / sidepanel only).
  useEffect(() => {
    if (!isPopupOrSidepanel) {
      return;
    }

    const messageHandler = (message: any) => {
      const RefreshAccountListMsg = new RefreshAccountList().type();
      if (RefreshAccountListMsg === message.type) {
        keyRingStore.refreshMultiKeyStoreInfo();
        window.location.hash = "/"; // navigate to home on account change
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
