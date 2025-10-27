/**
 * In-memory singleton cache for wallet addresses.
 * Survives component unmount/remount cycles.
 */

import { CacheManager, AddressCacheById, ChainCaches } from "@keplr-wallet/common";

class AddressCacheStore implements CacheManager {
  private static readonly LOCK_TIMEOUT_MS = 5000;
  
  private cache: ChainCaches = {};
  // Monotonic epoch to invalidate stale async updates across event boundaries
  private epoch = 0;
  
  // Per-chain locks to prevent race conditions
  private operationLocks: Map<string, Promise<void>> = new Map();

  constructor() {
  }

  /**
   * Execute operation with per-chain lock to prevent race conditions.
   */
  private async withLock<T>(
    lockKey: string,
    operation: () => Promise<T> | T
  ): Promise<T> {
    const existingLock = this.operationLocks.get(lockKey) || Promise.resolve();
    
    let timeoutId: NodeJS.Timeout | undefined;
    
    const newLock = existingLock
      .then(async () => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Lock timeout for ${lockKey} after ${AddressCacheStore.LOCK_TIMEOUT_MS}ms`));
          }, AddressCacheStore.LOCK_TIMEOUT_MS);
        });
        
        try {
          const result = await Promise.race([
            Promise.resolve(operation()),
            timeoutPromise
          ]);
          return result;
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      })
      .catch((error) => {
        console.error(`[AddressCacheStore] Lock operation failed for ${lockKey}:`, error);
        // Continue execution - lock operations are not critical
        throw error;
      })
      .finally(() => {
        if (this.operationLocks.get(lockKey) === newLockVoid) {
          this.operationLocks.delete(lockKey);
        }
      });
    
    const newLockVoid = newLock.then(() => {}).catch((error) => {
      // Lock cleanup failed - log but don't throw to avoid breaking the operation
      console.error(`[AddressCacheStore] Lock cleanup failed for ${lockKey}:`, error);
    });
    this.operationLocks.set(lockKey, newLockVoid);
    
    return newLock;
  }

  /**
   * Bump global cache epoch to invalidate in-flight UI updates.
   */
  public bumpEpoch(): void {
    this.epoch++;
  }

  /** Get current cache epoch. */
  public getEpoch(): number {
    return this.epoch;
  }

  /**
   * Get cache for specific chain
   */
  getCache(chainId: string): AddressCacheById {
    return this.cache[chainId] || {};
  }

  /**
   * Internal: Set cache without lock
   */
  private _setCacheUnsafe(chainId: string, data: AddressCacheById): void {
    this.cache[chainId] = { ...data };
  }

  /**
   * Set cache for specific chain
   */
  setCache(chainId: string, data: AddressCacheById): void {
    this.withLock(chainId, () => {
      this._setCacheUnsafe(chainId, data);
    }).catch((error) => {
      console.error(`[AddressCacheStore] setCache failed for ${chainId}:`, error);
      // Continue execution - cache operations are not critical
    });
  }

  /**
   * Internal: Update cache without lock
   */
  private _updateCacheUnsafe(chainId: string, updates: Partial<AddressCacheById>): void {
    const existing = this.cache[chainId] || {};
    const merged: AddressCacheById = { ...existing };
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        merged[key] = value;
      }
    });
    
    this.cache[chainId] = merged;
  }

  /**
   * Update cache for specific chain
   */
  updateCache(chainId: string, updates: Partial<AddressCacheById>): void {
    this.withLock(chainId, () => {
      this._updateCacheUnsafe(chainId, updates);
    }).catch((error) => {
      console.error(`[AddressCacheStore] updateCache failed for ${chainId}:`, error);
      // Continue execution - cache operations are not critical
    });
  }

  /**
   * Atomic cache operation with lock
   */
  async atomicCacheUpdate<T>(
    chainId: string, 
    operation: (currentCache: AddressCacheById) => { newCache: AddressCacheById; result: T }
  ): Promise<T> {
    return this.withLock(chainId, () => {
      const startEpoch = this.epoch;
      const currentCache = this.cache[chainId] || {};
      const { newCache, result } = operation(currentCache);
      
      if (this.epoch !== startEpoch) {
        return result;
      }
      this._setCacheUnsafe(chainId, newCache);
      return result;
    });
  }

  /**
   * Internal: Clear chain cache without lock
   */
  private _clearChainCacheUnsafe(chainId: string): void {
    delete this.cache[chainId];
  }

  /**
   * Clear cache for specific chain
   */
  clearChainCache(chainId: string): void {
    this.withLock(chainId, () => {
      this._clearChainCacheUnsafe(chainId);
      this.bumpEpoch();
    }).catch((error) => {
      console.error(`[AddressCacheStore] clearChainCache failed for ${chainId}:`, error);
      // Continue execution - cache clearing is not critical
    });
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    for (const chainId of Object.keys(this.cache)) {
      delete this.cache[chainId];
    }
    this.bumpEpoch();
  }

  /**
   * Get all caches
   */
  getAllCaches(): ChainCaches {
    return { ...this.cache };
  }

  /**
   * Clear all caches when wallet is added
   * This ensures cache consistency after adding a new wallet
   */
  addWalletToAllCaches(walletId: string): void {
    if (!walletId) return;
    this.clearAllCaches();
  }

  /**
   * Clear all caches when wallet is deleted
   * This ensures cache consistency after deleting a wallet
   */
  removeWalletFromAllCaches(walletId: string): void {
    if (!walletId) return;
    this.clearAllCaches();
  }
}

// Singleton instance - in-memory only, backend handles persistence
let addressCacheStore: AddressCacheStore;

if (typeof window !== "undefined" && (window as any).__addressCacheStore) {
  addressCacheStore = (window as any).__addressCacheStore;
} else {
  addressCacheStore = new AddressCacheStore();
  if (typeof window !== "undefined") {
    (window as any).__addressCacheStore = addressCacheStore;
  }
}

export { addressCacheStore };

export type { AddressCacheById, ChainCaches };
