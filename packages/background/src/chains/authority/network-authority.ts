import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { ChainInfoWithRepoUpdateOptions } from "../types";
import { FifoCommandQueue } from "./command-queue";
import {
  NetworkAuthorityCommitObserver,
  NetworkAuthorityDeps,
  NetworkAuthoritySnapshot,
} from "./types";

/**
 * Selected-chain authority: durable `{ chainId, revision }` with a FIFO commit
 * queue. Queries never write. Registry add/remove commits share the same queue.
 * Removing the currently selected chain is rejected.
 */
export class NetworkAuthority {
  static readonly SNAPSHOT_KV_KEY = "network_authority_snapshot";

  private snapshot: NetworkAuthoritySnapshot | undefined;
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;
  private readonly queue = new FifoCommandQueue();
  private opaqueEventSeq = 0;
  private readonly observers = new Set<NetworkAuthorityCommitObserver>();

  constructor(private readonly deps: NetworkAuthorityDeps) {}

  isHydrated(): boolean {
    return this.hydrated;
  }

  subscribe(observer: NetworkAuthorityCommitObserver): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }

  /**
   * Load or create the durable snapshot. Does not mark ready if the store
   * cannot be read or repaired.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated) {
      return;
    }
    if (this.hydratePromise) {
      return this.hydratePromise;
    }

    this.hydratePromise = this.runHydrate().finally(() => {
      this.hydratePromise = null;
    });
    return this.hydratePromise;
  }

  /** Returns the in-memory snapshot. Does not persist, repair, or publish. */
  async getSnapshot(): Promise<NetworkAuthoritySnapshot> {
    await this.ensureHydrated();
    if (!this.snapshot) {
      throw new Error("NetworkAuthority has no snapshot after hydration");
    }
    return { ...this.snapshot };
  }

  async getSelectedChainId(): Promise<string> {
    return (await this.getSnapshot()).chainId;
  }

  /**
   * Run a read under the same FIFO as select/add/remove so registry and
   * selection cannot tear relative to concurrent commits.
   */
  runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(async () => {
      await this.ensureHydrated();
      return operation();
    });
  }

  /** Current in-memory snapshot; caller must be inside runSerialized/hydrate. */
  getCommittedSnapshotUnchecked(): NetworkAuthoritySnapshot {
    if (!this.snapshot) {
      throw new Error("NetworkAuthority has no snapshot");
    }
    return { ...this.snapshot };
  }

  /**
   * Publish surfaces invalidation for the current snapshot without bumping
   * revision (registry-only mutations / endpoint updates).
   */
  async publishProjectionInvalidation(): Promise<void> {
    await this.ensureHydrated();
    await this.publishProjectionInvalidationUnlocked();
  }

  select(chainId: string): Promise<NetworkAuthoritySnapshot> {
    return this.queue.enqueue(async () => {
      await this.ensureHydrated();
      return this.commitSelect(chainId);
    });
  }

  /**
   * Rewrite selection.chainId to the registry's exact canonical string when the
   * committed selection still names the same chain identity. No-op if the user
   * has already switched to a different identity (avoids racing tryUpdate vs
   * user select).
   */
  alignSelectedCanonicalIfCurrent(
    canonicalChainId: string
  ): Promise<NetworkAuthoritySnapshot | null> {
    return this.queue.enqueue(async () => {
      await this.ensureHydrated();
      return this.commitAlignSelectedCanonicalIfCurrent(canonicalChainId);
    });
  }

  commitAddChain(chainInfo: ChainInfoWithRepoUpdateOptions): Promise<void> {
    return this.queue.enqueue(async () => {
      await this.ensureHydrated();
      await this.deps.registry.commitAddChain(chainInfo);
      await this.publishProjectionInvalidationUnlocked();
    });
  }

  /**
   * Removes a registered chain. Fails if it is the committed selection —
   * registry and authority are separate KV records with no joint transaction.
   */
  commitRemoveChain(chainId: string): Promise<void> {
    return this.queue.enqueue(async () => {
      await this.ensureHydrated();
      await this.commitRemove(chainId);
      await this.publishProjectionInvalidationUnlocked();
    });
  }

  private async publishProjectionInvalidationUnlocked(): Promise<void> {
    if (!this.snapshot) {
      return;
    }
    try {
      this.deps.publisher?.publishInternalSurfacesSync?.({ ...this.snapshot });
    } catch (error) {
      console.warn(
        "[NetworkAuthority] projection invalidation publish failed:",
        error
      );
    }
  }

  private async ensureHydrated(): Promise<void> {
    if (!this.hydrated) {
      await this.hydrate();
    }
    if (!this.hydrated) {
      throw new Error("NetworkAuthority hydration failed");
    }
  }

  private async runHydrate(): Promise<void> {
    let storedRaw: unknown;
    try {
      storedRaw = await this.deps.kvStore.get(NetworkAuthority.SNAPSHOT_KV_KEY);
    } catch (error) {
      throw new Error(
        `NetworkAuthority hydration failed reading snapshot: ${String(error)}`
      );
    }

    const chainInfos = await this.deps.registry.getChainInfos();

    // Absent key → one-shot legacy migration. Present but invalid → fail-closed.
    if (storedRaw === undefined || storedRaw === null) {
      await this.hydrateFromLegacyOrFallback(chainInfos);
      this.hydrated = true;
      return;
    }

    const stored = this.requireValidStoredSnapshot(storedRaw);

    const canonical = await this.deps.registry.findCanonicalChainId(
      stored.chainId
    );
    if (!canonical) {
      const fallback = await this.requireFallback(chainInfos);
      await this.persistAndCommitMemory(
        {
          chainId: fallback,
          revision: this.nextRevision(stored.revision),
        },
        undefined,
        { publish: true, notifyObservers: true }
      );
      this.hydrated = true;
      return;
    }

    if (canonical === stored.chainId) {
      this.snapshot = {
        chainId: canonical,
        revision: stored.revision,
      };
      this.hydrated = true;
      return;
    }

    // Same identity, different canonical string — durable repair so revision
    // never names two chainIds across memory and KV.
    await this.persistAndCommitMemory(
      {
        chainId: canonical,
        revision: this.nextRevision(stored.revision),
      },
      { chainId: stored.chainId, revision: stored.revision },
      { publish: true, notifyObservers: true }
    );
    this.hydrated = true;
  }

  private async hydrateFromLegacyOrFallback(
    chainInfos: Array<{ chainId: string; features?: string[] }>
  ): Promise<void> {
    const legacy = await this.deps.readLegacyLastViewChainId();
    let chainId: string | undefined;
    if (legacy) {
      chainId = await this.deps.registry.findCanonicalChainId(legacy);
    }
    if (!chainId) {
      chainId = await this.requireFallback(chainInfos);
    }

    await this.persistAndCommitMemory({ chainId, revision: 1 }, undefined, {
      publish: false,
      notifyObservers: false,
    });
  }

  private async commitSelect(
    chainId: string
  ): Promise<NetworkAuthoritySnapshot> {
    const canonical = await this.deps.registry.findCanonicalChainId(chainId);
    if (!canonical) {
      throw new Error(`There is no chain info for ${chainId}`);
    }

    const current = this.snapshot;
    if (current && current.chainId === canonical) {
      return { ...current };
    }

    const previous = current ? { ...current } : undefined;
    const next: NetworkAuthoritySnapshot = {
      chainId: canonical,
      revision: this.nextRevision(current?.revision ?? 0),
    };

    await this.persistAndCommitMemory(next, previous, {
      publish: true,
      notifyObservers: true,
    });
    return { ...next };
  }

  private async commitAlignSelectedCanonicalIfCurrent(
    canonicalChainId: string
  ): Promise<NetworkAuthoritySnapshot | null> {
    const current = this.snapshot;
    if (!current) {
      throw new Error("NetworkAuthority has no snapshot");
    }

    const canonical = await this.deps.registry.findCanonicalChainId(
      canonicalChainId
    );
    if (!canonical) {
      return null;
    }

    if (!this.sameChainIdentity(current.chainId, canonical)) {
      return null;
    }

    if (current.chainId === canonical) {
      return { ...current };
    }

    const previous = { ...current };
    const next: NetworkAuthoritySnapshot = {
      chainId: canonical,
      revision: this.nextRevision(current.revision),
    };

    await this.persistAndCommitMemory(next, previous, {
      publish: true,
      notifyObservers: true,
    });
    return { ...next };
  }

  private async commitRemove(chainId: string): Promise<void> {
    const current = this.snapshot;
    if (!current) {
      throw new Error("NetworkAuthority has no snapshot");
    }

    if (this.sameChainIdentity(current.chainId, chainId)) {
      throw new Error(
        "Can't remove the currently selected network; select another chain first"
      );
    }

    const canonical = await this.deps.registry.findCanonicalChainId(chainId);
    if (!canonical) {
      throw new Error("Chain is not registered");
    }

    await this.deps.registry.commitRemoveChain(canonical);
  }

  private async persistAndCommitMemory(
    next: NetworkAuthoritySnapshot,
    previous: NetworkAuthoritySnapshot | undefined,
    options: { publish: boolean; notifyObservers: boolean }
  ): Promise<void> {
    await this.deps.kvStore.set(NetworkAuthority.SNAPSHOT_KV_KEY, next);

    this.snapshot = { ...next };

    if (options.notifyObservers) {
      for (const observer of this.observers) {
        try {
          observer({ ...next }, previous);
        } catch (error) {
          console.warn(
            "[NetworkAuthority] commit observer failed after commit:",
            error
          );
        }
      }
    }

    if (options.publish) {
      try {
        this.deps.publisher?.publishInternalSurfacesSync?.({ ...next });
      } catch (error) {
        console.warn(
          "[NetworkAuthority] internal surfaces publish failed after commit:",
          error
        );
      }

      this.opaqueEventSeq += 1;
      try {
        this.deps.publisher?.publishWebpageNetworkChanged?.(
          this.opaqueEventSeq
        );
      } catch (error) {
        console.warn(
          "[NetworkAuthority] webpage network-changed publish failed after commit:",
          error
        );
      }
    }
  }

  private requireValidStoredSnapshot(raw: unknown): NetworkAuthoritySnapshot {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("NetworkAuthority durable snapshot has invalid type");
    }
    const record = raw as { chainId?: unknown; revision?: unknown };
    if (typeof record.chainId !== "string" || record.chainId.length === 0) {
      throw new Error("NetworkAuthority durable snapshot has invalid chainId");
    }
    if (
      typeof record.revision !== "number" ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 1
    ) {
      throw new Error("NetworkAuthority durable snapshot has invalid revision");
    }
    return { chainId: record.chainId, revision: record.revision };
  }

  private nextRevision(current: number): number {
    // Hydrate seed uses revision 1 from 0; commits use current >= 1.
    if (current === 0) {
      return 1;
    }
    if (!Number.isSafeInteger(current) || current < 1) {
      throw new Error(
        "NetworkAuthority revision is not a safe positive integer"
      );
    }
    if (current >= Number.MAX_SAFE_INTEGER) {
      throw new Error("NetworkAuthority revision overflow");
    }
    return current + 1;
  }

  private async requireFallback(
    chainInfos: Array<{ chainId: string; features?: string[] }>
  ): Promise<string> {
    const fallback = this.deps.resolveFallbackChainId(chainInfos);
    if (!fallback) {
      throw new Error("No chain infos available");
    }
    const canonical = await this.deps.registry.findCanonicalChainId(fallback);
    if (!canonical) {
      throw new Error(`Fallback chain is not registered: ${fallback}`);
    }
    return canonical;
  }

  private sameChainIdentity(a: string, b: string): boolean {
    try {
      return (
        ChainIdHelper.parse(a).identifier === ChainIdHelper.parse(b).identifier
      );
    } catch {
      return a === b;
    }
  }
}
