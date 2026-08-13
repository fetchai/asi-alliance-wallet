import { KVStore } from "@keplr-wallet/common";
import { CommonCrypto, ScryptPriority } from "./types";
import { Crypto } from "./crypto";
import { Buffer } from "buffer/";

export interface CacheEntry {
  address: string;
  name?: string;
  pubKey?: string;
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

class LockWaitTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockWaitTimeoutError";
  }
}

class CacheDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CacheDecryptionError";
  }
}

/** Scrypt/provider failure that does not prove the stored blob is corrupt. */
class CacheTransientCryptoError extends Error {
  readonly cryptoCause?: unknown;

  constructor(message: string, cryptoCause?: unknown) {
    super(message);
    this.name = "CacheTransientCryptoError";
    this.cryptoCause = cryptoCause;
  }
}

class CacheSessionUnavailableError extends Error {
  constructor(message = "Address-cache password/session is unavailable") {
    super(message);
    this.name = "CacheSessionUnavailableError";
  }
}

class CachePasswordChangedError extends CacheSessionUnavailableError {
  constructor() {
    super("Address-cache password changed while crypto was running");
    this.name = "CachePasswordChangedError";
  }
}

export class AddressCacheManager {
  private static readonly CARDANO_CACHE_PREFIX = "cardano_addr_cache:";
  private static readonly GENERIC_CACHE_PREFIX = "addr_cache:";
  private static readonly ENCRYPTION_FAILURE_PREFIX =
    "cache_encryption_failed:";
  private static readonly CACHE_KDF_SALT_KEY = "address_cache_kdf_salt:v1";
  /** Maximum time a queued operation may wait to acquire a chain lock. */
  private static readonly LOCK_TIMEOUT_MS = 30000;

  private kvStore: KVStore;
  private crypto: CommonCrypto;
  private password?: string;
  private embedChainInfos: any[];
  private cacheCrypto: CommonCrypto;
  private cacheDerivedKeys = new Map<string, Uint8Array>();
  private cacheDerivedKeyFlights = new Map<string, Promise<Uint8Array>>();
  private cacheDerivedKeyGeneration = 0;
  private sharedCacheSaltFlight?: Promise<string>;
  private cacheWriteTails = new Map<string, Promise<void>>();
  private cacheWriteRevisions = new Map<string, number>();
  // Tombstones are safe only because wallet IDs are monotonic and never reused.
  // Keep them for the lifetime of this manager so late writes cannot resurrect
  // a deleted wallet or suppress a future wallet under a recycled ID.
  private deletedWalletIds = new Set<string>();

  // Per-chain locks to prevent race conditions
  private operationLocks: Map<string, Promise<void>> = new Map();

  constructor(config: CacheManagerConfig) {
    this.kvStore = config.kvStore;
    this.crypto = config.crypto;
    this.password = config.password;
    this.embedChainInfos = config.embedChainInfos;
    this.cacheCrypto = {
      rng: (array) => this.crypto.rng(array),
      scrypt: (text, params) => this.deriveCacheKey(text, params),
    };
  }

  private async deriveCacheKey(
    password: string,
    params: Parameters<CommonCrypto["scrypt"]>[1]
  ): Promise<Uint8Array> {
    if (!this.password || password !== this.password) {
      throw new CachePasswordChangedError();
    }

    const cacheKey = [
      params.salt,
      params.dklen,
      params.n,
      params.r,
      params.p,
    ].join(":");
    const generation = this.cacheDerivedKeyGeneration;
    const cached = this.cacheDerivedKeys.get(cacheKey);
    if (cached) {
      return new Uint8Array(cached);
    }

    const existingFlight = this.cacheDerivedKeyFlights.get(cacheKey);
    if (existingFlight) {
      const derivedKey = await existingFlight;
      if (
        generation !== this.cacheDerivedKeyGeneration ||
        password !== this.password
      ) {
        derivedKey.fill(0);
        throw new CachePasswordChangedError();
      }
      return new Uint8Array(derivedKey);
    }

    const flight = this.crypto.scrypt(password, params).then((derivedKey) => {
      const stableKey = new Uint8Array(derivedKey);
      derivedKey.fill(0);
      if (
        generation === this.cacheDerivedKeyGeneration &&
        password === this.password
      ) {
        this.cacheDerivedKeys.set(cacheKey, stableKey);
        return stableKey;
      }
      stableKey.fill(0);
      throw new CachePasswordChangedError();
    });
    this.cacheDerivedKeyFlights.set(cacheKey, flight);

    try {
      const derivedKey = await flight;
      if (
        generation !== this.cacheDerivedKeyGeneration ||
        password !== this.password
      ) {
        derivedKey.fill(0);
        throw new CachePasswordChangedError();
      }
      return new Uint8Array(derivedKey);
    } finally {
      if (this.cacheDerivedKeyFlights.get(cacheKey) === flight) {
        this.cacheDerivedKeyFlights.delete(cacheKey);
      }
    }
  }

  private clearCacheDerivedKeys(): void {
    this.cacheDerivedKeyGeneration += 1;
    for (const derivedKey of this.cacheDerivedKeys.values()) {
      derivedKey.fill(0);
    }
    this.cacheDerivedKeys.clear();
    this.cacheDerivedKeyFlights.clear();
  }

  /**
   * Serialize the final KV commit per cache blob and attach a session revision
   * to it. If the generation changes while storage is awaiting, this commit
   * either yields to an already queued newer revision or clears its own value
   * before releasing the per-key tail.
   *
   * "Stale" here means the write no longer matches the live runtime generation,
   * not that its ciphertext became unreadable: a plain lock also bumps the
   * generation, so a blob that the next unlock could still have decrypted with
   * the same password is dropped too. That is a deliberate fail-closed choice —
   * the cache is derivable state, and the cost is a rebuild after unlock.
   */
  private async commitEncryptedCacheWrite(
    key: string,
    encrypted: string,
    password: string,
    generation: number
  ): Promise<void> {
    const revision = (this.cacheWriteRevisions.get(key) ?? 0) + 1;
    this.cacheWriteRevisions.set(key, revision);
    const previous = this.cacheWriteTails.get(key) ?? Promise.resolve();
    const operation = previous.then(async () => {
      if (
        generation !== this.cacheDerivedKeyGeneration ||
        password !== this.password
      ) {
        throw new CachePasswordChangedError();
      }
      if (this.cacheWriteRevisions.get(key) !== revision) {
        return;
      }

      await this.kvStore.set(key, encrypted);

      if (
        generation !== this.cacheDerivedKeyGeneration ||
        password !== this.password
      ) {
        if (this.cacheWriteRevisions.get(key) === revision) {
          await this.kvStore.set(key, null as any);
        }
        throw new CachePasswordChangedError();
      }
      // A newer same-session write, if any, is queued on this exact tail and
      // will be the final value after this operation releases it.
    });
    const tail = operation.then(
      () => undefined,
      () => undefined
    );
    this.cacheWriteTails.set(key, tail);
    try {
      await operation;
    } finally {
      if (this.cacheWriteTails.get(key) === tail) {
        this.cacheWriteTails.delete(key);
      }
    }
  }

  /**
   * New writes converge on one session-memoizable KDF key. Existing encrypted
   * blobs intentionally keep their embedded salts until their chain is used
   * and normally resaved: eager rewriting would pay the same scrypt cost for
   * every network at unlock, including networks the user never opens.
   */
  private getSharedCacheSalt(): Promise<string> {
    if (!this.sharedCacheSaltFlight) {
      this.sharedCacheSaltFlight = (async () => {
        const stored = await this.kvStore.get<string>(
          AddressCacheManager.CACHE_KDF_SALT_KEY
        );
        if (stored && /^[0-9a-f]{64}$/i.test(stored)) {
          return stored;
        }

        const random = new Uint8Array(32);
        const salt = Buffer.from(await this.crypto.rng(random)).toString("hex");
        await this.kvStore.set(AddressCacheManager.CACHE_KDF_SALT_KEY, salt);
        return salt;
      })().catch((e: unknown) => {
        this.sharedCacheSaltFlight = undefined;
        throw e;
      });
    }
    return this.sharedCacheSaltFlight;
  }

  /**
   * Pay the shared address-cache KDF cost before background cache maintenance
   * can acquire a per-chain lock. The KeyRing schedules this as idle work, and
   * background priority lets a later interactive decrypt pass it while it is
   * still queued. No per-chain lock is held during this KDF.
   */
  async warmSharedDerivedKey(): Promise<void> {
    if (!this.password || typeof this.crypto.scrypt !== "function") {
      return;
    }

    const password = this.password;
    const generation = this.cacheDerivedKeyGeneration;
    const salt = await this.getSharedCacheSalt();
    if (
      generation !== this.cacheDerivedKeyGeneration ||
      password !== this.password
    ) {
      throw new CachePasswordChangedError();
    }
    const derivedKey = await this.deriveCacheKey(password, {
      salt,
      dklen: 32,
      n: 131072,
      r: 8,
      p: 1,
      executionPriority: "background",
    });
    derivedKey.fill(0);

    if (
      generation !== this.cacheDerivedKeyGeneration ||
      password !== this.password
    ) {
      throw new CachePasswordChangedError();
    }
  }

  /**
   * Execute operation with per-chain lock to prevent race conditions.
   */
  private async withLock<T>(
    lockKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const existingLock = this.operationLocks.get(lockKey) || Promise.resolve();
    let cancelled = false;
    let resolveResult!: (value: T | PromiseLike<T>) => void;
    let rejectResult!: (reason?: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    const timeoutId = setTimeout(() => {
      cancelled = true;
      const error = new LockWaitTimeoutError(
        `Lock timeout waiting for ${lockKey} after ${AddressCacheManager.LOCK_TIMEOUT_MS}ms`
      );
      console.warn("[AddressCacheManager] Cache lock wait timed out", {
        lockKey,
        timeoutMs: AddressCacheManager.LOCK_TIMEOUT_MS,
      });
      rejectResult(error);
    }, AddressCacheManager.LOCK_TIMEOUT_MS);
    (
      timeoutId as ReturnType<typeof setTimeout> & { unref?: () => void }
    ).unref?.();

    // Never time out a running operation: promises cannot be cancelled, and
    // releasing the lock while one still mutates storage breaks exclusion.
    // The timeout only cancels this entry while it is waiting for its turn.
    const queuedOperation = existingLock.then(async () => {
      if (cancelled) {
        return;
      }
      clearTimeout(timeoutId);
      try {
        resolveResult(await operation());
      } catch (e: unknown) {
        rejectResult(e);
      }
    });

    const trackedLock = queuedOperation.finally(() => {
      if (this.operationLocks.get(lockKey) === trackedLock) {
        this.operationLocks.delete(lockKey);
      }
    });
    this.operationLocks.set(lockKey, trackedLock);

    return result;
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

  /**
   * Typed transient classifier. Permanent cache corruption is never transient.
   * Scrypt inactivity timeouts are identified by error name because their
   * message ("made no progress for Nms") does not contain "timeout".
   */
  private isTransientError(e: unknown): boolean {
    // Retrying a saturated chain lock only repeats the full wait window and
    // cannot make the operation ahead of us complete any sooner.
    if (e instanceof LockWaitTimeoutError) {
      return false;
    }
    if (e instanceof CacheDecryptionError) {
      return false;
    }
    if (e instanceof CacheSessionUnavailableError) {
      return false;
    }
    if (this.isTransientCryptoFailure(e)) {
      return true;
    }

    // Match the raw message only. formatError may prepend Error.name (e.g.
    // "ScryptInactivityTimeoutError"), which would falsely satisfy /timeout/i
    // and hide a missing typed name-check.
    return /timeout|temporar(y|ily)|network|busy/i.test(this.rawMessage(e));
  }

  private isScryptInactivityTimeoutError(e: unknown): boolean {
    return e instanceof Error && e.name === "ScryptInactivityTimeoutError";
  }

  /** A crypto failure that says nothing about the stored blob's integrity. */
  private isTransientCryptoFailure(e: unknown): boolean {
    return (
      e instanceof CacheTransientCryptoError ||
      this.isScryptInactivityTimeoutError(e)
    );
  }

  /**
   * Re-throwable transient error that keeps the typed class across a wrapper.
   * Callers add their own context message; the original error stays reachable
   * through cryptoCause so a wedged KDF is never mistaken for corruption.
   */
  private toTransientCryptoError(
    e: unknown,
    message?: string
  ): CacheTransientCryptoError {
    if (e instanceof CacheTransientCryptoError && message === undefined) {
      return e;
    }
    return new CacheTransientCryptoError(
      message ?? this.formatError(e),
      e instanceof CacheTransientCryptoError ? e.cryptoCause ?? e : e
    );
  }

  /**
   * Message without the Error.name prefix that formatError adds. Wrapping a
   * transient failure with formatError would embed
   * "ScryptInactivityTimeoutError" into the new message, so the /timeout/i
   * fallback in isTransientError would match by accident and hide a regression
   * in the typed classification.
   */
  private rawMessage(e: unknown): string {
    return e instanceof Error ? e.message : this.formatError(e);
  }

  /**
   * Preserve transient crypto failures as typed errors so callers can retry
   * instead of treating them as blob corruption. Permanent failures become
   * CacheDecryptionError only when the caller requested a hard failure.
   */
  private classifyDecryptFailure(
    e: unknown,
    throwOnDecryptFailure: boolean | undefined
  ): void {
    if (e instanceof CacheSessionUnavailableError) {
      throw e;
    }
    if (this.isTransientCryptoFailure(e)) {
      throw this.toTransientCryptoError(e);
    }
    if (throwOnDecryptFailure) {
      throw new CacheDecryptionError(this.formatError(e));
    }
  }

  /** Format unknown error to string for logs. */
  private formatError(e: unknown): string {
    if (e instanceof Error) {
      return e.name && e.name !== "Error"
        ? `${e.name}: ${e.message}`
        : e.message;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }

  setPassword(password: string): void {
    if (this.password !== password) {
      this.clearCacheDerivedKeys();
    }
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
  private async encryptCacheData(
    data: CacheData,
    priority: ScryptPriority
  ): Promise<string> {
    if (!this.password) {
      throw new Error("Password not set - cannot encrypt cache");
    }

    const password = this.password;
    const generation = this.cacheDerivedKeyGeneration;
    const salt = await this.getSharedCacheSalt();
    if (
      generation !== this.cacheDerivedKeyGeneration ||
      password !== this.password
    ) {
      throw new CachePasswordChangedError();
    }

    const encrypted = await Crypto.encryptBlob(
      this.cacheCrypto,
      "scrypt",
      JSON.stringify(data),
      password,
      { cacheType: "address_cache" },
      {
        priority,
        salt,
      }
    );
    if (
      generation !== this.cacheDerivedKeyGeneration ||
      password !== this.password
    ) {
      throw new CachePasswordChangedError();
    }
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypt cache data
   */
  private async decryptCacheData(
    encryptedData: string,
    priority: ScryptPriority
  ): Promise<CacheData> {
    if (!this.password) {
      throw new CacheSessionUnavailableError(
        "Password not set - cannot decrypt cache"
      );
    }

    const password = this.password;
    const generation = this.cacheDerivedKeyGeneration;

    try {
      const encrypted = JSON.parse(encryptedData);
      const decrypted = await Crypto.decryptBlob(
        this.cacheCrypto,
        encrypted,
        password,
        { priority }
      );
      const plaintext = Buffer.from(decrypted);
      try {
        if (
          generation !== this.cacheDerivedKeyGeneration ||
          password !== this.password
        ) {
          throw new CachePasswordChangedError();
        }
        return JSON.parse(plaintext.toString());
      } finally {
        plaintext.fill(0);
        decrypted.fill(0);
      }
    } catch (e: unknown) {
      if (
        generation !== this.cacheDerivedKeyGeneration ||
        password !== this.password
      ) {
        throw new CachePasswordChangedError();
      }
      if (e instanceof CacheSessionUnavailableError) {
        throw e;
      }
      if (this.isTransientCryptoFailure(e)) {
        throw this.toTransientCryptoError(e);
      }
      throw new Error(`Failed to decrypt cache data: ${this.formatError(e)}`);
    }
  }

  private assertCacheSessionCurrent(
    password: string | undefined,
    generation: number
  ): void {
    if (
      !password ||
      generation !== this.cacheDerivedKeyGeneration ||
      password !== this.password
    ) {
      throw new CacheSessionUnavailableError();
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

  private getEncryptionFailureKey(chainId: string, cacheType: string): string {
    return `${AddressCacheManager.ENCRYPTION_FAILURE_PREFIX}${cacheType}:${chainId}`;
  }

  private filterDeletedWallets<T>(cache: Record<string, T>): Record<string, T> {
    const filtered: Record<string, T> = {};
    for (const [walletId, entry] of Object.entries(cache)) {
      if (!this.deletedWalletIds.has(walletId)) {
        filtered[walletId] = entry;
      }
    }
    return filtered;
  }

  /**
   * Internal: Load Cardano cache without lock
   */
  private async _loadCardanoCacheUnsafe(
    chainId: string,
    options: {
      priority: ScryptPriority;
      throwOnDecryptFailure?: boolean;
    } = { priority: "interactive" }
  ): Promise<Record<string, { address: string; pubKey: string }>> {
    const key = this.getCardanoCacheKey(chainId);
    const data = await this.kvStore.get<
      string | Record<string, { address: string; pubKey: string }>
    >(key);

    if (!data) return {};

    if (this.isEncryptedCacheData(data)) {
      if (!this.password) {
        if (options.throwOnDecryptFailure) {
          throw new CacheSessionUnavailableError(
            "Password not set while removing wallet from encrypted cache"
          );
        }
        return {};
      }

      try {
        const decrypted = await this.decryptCacheData(
          data as string,
          options.priority
        );
        const result: Record<string, { address: string; pubKey: string }> = {};
        for (const [walletId, entry] of Object.entries(decrypted)) {
          result[walletId] = {
            address: entry.address,
            pubKey: entry.pubKey || "",
          };
        }
        return result;
      } catch (e: unknown) {
        this.classifyDecryptFailure(e, options.throwOnDecryptFailure);
        return {};
      }
    }

    if (typeof data === "string") {
      if (options.throwOnDecryptFailure) {
        throw new CacheDecryptionError("Invalid encrypted Cardano cache blob");
      }
      return {};
    }

    return data as Record<string, { address: string; pubKey: string }>;
  }

  /**
   * Load Cardano cache for specific chain
   */
  async loadCardanoCache(
    chainId: string,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<Record<string, { address: string; pubKey: string }>> {
    const priority = options?.scryptPriority ?? "interactive";
    if (priority === "interactive") {
      // KV replaces the encrypted blob atomically, so a read observes either
      // the previous complete blob or the next complete blob. Do not wait for
      // a background writer that may itself be queued behind interactive
      // scrypt work: that would invert priorities before this decrypt can even
      // enter the interactive queue. Background read-modify-write paths keep
      // using the per-chain lock below.
      return this.withRetry(() =>
        this._loadCardanoCacheUnsafe(chainId, { priority })
      );
    }

    return this.withRetry(() =>
      this.withLock(`cardano:${chainId}`, () =>
        this._loadCardanoCacheUnsafe(chainId, {
          priority,
        })
      )
    );
  }

  /**
   * Internal: Save Cardano cache without lock
   */
  private async _saveCardanoCacheUnsafe(
    chainId: string,
    cache: Record<string, { address: string; pubKey: string }>,
    options: { priority: ScryptPriority } = { priority: "background" }
  ): Promise<void> {
    const key = this.getCardanoCacheKey(chainId);
    const failureKey = this.getEncryptionFailureKey(chainId, "cardano");

    if (!this.password) {
      return;
    }
    const password = this.password;
    const generation = this.cacheDerivedKeyGeneration;

    try {
      const cacheData: CacheData = {};
      for (const [walletId, entry] of Object.entries(
        this.filterDeletedWallets(cache)
      )) {
        cacheData[walletId] = {
          address: entry.address,
          pubKey: entry.pubKey,
        };
      }

      const encrypted = await this.encryptCacheData(
        cacheData,
        options.priority
      );
      if (
        generation !== this.cacheDerivedKeyGeneration ||
        password !== this.password
      ) {
        throw new CachePasswordChangedError();
      }
      await this.commitEncryptedCacheWrite(
        key,
        encrypted,
        password,
        generation
      );
      await this.kvStore.set(failureKey, null as any);
    } catch (e: unknown) {
      if (e instanceof CacheSessionUnavailableError) {
        throw e;
      }
      if (this.isTransientCryptoFailure(e)) {
        // A wedged or aborted KDF proves nothing about this blob or about the
        // encryption path, so it must not be recorded as a permanent
        // encryption failure, and the typed class must survive the wrapper so
        // withRetry and the per-chain cleanup handler still see it as
        // transient. The raw message is used deliberately: embedding
        // Error.name here would let the /timeout/i fallback classify it.
        throw this.toTransientCryptoError(
          e,
          `[AddressCacheManager] Transient crypto failure encrypting Cardano cache for ${chainId}: ${this.rawMessage(
            e
          )}`
        );
      }
      const errorMessage = this.formatError(e);
      await this.kvStore.set(failureKey, errorMessage as any);
      throw new Error(
        `[AddressCacheManager] Failed to encrypt Cardano cache for ${chainId}: ${errorMessage}`
      );
    }
  }

  /**
   * Save Cardano cache for specific chain
   */
  async saveCardanoCache(
    chainId: string,
    cache: Record<string, { address: string; pubKey: string }>,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<void> {
    return this.withRetry(() =>
      this.withLock(`cardano:${chainId}`, () =>
        this._saveCardanoCacheUnsafe(chainId, cache, {
          priority: options?.scryptPriority ?? "background",
        })
      )
    );
  }

  /**
   * Internal: Load Generic cache without lock
   */
  private async _loadGenericCacheUnsafe(
    chainId: string,
    options: {
      priority: ScryptPriority;
      throwOnDecryptFailure?: boolean;
    } = { priority: "interactive" }
  ): Promise<
    Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
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
          }
        >
    >(key);

    if (!data) return {};

    if (this.isEncryptedCacheData(data)) {
      if (!this.password) {
        if (options.throwOnDecryptFailure) {
          throw new CacheSessionUnavailableError(
            "Password not set while removing wallet from encrypted cache"
          );
        }
        return {};
      }

      try {
        const decrypted = await this.decryptCacheData(
          data as string,
          options.priority
        );
        const result: Record<
          string,
          {
            address: string;
            name?: string;
            pubKey?: string;
          }
        > = {};
        for (const [walletId, entry] of Object.entries(decrypted)) {
          result[walletId] = {
            address: entry.address,
            name: entry.name,
            pubKey: entry.pubKey,
          };
        }
        return result;
      } catch (e: unknown) {
        this.classifyDecryptFailure(e, options.throwOnDecryptFailure);
        return {};
      }
    }

    if (typeof data === "string") {
      if (options.throwOnDecryptFailure) {
        throw new CacheDecryptionError("Invalid encrypted generic cache blob");
      }
      return {};
    }

    return data as Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
      }
    >;
  }

  /**
   * Load Generic cache for specific chain
   */
  async loadGenericCache(
    chainId: string,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<
    Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
      }
    >
  > {
    const priority = options?.scryptPriority ?? "interactive";
    if (priority === "interactive") {
      // See loadCardanoCache(): interactive immutable reads must be able to
      // enqueue their decrypt even while background cache maintenance owns the
      // write lock. This also covers legacy blobs with per-blob KDF salts,
      // which cannot benefit from warming the new shared salt.
      return this.withRetry(() =>
        this._loadGenericCacheUnsafe(chainId, { priority })
      );
    }

    return this.withRetry(() =>
      this.withLock(`generic:${chainId}`, () =>
        this._loadGenericCacheUnsafe(chainId, {
          priority,
        })
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
      }
    >,
    options: { priority: ScryptPriority } = { priority: "background" }
  ): Promise<void> {
    const key = this.getGenericCacheKey(chainId);
    const failureKey = this.getEncryptionFailureKey(chainId, "generic");

    if (!this.password) {
      return;
    }
    const password = this.password;
    const generation = this.cacheDerivedKeyGeneration;

    try {
      const cacheData: CacheData = {};
      for (const [walletId, entry] of Object.entries(
        this.filterDeletedWallets(cache)
      )) {
        cacheData[walletId] = {
          address: entry.address,
          name: entry.name,
          pubKey: entry.pubKey,
        };
      }

      const encrypted = await this.encryptCacheData(
        cacheData,
        options.priority
      );
      if (
        generation !== this.cacheDerivedKeyGeneration ||
        password !== this.password
      ) {
        throw new CachePasswordChangedError();
      }
      await this.commitEncryptedCacheWrite(
        key,
        encrypted,
        password,
        generation
      );
      await this.kvStore.set(failureKey, null as any);
    } catch (e: unknown) {
      if (e instanceof CacheSessionUnavailableError) {
        throw e;
      }
      if (this.isTransientCryptoFailure(e)) {
        // See _saveCardanoCacheUnsafe: transient KDF failures keep their type,
        // leave the blob and the failure marker untouched, and carry only the
        // raw message so classification stays typed rather than textual.
        throw this.toTransientCryptoError(
          e,
          `[AddressCacheManager] Transient crypto failure encrypting generic cache for ${chainId}: ${this.rawMessage(
            e
          )}`
        );
      }
      const errorMessage = this.formatError(e);
      await this.kvStore.set(failureKey, errorMessage as any);
      throw new Error(
        `[AddressCacheManager] Failed to encrypt generic cache for ${chainId}: ${errorMessage}`
      );
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
      }
    >,
    options?: { scryptPriority?: ScryptPriority }
  ): Promise<void> {
    return this.withRetry(() =>
      this.withLock(`generic:${chainId}`, () =>
        this._saveGenericCacheUnsafe(chainId, cache, {
          priority: options?.scryptPriority ?? "background",
        })
      )
    );
  }

  /**
   * Comprehensive consistency check for cache
   */
  async checkConsistency(
    chainId: string,
    walletIds: string[],
    activeWalletId: string,
    activeWalletAddress: string,
    isCardano: boolean
  ): Promise<ConsistencyCheckResult> {
    return this.withRetry(async () => {
      const issues: string[] = [];

      try {
        const cache = isCardano
          ? await this._loadCardanoCacheUnsafe(chainId, {
              priority: "background",
            })
          : await this._loadGenericCacheUnsafe(chainId, {
              priority: "background",
            });

        const cacheIds = Object.keys(cache);

        const setCacheIds = new Set(cacheIds);

        if (!walletIds.every((id) => setCacheIds.has(id))) {
          issues.push("Missing wallet IDs in cache");
        }

        // Extra IDs are harmless tombstones left by wallet deletion and are
        // pruned the next time this chain cache is rebuilt. Cache names are
        // presentation-only; callers must use current keystore metadata.

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
    });
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
   * Remove wallet from all caches
   */
  async removeWalletFromAllCaches(
    walletId: string,
    options?: { mode?: "selective" | "full-clear" }
  ): Promise<void> {
    if (!walletId) return;

    // Record the deletion before the first await. Any older snapshot that is
    // already in flight will be filtered when it eventually reaches save.
    this.deletedWalletIds.add(walletId);

    if (options?.mode === "full-clear") {
      // No wallet entries can be retained after the last wallet is removed.
      // Delete the complete known blobs without a password or cache crypto.
      await this.clearAllCaches();
      return;
    }

    const cleanupPassword = this.password;
    const cleanupGeneration = this.cacheDerivedKeyGeneration;

    try {
      for (const info of this.embedChainInfos) {
        const isCardano = info?.features?.includes("cardano");
        const lockKey = isCardano
          ? `cardano:${info.chainId}`
          : `generic:${info.chainId}`;

        try {
          await this.withRetry(() =>
            this.withLock(lockKey, async () => {
              this.assertCacheSessionCurrent(
                cleanupPassword,
                cleanupGeneration
              );
              if (isCardano) {
                let cache: Record<string, { address: string; pubKey: string }>;
                try {
                  cache = await this._loadCardanoCacheUnsafe(info.chainId, {
                    priority: "background",
                    throwOnDecryptFailure: true,
                  });
                } catch (e: unknown) {
                  if (!(e instanceof CacheDecryptionError)) {
                    // Transient crypto failures must propagate to withRetry.
                    // Only proven corruption may delete the whole network blob.
                    throw e;
                  }
                  this.assertCacheSessionCurrent(
                    cleanupPassword,
                    cleanupGeneration
                  );
                  // The wallet cannot be removed selectively from an unreadable
                  // encrypted blob with the current password, so delete the
                  // whole cache for privacy.
                  await this.kvStore.set(
                    this.getCardanoCacheKey(info.chainId),
                    null as any
                  );
                  return;
                }
                if (cache[walletId] !== undefined) {
                  this.assertCacheSessionCurrent(
                    cleanupPassword,
                    cleanupGeneration
                  );
                  delete cache[walletId];
                  await this._saveCardanoCacheUnsafe(info.chainId, cache);
                }
                return;
              }

              let cache: Record<
                string,
                { address: string; name?: string; pubKey?: string }
              >;
              try {
                cache = await this._loadGenericCacheUnsafe(info.chainId, {
                  priority: "background",
                  throwOnDecryptFailure: true,
                });
              } catch (e: unknown) {
                if (!(e instanceof CacheDecryptionError)) {
                  // Transient crypto failures must propagate to withRetry.
                  // Only proven corruption may delete the whole network blob.
                  throw e;
                }
                this.assertCacheSessionCurrent(
                  cleanupPassword,
                  cleanupGeneration
                );
                await this.kvStore.set(
                  this.getGenericCacheKey(info.chainId),
                  null as any
                );
                return;
              }
              if (cache[walletId] !== undefined) {
                this.assertCacheSessionCurrent(
                  cleanupPassword,
                  cleanupGeneration
                );
                delete cache[walletId];
                await this._saveGenericCacheUnsafe(info.chainId, cache);
              }
            })
          );
        } catch (e: unknown) {
          if (e instanceof CacheSessionUnavailableError) {
            return;
          }
          if (this.isTransientCryptoFailure(e)) {
            // Exhausted retry for this chain: keep the blob (not corruption)
            // and continue so one wedged KDF cannot skip remaining networks.
            // In-memory tombstone still filters the deleted wallet on later saves.
            console.error(
              `[AddressCacheManager] Transient cache cleanup failure for ${info.chainId}; keeping blob`,
              e instanceof Error ? e.name : e
            );
            continue;
          }
          throw e;
        }
      }
    } catch (e: unknown) {
      if (e instanceof CacheSessionUnavailableError) {
        return;
      }
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
        const isCardano = info?.features?.includes("cardano");
        const chainId = info.chainId;
        const lockKey = isCardano ? `cardano:${chainId}` : `generic:${chainId}`;

        await this.withRetry(() =>
          this.withLock(lockKey, async () => {
            if (isCardano) {
              const key = this.getCardanoCacheKey(chainId);
              const data = await this.kvStore.get<any>(key);

              if (
                data &&
                typeof data !== "string" &&
                !this.isEncryptedCacheData(data)
              ) {
                const plainCache = data as Record<
                  string,
                  { address: string; pubKey: string }
                >;
                const expectedCache = this.filterDeletedWallets(plainCache);
                await this._saveCardanoCacheUnsafe(chainId, plainCache);
                const loaded = await this._loadCardanoCacheUnsafe(chainId, {
                  priority: "background",
                });
                if (!this.compareCardanoCaches(expectedCache, loaded)) {
                  await this.kvStore.set(
                    `cache_migration_review_needed:${chainId}`,
                    true as any
                  );
                  throw new Error(
                    `Cardano cache migration validation failed for ${chainId}`
                  );
                }
              }
              return;
            }

            const key = this.getGenericCacheKey(chainId);
            const data = await this.kvStore.get<any>(key);

            if (
              data &&
              typeof data !== "string" &&
              !this.isEncryptedCacheData(data)
            ) {
              const plainCache = data as Record<
                string,
                {
                  address: string;
                  name?: string;
                  pubKey?: string;
                }
              >;
              const expectedCache = this.filterDeletedWallets(plainCache);
              await this._saveGenericCacheUnsafe(chainId, plainCache);
              const loaded = await this._loadGenericCacheUnsafe(chainId, {
                priority: "background",
              });
              if (!this.compareGenericCaches(expectedCache, loaded)) {
                await this.kvStore.set(
                  `cache_migration_review_needed:${chainId}`,
                  true as any
                );
                throw new Error(
                  `Generic cache migration validation failed for ${chainId}`
                );
              }
            }
          })
        );
      }
    } catch (e: unknown) {
      console.error(`[AddressCacheManager] Cache migration failed:`, e);
      throw e;
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
    a: Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
      }
    >,
    b: Record<
      string,
      {
        address: string;
        name?: string;
        pubKey?: string;
      }
    >
  ): boolean {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++)
      if (aKeys[i] !== bKeys[i]) return false;
    for (const id of aKeys) {
      if ((a[id]?.address || "") !== (b[id]?.address || "")) return false;
      if ((a[id]?.pubKey || "") !== (b[id]?.pubKey || "")) return false;
      if ((a[id]?.name || "") !== (b[id]?.name || "")) {
        // Name mismatch is allowed historically
      }
    }
    return true;
  }
}
