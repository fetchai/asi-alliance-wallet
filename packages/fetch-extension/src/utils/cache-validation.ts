/**
 * Cache utilities for wallet address caching.
 * NO localStorage - all caching is in-memory (singleton store or backend KVStore).
 */

import { AddressCacheById } from "./address-cache-store";

export const normalizeCacheData = (
  existingCache: AddressCacheById,
  currentIds: string[]
): AddressCacheById => {
  const normalized: AddressCacheById = {};
  const currentIdsSet = new Set(currentIds);

  Object.entries(existingCache).forEach(([walletId, address]) => {
    if (currentIdsSet.has(walletId)) {
      normalized[walletId] = address;
    }
  });

  return normalized;
};

export const mergePartialCacheData = (
  existingCache: AddressCacheById,
  currentIds: string[],
  fetchedAddresses: string[]
): AddressCacheById => {
  const merged: AddressCacheById = { ...existingCache };

  // CRITICAL FIX: The issue is that fetchedAddresses comes from backend
  // in the same order as current wallet list, but if a wallet was deleted,
  // the indices don't match. We need to trust the order from backend.
  // currentIds and fetchedAddresses should be in the same order.
  currentIds.forEach((walletId, idx) => {
    if (idx < fetchedAddresses.length && fetchedAddresses[idx]) {
      merged[walletId] = fetchedAddresses[idx];
    }
  });

  return merged;
};

export const addressesFromCacheData = (
  cacheData: AddressCacheById,
  currentIds: string[]
): string[] => {
  return currentIds.map((id) => cacheData[id] || "");
};

export const hasRequiredAddresses = (
  cacheData: AddressCacheById,
  requiredIds: string[]
): boolean => {
  const result = requiredIds.every((id) => {
    const hasAddress = Boolean(cacheData[id]);
    console.log(
      `[hasRequiredAddresses] Wallet ${id}: hasAddress=${hasAddress}, address="${
        cacheData[id] || "EMPTY"
      }"`
    );
    return hasAddress;
  });
  console.log(
    `[hasRequiredAddresses] Result: ${result} for ${requiredIds.length} wallets`
  );
  return result;
};
