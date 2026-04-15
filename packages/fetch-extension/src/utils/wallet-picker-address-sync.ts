import type { Account } from "@fetchai/wallet-types";
import {
  mergePartialCacheData,
  normalizeCacheData,
  hasRequiredAddresses,
} from "./cache-validation";
import type { AddressCacheById } from "./address-cache-store";

const LOG_PREFIX = "[WalletPickerAddressSync]";

/** Compact fingerprint for logs (avoid leaking full wallet id list in telemetry). */
export function walletPickerWalletIdsKeyFingerprint(
  walletIdsKey: string
): string {
  let h = 2166136261;
  for (let i = 0; i < walletIdsKey.length; i++) {
    h ^= walletIdsKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export type ListAccountsValidationContext = {
  chainId: string;
  /** Fingerprint of ordered wallet id key, not raw ids */
  walletIdsKeyFingerprint: string;
  walletIdsCount: number;
};

export function logWalletPickerListAccountsLengthMismatch(
  context: ListAccountsValidationContext & {
    accountsLength: number;
    snapshotWalletIdsLength: number;
  }
): void {
  console.warn(`${LOG_PREFIX} ListAccounts length mismatch`, context);
}

export function logWalletPickerListAccountsSanityFailure(
  context: ListAccountsValidationContext & { detail: string }
): void {
  console.warn(`${LOG_PREFIX} ListAccounts sanity check failed`, context);
}

/**
 * Validates ListAccounts response before index-based mapping to wallet ids.
 * Index association is a temporary compromise until ListAccounts returns stable wallet identifiers (follow-up).
 */
export function isValidListAccountsForWalletPicker(
  accounts: Account[] | undefined,
  snapshotWalletIds: string[],
  context: ListAccountsValidationContext,
  options?: { isEvm?: boolean }
): accounts is Account[] {
  if (!accounts || accounts.length !== snapshotWalletIds.length) {
    logWalletPickerListAccountsLengthMismatch({
      ...context,
      accountsLength: accounts?.length ?? 0,
      snapshotWalletIdsLength: snapshotWalletIds.length,
    });
    return false;
  }
  const isEvm = options?.isEvm ?? false;
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    if (!acc || typeof acc.bech32Address !== "string") {
      logWalletPickerListAccountsSanityFailure({
        ...context,
        detail: `invalid bech32Address at index ${i}`,
      });
      return false;
    }
    if (isEvm && typeof acc.EVMAddress !== "string") {
      logWalletPickerListAccountsSanityFailure({
        ...context,
        detail: `invalid EVMAddress at index ${i}`,
      });
      return false;
    }
  }
  return true;
}

export function shouldWalletPickerSyncFromBackend(input: {
  existingCache: AddressCacheById;
  requiredWalletIds: string[];
}): boolean {
  return (
    Object.keys(input.existingCache).length === 0 ||
    !hasRequiredAddresses(input.existingCache, input.requiredWalletIds)
  );
}

export function buildFetchedAddressesById(input: {
  snapshotWalletIds: string[];
  accounts: Account[];
  isEvm: boolean;
}): Record<string, string> {
  const fetchedById: Record<string, string> = {};
  input.snapshotWalletIds.forEach((id, idx) => {
    const acc = input.accounts[idx];
    fetchedById[id] = acc
      ? input.isEvm
        ? acc.EVMAddress
        : acc.bech32Address
      : "";
  });
  return fetchedById;
}

export function mergeWalletPickerCacheSnapshot(input: {
  existingCache: AddressCacheById;
  snapshotWalletIds: string[];
  fetchedById: Record<string, string>;
}): AddressCacheById {
  const normalizedCache = normalizeCacheData(
    input.existingCache,
    input.snapshotWalletIds
  );
  const fetchedAddresses = input.snapshotWalletIds.map(
    (id) => input.fetchedById[id] || ""
  );
  return mergePartialCacheData(
    normalizedCache,
    input.snapshotWalletIds,
    fetchedAddresses
  );
}

/**
 * Cache merge for atomicCacheUpdate: if canCommit is false at commit time, return currentCache unchanged
 * so stale async work is a full no-op including the store write.
 */
export function createWalletPickerCacheMergeOperation(input: {
  canCommit: () => boolean;
  snapshotWalletIds: string[];
  fetchedById: Record<string, string>;
}): (currentCache: AddressCacheById) => {
  newCache: AddressCacheById;
  result: undefined;
} {
  return (currentCache) => {
    if (!input.canCommit()) {
      return { newCache: currentCache, result: undefined };
    }
    const newCache = mergeWalletPickerCacheSnapshot({
      existingCache: currentCache,
      snapshotWalletIds: input.snapshotWalletIds,
      fetchedById: input.fetchedById,
    });
    return { newCache, result: undefined };
  };
}
