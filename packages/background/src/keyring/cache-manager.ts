import { KVStore } from "@keplr-wallet/common";
import { CommonCrypto } from "./types";
import { Crypto } from "./crypto";
import { Buffer } from "buffer/";

export interface CacheEntry {
  address: string;
  name?: string;
  pubKey?: string;
  mnemonicLength?: string;
}

export interface CacheData {
  [walletId: string]: CacheEntry;
}

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  issues: string[];
}

export interface CacheManagerConfig {
  kvStore: KVStore;
  crypto: CommonCrypto;
  password?: string;
  embedChainInfos: any[];
}

export class AddressCacheManager {
  private static readonly CARDANO_CACHE_PREFIX = "cardano_addr_cache:";
  private static readonly GENERIC_CACHE_PREFIX = "addr_cache:";
  private static readonly LOCK_TIMEOUT_MS = 5000;

  private kvStore: KVStore;
  private crypto: CommonCrypto;
  private password?: string;
  private embedChainInfos: any[];

  // Per-chain locks to prevent race conditions
  private operationLocks: Map<string, Promise<void>> = new Map();

  constructor(config: CacheManagerConfig) {
    this.kvStore = config.kvStore;
    this.crypto = config.crypto;
    this.password = config.password;
    this.embedChainInfos = config.embedChainInfos;
  }

  /**
   * Execute operation with per-chain lock to prevent race conditions.
   */
  private async withLock<T>(
    lockKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const existingLock = this.operationLocks.get(lockKey) || Promise.resolve();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const newLock = existingLock
      .then(async () => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                `Lock timeout for ${lockKey} after ${AddressCacheManager.LOCK_TIMEOUT_MS}ms`
              )
            );
          }, AddressCacheManager.LOCK_TIMEOUT_MS);
        });

        try {
          const result = await Promise.race([operation(), timeoutPromise]);
          return result;
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      })
      .finally(() => {
        if (this.operationLocks.get(lockKey) === newLockVoid) {
          this.operationLocks.delete(lockKey);
        }
      });

    const newLockVoid = newLock.then(() => {});
    this.operationLocks.set(lockKey, newLockVoid);

    return newLock;
  }

  /**
   * Execute operation with a single retry on transient errors.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    retryDelayMs = 100
  ): Promise<T> {
    try {
      return await fn();
    } catch (e: unknown) {
      if (this.isTransientError(e)) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return await fn();
      }
      throw e;
    }
  }

  /** Heuristic transient error classifier. */
  private isTransientError(e: unknown): boolean {
    const msg = this.formatError(e);
    return /timeout|temporar(y|ily)|network|busy/i.test(msg);
  }

  /** Format unknown error to string for logs. */
  private formatError(e: unknown): string {
    if (e instanceof Error) return e.message;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  setPassword(password: string): void {
    this.password = password;
  }

  hasPassword(): boolean {
    return !!this.password && this.password.length > 0;
  }

  /**
   * Check if stored cache data is encrypted (new format) or plain text (legacy format).
   */
  private isEncryptedCacheData(data: any): boolean {
    if (typeof data !== "string") return false;
    try {
      const parsed = JSON.parse(data);
      const c = parsed?.crypto;
      return (
        parsed?.version === "1.0" &&
        c &&
        typeof c.cipher === "string" &&
        c.cipher === "aes-128-ctr" &&
        typeof c.cipherparams?.iv === "string" &&
        typeof c.kdf === "string" &&
        typeof c.kdfparams?.salt === "string" &&
        typeof c.ciphertext === "string" &&
        typeof c.mac === "string"
      );
    } catch {
      return false;
    }
  }

  /**
   * Encrypt cache data using AES-128-CTR + KDF scrypt
   */
  private async encryptCacheData(data: CacheData): Promise<string> {
    if (!this.password) {
      throw new Error("Password not set - cannot encrypt cache");
    }

    const encrypted = await Crypto.encryptBlob(
      this.crypto,
      "scrypt",
      JSON.stringify(data),
      this.password,
      { cacheType: "address_cache" }
    );
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypt cache data
   */
  private async decryptCacheData(encryptedData: string): Promise<CacheData> {
    if (!this.password) {
      throw new Error("Password not set - cannot decrypt cache");
    }

    try {
      const encrypted = JSON.parse(encryptedData);
      const decrypted = await Crypto.decryptBlob(
        this.crypto,
        encrypted,
        this.password
      );
      return JSON.parse(Buffer.from(decrypted).toString());
    } catch (e: unknown) {
      throw new Error(`Failed to decrypt cache data: ${this.formatError(e)}`);
    }
  }

  /**
   * Get cache key for Cardano chain
   */
  private getCardanoCacheKey(chainId: string): string {
    return `${AddressCacheManager.CARDANO_CACHE_PREFIX}${chainId}`;
  }

  /**
   * Get cache key for Generic chain
   */
  private getGenericCacheKey(chainId: string): string {
    return `${AddressCacheManager.GENERIC_CACHE_PREFIX}${chainId}`;
  }

  /**
   * Internal: Load Cardano cache without lock
   */
  private async _loadCardanoCacheUnsafe(
    chainId: string
  ): Promise<Record<string, { address: string; pubKey: string }>> {
    const key = this.getCardanoCacheKey(chainId);
    const data = await this.kvStore.get<
      string | Record<string, { address: string; pubKey: string }>
    >(key);

    if (!data) return {};

    if (this.isEncryptedCacheData(data)) {
      if (!this.password) {
        return {};
      }

      try {
        const decrypted = await this.decryptCacheData(data as string);
        const result: Record<string, { address: string; pubKey: string }> = {};
        for (const [walletId, entry] of Object.entries(decrypted)) {
          result[walletId] = {
            address: entry.address,
            pubKey: entry.pubKey || "",
          };
        }
        return result;
      } catch (e: unknown) {
        return {};
      }
    }

    return data as Record<string, { address: string; pubKey: string }>;
  }

  /**
   * Load Cardano cache for specific chain
   */
  async loadCardanoCache(
    chainId: string
  ): Promise<Record<string, { address: string; pubKey: string }>> {
    return this.withRetry(() =>
      this.withLock(`cardano:${chainId}`, () =>
        this._loadCardanoCacheUnsafe(chainId)
      )
    );
  }

  /**
   * Internal: Save Cardano cache without lock
   */
  private async _saveCardanoCacheUnsafe(
    chainId: string,
    cache: Record<string, { address: string; pubKey: string }>
  ): Promise<void> {
    const key = this.getCardanoCacheKey(chainId);

    if (!this.password) {
      return;
    }

    try {
      const cacheData: CacheData = {};
      for (const [walletId, entry] of Object.entries(cache)) {
        cacheData[walletId] = {
          address: entry.address,
          pubKey: entry.pubKey,
        };
      }

      const encrypted = await this.encryptCacheData(cacheData);
      await this.kvStore.set(key, encrypted);
    } catch (e: unknown) {
      await this.kvStore.set(key, cache);
    }
  }

  /**
   * Save Cardano cache for specific chain
   */
  async saveCardanoCache(
    chainId: string,
    cache: Record<string, { address: string; pubKey: string }>
  ): Promise<void> {
    return this.withRetry(() =>
      this.withLock(`cardano:${chainId}`, () =>
        this._saveCardanoCacheUnsafe(chainId, cache)
      )
    );
  }

  /**
   * Internal: Load Generic cache without lock
   */
  private async _loadGenericCacheUnsafe(chainId: string): Promise<
    Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
        mnemonicLength?: string;
      }
    >
  > {
    const key = this.getGenericCacheKey(chainId);
    const data = await this.kvStore.get<
      | string
      | Record<
          string,
          {
            address: string;
            name?: string;
            pubKey?: string;
            mnemonicLength?: string;
          }
        >
    >(key);

    if (!data) return {};

    if (this.isEncryptedCacheData(data)) {
      if (!this.password) {
        return {};
      }

      try {
        const decrypted = await this.decryptCacheData(data as string);
        const result: Record<
          string,
          {
            address: string;
            name?: string;
            pubKey?: string;
            mnemonicLength?: string;
          }
        > = {};
        for (const [walletId, entry] of Object.entries(decrypted)) {
          result[walletId] = {
            address: entry.address,
            name: entry.name,
            pubKey: entry.pubKey,
            mnemonicLength: entry.mnemonicLength,
          };
        }
        return result;
      } catch (e: unknown) {
        return {};
      }
    }

    return data as Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
        mnemonicLength?: string;
      }
    >;
  }

  /**
   * Load Generic cache for specific chain
   */
  async loadGenericCache(chainId: string): Promise<
    Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
        mnemonicLength?: string;
      }
    >
  > {
    return this.withRetry(() =>
      this.withLock(`generic:${chainId}`, () =>
        this._loadGenericCacheUnsafe(chainId)
      )
    );
  }

  /**
   * Internal: Save Generic cache without lock
   */
  private async _saveGenericCacheUnsafe(
    chainId: string,
    cache: Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
        mnemonicLength?: string;
      }
    >
  ): Promise<void> {
    const key = this.getGenericCacheKey(chainId);

    if (!this.password) {
      return;
    }

    try {
      const cacheData: CacheData = {};
      for (const [walletId, entry] of Object.entries(cache)) {
        cacheData[walletId] = {
          address: entry.address,
          name: entry.name,
          pubKey: entry.pubKey,
        };
      }

      const encrypted = await this.encryptCacheData(cacheData);
      await this.kvStore.set(key, encrypted);
    } catch (e: unknown) {
      await this.kvStore.set(key, cache);
    }
  }

  /**
   * Save Generic cache for specific chain
   */
  async saveGenericCache(
    chainId: string,
    cache: Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
        mnemonicLength?: string;
      }
    >
  ): Promise<void> {
    return this.withRetry(() =>
      this.withLock(`generic:${chainId}`, () =>
        this._saveGenericCacheUnsafe(chainId, cache)
      )
    );
  }

  /**
   * Comprehensive consistency check for cache
   */
  async checkConsistency(
    chainId: string,
    walletIds: string[],
    walletNames: string[],
    activeWalletId: string,
    activeWalletAddress: string,
    isCardano: boolean
  ): Promise<ConsistencyCheckResult> {
    const lockKey = isCardano ? `cardano:${chainId}` : `generic:${chainId}`;

    return this.withRetry(() =>
      this.withLock(lockKey, async () => {
        const issues: string[] = [];

        try {
          const cache = isCardano
            ? await this._loadCardanoCacheUnsafe(chainId)
            : await this._loadGenericCacheUnsafe(chainId);

          const cacheIds = Object.keys(cache);

          if (cacheIds.length !== walletIds.length) {
            issues.push(
              `Wallet count mismatch: cache has ${cacheIds.length}, expected ${walletIds.length}`
            );
          }

          const setCacheIds = new Set(cacheIds);
          const setWalletIds = new Set(walletIds);

          if (!walletIds.every((id) => setCacheIds.has(id))) {
            issues.push("Missing wallet IDs in cache");
          }

          if (!cacheIds.every((id) => setWalletIds.has(id))) {
            issues.push("Extra wallet IDs in cache");
          }

          for (let i = 0; i < walletIds.length; i++) {
            const id = walletIds[i];
            const expectedName = walletNames[i];
            const cachedEntry = cache[id];

            if (cachedEntry && "name" in cachedEntry) {
              const cachedName = cachedEntry.name;
              if (cachedName && cachedName !== expectedName) {
                issues.push(
                  `Name mismatch for wallet ${id}: cached "${cachedName}", expected "${expectedName}"`
                );
              }
            }
          }

          if (activeWalletId && cache[activeWalletId]) {
            const cachedAddr = cache[activeWalletId].address || "";

            if (cachedAddr !== activeWalletAddress) {
              issues.push(
                `Active wallet address mismatch: cached "${cachedAddr.slice(
                  0,
                  10
                )}...", expected "${activeWalletAddress.slice(0, 10)}..."`
              );
            }
          } else if (activeWalletId) {
            issues.push(
              `Missing cache entry for active wallet ${activeWalletId}`
            );
          }

          return {
            isConsistent: issues.length === 0,
            issues,
          };
        } catch (e: unknown) {
          issues.push(`Failed to check consistency: ${this.formatError(e)}`);
          return {
            isConsistent: false,
            issues,
          };
        }
      })
    );
  }

  /**
   * Clear all caches across all chains
   */
  async clearAllCaches(): Promise<void> {
    try {
      await Promise.all(
        this.embedChainInfos.map(async (info) => {
          const isCardano = info?.features?.includes("cardano");
          const lockKey = isCardano
            ? `cardano:${info.chainId}`
            : `generic:${info.chainId}`;

          return this.withRetry(() =>
            this.withLock(lockKey, async () => {
              const key = isCardano
                ? this.getCardanoCacheKey(info.chainId)
                : this.getGenericCacheKey(info.chainId);
              await this.kvStore.set(key, null as any);
            })
          );
        })
      );
    } catch (e: unknown) {
      console.error(`[AddressCacheManager] Cache clearing failed:`, e);
      // Continue execution - cache clearing is not critical for core functionality
    }
  }

  /**
   * Add wallet to all caches
   */
  async addWalletToAllCaches(
    walletId: string,
    walletName: string
  ): Promise<void> {
    if (!walletId) return;

    try {
      for (const info of this.embedChainInfos) {
        if (info?.features?.includes("cardano")) {
          const cache = await this.loadCardanoCache(info.chainId);
          if (cache[walletId] === undefined) {
            cache[walletId] = { address: "", pubKey: "" };
            await this.saveCardanoCache(info.chainId, cache);
          }
        } else {
          const cache = await this.loadGenericCache(info.chainId);
          if (cache[walletId] === undefined) {
            cache[walletId] = { address: "", name: walletName };
            await this.saveGenericCache(info.chainId, cache);
          }
        }
      }
    } catch (e: unknown) {
      console.error(
        `[AddressCacheManager] Wallet addition to cache failed:`,
        e
      );
      // Continue execution - cache operations are not critical for core functionality
    }
  }

  /**
   * Remove wallet from all caches
   */
  async removeWalletFromAllCaches(walletId: string): Promise<void> {
    if (!walletId) return;

    try {
      for (const info of this.embedChainInfos) {
        if (info?.features?.includes("cardano")) {
          const cache = await this.loadCardanoCache(info.chainId);
          if (cache[walletId] !== undefined) {
            delete cache[walletId];
            await this.saveCardanoCache(info.chainId, cache);
          }
        } else {
          const cache = await this.loadGenericCache(info.chainId);
          if (cache[walletId] !== undefined) {
            delete cache[walletId];
            await this.saveGenericCache(info.chainId, cache);
          }
        }
      }
    } catch (e: unknown) {
      console.error(
        `[AddressCacheManager] Wallet removal from cache failed:`,
        e
      );
      // Continue execution - cache operations are not critical for core functionality
    }
  }

  /**
   * Migrate all caches to encrypted format
   */
  async migrateToEncrypted(): Promise<void> {
    if (!this.password) {
      return;
    }

    try {
      for (const info of this.embedChainInfos) {
        if (info?.features?.includes("cardano")) {
          const chainId = info.chainId;
          const key = this.getCardanoCacheKey(chainId);
          const data = await this.kvStore.get<any>(key);

          if (data && !this.isEncryptedCacheData(data)) {
            const backupKey = `${AddressCacheManager.CARDANO_CACHE_PREFIX}backup_v1:${chainId}`;
            const hasBackup = await this.kvStore.get<any>(backupKey);
            if (!hasBackup) {
              await this.kvStore.set(backupKey, data);
            }
            await this.saveCardanoCache(
              chainId,
              data as Record<string, { address: string; pubKey: string }>
            );
            const loaded = await this.loadCardanoCache(chainId);
            if (
              !this.compareCardanoCaches(
                data as Record<string, { address: string; pubKey: string }>,
                loaded
              )
            ) {
              await this.kvStore.set(key, data);
              await this.kvStore.set(
                `cache_migration_review_needed:${chainId}`,
                true as any
              );
            }
          }
        } else {
          const chainId = info.chainId;
          const key = this.getGenericCacheKey(chainId);
          const data = await this.kvStore.get<any>(key);

          if (data && !this.isEncryptedCacheData(data)) {
            const backupKey = `${AddressCacheManager.GENERIC_CACHE_PREFIX}backup_v1:${chainId}`;
            const hasBackup = await this.kvStore.get<any>(backupKey);
            if (!hasBackup) {
              await this.kvStore.set(backupKey, data);
            }
            await this.saveGenericCache(
              chainId,
              data as Record<string, { address: string; name?: string }>
            );
            const loaded = await this.loadGenericCache(chainId);
            if (
              !this.compareGenericCaches(
                data as Record<string, { address: string; name?: string }>,
                loaded
              )
            ) {
              await this.kvStore.set(key, data);
              await this.kvStore.set(
                `cache_migration_review_needed:${chainId}`,
                true as any
              );
            }
          }
        }
      }
    } catch (e: unknown) {
      console.error(`[AddressCacheManager] Cache migration failed:`, e);
      // Continue execution - migration failure doesn't break core functionality
    }
  }

  private compareCardanoCaches(
    a: Record<string, { address: string; pubKey: string }>,
    b: Record<string, { address: string; pubKey: string }>
  ): boolean {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++)
      if (aKeys[i] !== bKeys[i]) return false;
    for (const id of aKeys) {
      if ((a[id]?.address || "") !== (b[id]?.address || "")) return false;
      if ((a[id]?.pubKey || "") !== (b[id]?.pubKey || "")) return false;
    }
    return true;
  }

  private compareGenericCaches(
    a: Record<string, { address: string; name?: string }>,
    b: Record<string, { address: string; name?: string }>
  ): boolean {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++)
      if (aKeys[i] !== bKeys[i]) return false;
    for (const id of aKeys) {
      if ((a[id]?.address || "") !== (b[id]?.address || "")) return false;
      if ((a[id]?.name || "") !== (b[id]?.name || "")) {
        // Name mismatch is allowed historically
      }
    }
    return true;
  }
}
