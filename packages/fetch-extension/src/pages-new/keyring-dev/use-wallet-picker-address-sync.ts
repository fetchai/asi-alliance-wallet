import { useEffect, useMemo, useRef, useState } from "react";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { ListAccountsMsg } from "@keplr-wallet/background";
import type { ChainStore } from "../../stores/chain";
import type { KeyRingStore } from "@keplr-wallet/stores";
import { addressCacheStore } from "@utils/address-cache-store";
import { runWalletPickerAddressSyncAttempt } from "./run-wallet-picker-address-sync";

/** Narrow contract: only `push` is used; keep loose so real `useNotification()` matches. */
type NotificationLike = { push: (property: any) => unknown };

/**
 * Loads and maintains wallet-bound addresses for the wallet picker. Owns reads/writes to
 * addressCacheStore; consumers use only `addressesById` for rendering.
 */
export function useWalletPickerAddressSync(options: {
  chainStore: ChainStore;
  keyRingStore: KeyRingStore;
  notification: NotificationLike;
}): {
  addressesById: Record<string, string>;
  isLoadingAddresses: boolean;
} {
  const { chainStore, keyRingStore, notification } = options;

  const chainStoreRef = useRef(chainStore);
  const keyRingStoreRef = useRef(keyRingStore);
  const notificationRef = useRef(notification);

  chainStoreRef.current = chainStore;
  keyRingStoreRef.current = keyRingStore;
  notificationRef.current = notification;

  const chainId = chainStore.current.chainId;
  const currentWalletIds = useMemo(
    () => keyRingStore.multiKeyStoreInfo.map((ks) => ks.meta?.["__id__"] || ""),
    [keyRingStore.multiKeyStoreInfo]
  );
  const walletIdsKey = useMemo(
    () => currentWalletIds.join(","),
    [currentWalletIds]
  );

  const [addressesById, setAddressesById] = useState<Record<string, string>>(
    {}
  );
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);

  const loadRunIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const runId = ++loadRunIdRef.current;
    const startChainId = chainId;
    const startWalletIdsKey = walletIdsKey;
    const snapshotWalletIds = keyRingStoreRef.current.multiKeyStoreInfo.map(
      (ks) => ks.meta?.["__id__"] || ""
    );

    const getCurrentWalletIdsKey = () =>
      keyRingStoreRef.current.multiKeyStoreInfo
        .map((ks) => ks.meta?.["__id__"] || "")
        .join(",");

    const canCommit = (): boolean => {
      if (!isMountedRef.current) {
        return false;
      }
      if (runId !== loadRunIdRef.current) {
        return false;
      }
      if (chainStoreRef.current.current.chainId !== startChainId) {
        return false;
      }
      if (getCurrentWalletIdsKey() !== startWalletIdsKey) {
        return false;
      }
      return true;
    };

    const requester = new InExtensionMessageRequester();

    void runWalletPickerAddressSyncAttempt({
      startChainId,
      startWalletIdsKey,
      snapshotWalletIds,
      canCommit,
      chainStore: chainStoreRef.current,
      keyRingStore: keyRingStoreRef.current,
      ports: {
        getCache: (id) => addressCacheStore.getCache(id),
        atomicCacheUpdate: (cid, op) =>
          addressCacheStore.atomicCacheUpdate(cid, op),
        listAccounts: async () =>
          requester.sendMessage(BACKGROUND_PORT, new ListAccountsMsg()),
      },
      onHydrateAddresses: (map) => setAddressesById(map),
      onLoadingChange: (loading) => setIsLoadingAddresses(loading),
      onNotifyError: (message) => {
        notificationRef.current.push({
          placement: "top-center",
          type: "danger",
          duration: 4,
          content: message,
          canDelete: true,
          transition: { duration: 0.25 },
        });
      },
    }).catch((error) => {
      console.warn(
        "[WalletPickerAddressSync] Failed to fetch wallet addresses:",
        error
      );
      if (canCommit()) {
        setIsLoadingAddresses(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stores read via refs; effect tracks chain + wallet list identity only
  }, [chainId, walletIdsKey]);

  return { addressesById, isLoadingAddresses };
}
