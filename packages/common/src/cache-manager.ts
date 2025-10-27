/**
 * Common cache management interface for wallet addresses.
 * Provides abstraction for both frontend and background cache operations.
 */

export type AddressCacheById = Record<string, string>;
export type ChainCaches = Record<string, AddressCacheById>;

export interface CacheManager {
  getCache(chainId: string): AddressCacheById;
  setCache(chainId: string, data: AddressCacheById): void;
  updateCache(chainId: string, updates: Partial<AddressCacheById>): void;
  clearChainCache(chainId: string): void;
  clearAllCaches(): void;
  getAllCaches(): ChainCaches;
  addWalletToAllCaches(walletId: string): void;
  removeWalletFromAllCaches(walletId: string): void;
}

// Global cache manager instance - initialized in frontend only
let globalCacheManager: CacheManager | null = null;

export function setCacheManager(manager: CacheManager): void {
  globalCacheManager = manager;
}

export function getCacheManager(): CacheManager {
  if (!globalCacheManager) {
    throw new Error("Cache manager not initialized. This should only be called in frontend context.");
  }
  return globalCacheManager;
}
