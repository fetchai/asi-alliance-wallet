import { ListAccountsMsg } from "@keplr-wallet/background";
import { ChainStore } from "./chain";
import { KeyRingStore } from "@keplr-wallet/stores";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { observable, runInAction } from "mobx";
import { addressCacheStore } from "../utils/address-cache-store";
import {
  mergePartialCacheData,
  normalizeCacheData,
} from "../utils/cache-validation";
import { isCardanoChain, walletSupportsCardano } from "../utils";

const ADDRESS_CACHE_SYNC_RETRY_MIN_INTERVAL_MS = 5000;
const ADDRESS_CACHE_SYNC_RETRY_MAX_ATTEMPTS = 12;

type AddressCacheSyncContext = {
  chainId: string;
  walletIds: string[];
  requiredWalletIds: string[];
  syncKey: string;
  isEvmForChain: boolean;
};

export class AddressCacheSyncManager {
  private _addressCacheSyncContext: AddressCacheSyncContext | undefined =
    undefined;
  private _addressCacheSyncRequestId = 0;
  private _addressCacheSyncRetryEpoch = observable.box(0);
  private _addressCacheSyncLastRetryAt = 0;
  private _addressCacheSyncConsecutiveFailures = 0;
  private _addressCacheSyncInFlightSyncKey: string | undefined = undefined;
  private _disposed = false;

  constructor(
    private readonly chainStore: ChainStore,
    private readonly keyRingStore: KeyRingStore
  ) {}

  get retryEpoch(): number {
    return this._addressCacheSyncRetryEpoch.get();
  }

  schedule(descriptor: {
    currentChainId: string;
    currentWalletIds: string[];
  }): void {
    const syncContext = this._computeSyncContext(descriptor);
    if (!syncContext) {
      return;
    }

    if (this._addressCacheSyncInFlightSyncKey === syncContext.syncKey) {
      return;
    }

    const existingCache = addressCacheStore.getCache(syncContext.chainId);
    const hasRequired = syncContext.requiredWalletIds.every((id) =>
      Boolean(existingCache[id])
    );
    const shouldSyncFromBackend =
      Object.keys(existingCache).length === 0 || !hasRequired;
    if (!shouldSyncFromBackend) {
      runInAction(() => {
        this._addressCacheSyncContext = syncContext;
      });
      return;
    }

    const requestId = ++this._addressCacheSyncRequestId;
    runInAction(() => {
      this._addressCacheSyncInFlightSyncKey = syncContext.syncKey;
    });

    const requester = new InExtensionMessageRequester();
    requester
      .sendMessage(BACKGROUND_PORT, new ListAccountsMsg())
      .then((result) => {
        if (this._disposed) {
          return;
        }

        if (result.error) {
          runInAction(() => {
            if (
              this._addressCacheSyncContext?.syncKey === syncContext.syncKey
            ) {
              this._addressCacheSyncContext = undefined;
            }
            this._increaseFailureAndScheduleRetry();
          });
          return;
        }

        const accounts = result.accounts;
        const { skip, currentChainIdNow } = runInAction(() => {
          if (this._addressCacheSyncRequestId !== requestId) {
            return { skip: true, currentChainIdNow: "" };
          }
          return {
            skip: false,
            currentChainIdNow: this.chainStore.current.chainId,
          };
        });
        if (skip || currentChainIdNow !== syncContext.chainId) {
          return;
        }

        const snapshotWalletIds = [...syncContext.walletIds];
        const fetchedById: Record<string, string> = {};
        snapshotWalletIds.forEach((id, idx) => {
          const acc = accounts[idx];
          fetchedById[id] = acc
            ? syncContext.isEvmForChain
              ? acc.EVMAddress
              : acc.bech32Address
            : "";
        });

        return addressCacheStore.atomicCacheUpdate(
          syncContext.chainId,
          (currentCache) => {
            const normalizedCache = normalizeCacheData(
              currentCache,
              snapshotWalletIds
            );
            const fetchedAddresses = snapshotWalletIds.map(
              (id) => fetchedById[id] || ""
            );
            const mergedCache = mergePartialCacheData(
              normalizedCache,
              snapshotWalletIds,
              fetchedAddresses
            );
            return { newCache: mergedCache, result: mergedCache };
          }
        );
      })
      .then((updateResult) => {
        if (this._disposed) {
          return;
        }
        runInAction(() => {
          if (
            updateResult !== undefined &&
            this._addressCacheSyncRequestId === requestId
          ) {
            this._addressCacheSyncContext = syncContext;
            this._addressCacheSyncConsecutiveFailures = 0;
          }
        });
      })
      .catch((e) => {
        console.error("[RootStore] address cache sync failed", e);
        if (this._disposed) {
          return;
        }
        runInAction(() => {
          this._increaseFailureAndScheduleRetry();
        });
      })
      .finally(() => {
        if (this._disposed) {
          return;
        }
        runInAction(() => {
          if (this._addressCacheSyncRequestId === requestId) {
            this._addressCacheSyncInFlightSyncKey = undefined;
          }
        });
      });
  }

  dispose(): void {
    this._disposed = true;
  }

  private _computeSyncContext(descriptor: {
    currentChainId: string;
    currentWalletIds: string[];
  }): AddressCacheSyncContext | null {
    if (!this.chainStore.hasChain(descriptor.currentChainId)) {
      return null;
    }

    const currentChain = this.chainStore.getChain(descriptor.currentChainId);
    const isEvmForChain = currentChain.features?.includes("evm") ?? false;
    const requiredWalletIds: string[] = isCardanoChain(currentChain)
      ? this.keyRingStore.multiKeyStoreInfo
          .filter((ks) => walletSupportsCardano(ks))
          .map((ks) => ks.meta?.["__id__"] || "")
          .filter(Boolean)
      : descriptor.currentWalletIds;
    const syncKey = `${
      descriptor.currentChainId
    }|${descriptor.currentWalletIds.join(",")}|${requiredWalletIds.join(",")}`;

    return {
      chainId: descriptor.currentChainId,
      walletIds: descriptor.currentWalletIds,
      requiredWalletIds,
      syncKey,
      isEvmForChain,
    };
  }

  private _increaseFailureAndScheduleRetry(): void {
    this._addressCacheSyncConsecutiveFailures += 1;
    if (
      this._addressCacheSyncConsecutiveFailures <
      ADDRESS_CACHE_SYNC_RETRY_MAX_ATTEMPTS
    ) {
      const now = Date.now();
      if (
        now - this._addressCacheSyncLastRetryAt >=
        ADDRESS_CACHE_SYNC_RETRY_MIN_INTERVAL_MS
      ) {
        this._addressCacheSyncLastRetryAt = now;
        this._addressCacheSyncRetryEpoch.set(
          this._addressCacheSyncRetryEpoch.get() + 1
        );
      }
    }
  }
}
