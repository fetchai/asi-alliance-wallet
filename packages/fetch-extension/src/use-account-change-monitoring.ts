import { useEffect, useState } from "react";
import { RefreshAccountList } from "@keplr-wallet/background";
import { useStore } from "./stores";

export const useAccountChangeMonitoring = () => {
  const { keyRingStore } = useStore();
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

  // update keyring store in extension to refresh multikeystore list
  // when wallet is imported or created

  useEffect(() => {
    if (!isPopupOrSidepanel) return; // don't set listener in normal tabs

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
  }, [isPopupOrSidepanel]);

  return null;
};
