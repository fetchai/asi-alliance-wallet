import type { Account } from "@fetchai/wallet-types";
import type { AddressCacheById } from "@utils/address-cache-store";
import {
  buildFetchedAddressesById,
  createWalletPickerCacheMergeOperation,
  isValidListAccountsForWalletPicker,
  shouldWalletPickerSyncFromBackend,
  walletPickerWalletIdsKeyFingerprint,
} from "@utils/wallet-picker-address-sync";
import { isCardanoChain } from "../../utils/is-cardano-chain";
import type { ChainStore } from "../../stores/chain";
import type { KeyRingStore } from "@keplr-wallet/stores";
import { walletSupportsCardano } from "@keplr-wallet/background/cardano-chain-policy";

type ListAccountsResult = {
  accounts?: Account[];
  error?: string;
};

export type WalletPickerAddressSyncPorts = {
  getCache: (chainId: string) => AddressCacheById;
  atomicCacheUpdate: (
    chainId: string,
    operation: (currentCache: AddressCacheById) => {
      newCache: AddressCacheById;
      result: undefined;
    }
  ) => Promise<undefined>;
  listAccounts: () => Promise<ListAccountsResult>;
};

type NotificationSink = (message: string) => void;

/**
 * Single address-sync attempt for the wallet picker (used by the hook and unit-tested with mocks).
 * Stale runs must be a full no-op, including cache: merge runs only if canCommit() is true inside atomicCacheUpdate.
 */
export async function runWalletPickerAddressSyncAttempt(input: {
  startChainId: string;
  startWalletIdsKey: string;
  snapshotWalletIds: string[];
  canCommit: () => boolean;
  chainStore: ChainStore;
  keyRingStore: KeyRingStore;
  ports: WalletPickerAddressSyncPorts;
  onHydrateAddresses: (map: Record<string, string>) => void;
  onLoadingChange: (loading: boolean) => void;
  onNotifyError: NotificationSink;
}): Promise<void> {
  const {
    startChainId,
    startWalletIdsKey,
    snapshotWalletIds,
    canCommit,
    chainStore,
    keyRingStore,
    ports,
    onHydrateAddresses,
    onLoadingChange,
    onNotifyError,
  } = input;

  const existingCache = ports.getCache(startChainId);
  const hasAnyCachedAddress =
    Object.keys(existingCache).length > 0 &&
    Object.values(existingCache).some((addr) => Boolean(addr));

  if (canCommit()) {
    onHydrateAddresses({ ...existingCache });
  }

  const isCurrentChainCardano = isCardanoChain(
    chainStore.getChain(startChainId)
  );
  const requiredWalletIds: string[] = isCurrentChainCardano
    ? keyRingStore.multiKeyStoreInfo
        .filter((ks) => walletSupportsCardano(ks))
        .map((ks) => ks.meta?.["__id__"] || "")
    : snapshotWalletIds;

  const shouldSync = shouldWalletPickerSyncFromBackend({
    existingCache,
    requiredWalletIds,
  });

  if (!shouldSync) {
    if (canCommit()) {
      onLoadingChange(false);
    }
    return;
  }

  if (canCommit()) {
    onLoadingChange(!hasAnyCachedAddress);
  }

  const result = await ports.listAccounts();

  if (!canCommit()) {
    return;
  }

  if (result.error) {
    onNotifyError(result.error);
    if (canCommit()) {
      onLoadingChange(false);
    }
    return;
  }

  const { accounts } = result;
  const isEvm = chainStore.current.features?.includes("evm") ?? false;

  if (
    !isValidListAccountsForWalletPicker(
      accounts,
      snapshotWalletIds,
      {
        chainId: startChainId,
        walletIdsKeyFingerprint:
          walletPickerWalletIdsKeyFingerprint(startWalletIdsKey),
        walletIdsCount: snapshotWalletIds.length,
      },
      { isEvm }
    )
  ) {
    if (canCommit()) {
      onLoadingChange(false);
    }
    return;
  }

  if (!canCommit()) {
    return;
  }

  const fetchedById = buildFetchedAddressesById({
    snapshotWalletIds,
    accounts,
    isEvm,
  });

  await ports.atomicCacheUpdate(
    startChainId,
    createWalletPickerCacheMergeOperation({
      canCommit,
      snapshotWalletIds,
      fetchedById,
    })
  );

  if (!canCommit()) {
    return;
  }

  onHydrateAddresses({ ...ports.getCache(startChainId) });
  onLoadingChange(false);
}
