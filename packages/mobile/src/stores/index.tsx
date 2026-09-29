import React, { FunctionComponent, useEffect } from "react";

import { createRootStore, RootStore } from "./root";

const storeContext = React.createContext<RootStore | null>(null);

/*
 I don't know why react native works that way.
 But, react native clears all view and create new views when window size changes of the app exits by back button on android.
 So, rootStore can be made multiple times if it handles on the provider.
 To prevent this problem, handle the root store statically.
 */
let rootStore: RootStore | undefined;
// Bump when RootStore construction changes so Fast Refresh recreates instead
// of keeping a stale static instance.
const ROOT_STORE_GEN = 5;
let rootStoreGen = 0;

function getRootStore(): RootStore {
  if (!rootStore || rootStoreGen !== ROOT_STORE_GEN) {
    rootStore = createRootStore();
    rootStoreGen = ROOT_STORE_GEN;
  }
  return rootStore;
}

export const StoreProvider: FunctionComponent = ({ children }) => {
  const stores = getRootStore();

  useEffect(() => {
    return () => {
      // Check the comment of `_isAndroidActivityKilled` field on `WalletConnectStore`
      stores.walletConnectStore.onAndroidActivityKilled();
    };
  }, [stores]);

  return (
    <storeContext.Provider value={stores}>{children}</storeContext.Provider>
  );
};

export const useStore = () => {
  const store = React.useContext(storeContext);
  if (!store) {
    throw new Error("You have forgot to use StoreProvider");
  }
  return store;
};
