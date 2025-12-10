import { useEffect } from "react";
import { RefreshAccountList } from "@keplr-wallet/background";
import { useStore } from "./stores";

export const useAccountChangeMonitoring = () => {
  const { keyRingStore } = useStore();

  // update keyring store in extension to refresh multikeystore list
  // when wallet is imported or created

  useEffect(() => {
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
  }, []);

  return null;
};
