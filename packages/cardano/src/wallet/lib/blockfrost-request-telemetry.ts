import { Logger } from "ts-log";
import { BlockfrostClient } from "@cardano-sdk/cardano-services-client";
import {
  isBlockfrostRateLimitError,
  isBlockfrostRateLimitHttpStatus,
} from "../../adapters/blockfrost-error-classifier";
import {
  CardanoRuntimeInactiveError,
  isCardanoRuntimeInactiveError,
  type CardanoRuntimeLease,
} from "../../runtime-lease";

const SLOW_REQUEST_MS = 1000;
const MAX_FAILURES_TO_KEEP = 50;
const MAX_RECENT_REQUESTS_TO_KEEP = 300;
/** Bounded ring of disposed runtimes (dev/test diagnosis; prod uses same bound). */
const MAX_DISPOSED_RUNTIMES_TO_KEEP = 20;
/** Terminal disposed records older than this are pruned on access. */
const DISPOSED_RUNTIME_TTL_MS = 5 * 60 * 1000;

export type CardanoRuntimeCreatedBy =
  | "getKey"
  | "networkSwitch"
  | "syncStatus"
  | "listAccounts"
  | "restore"
  | "unknown";

export type CardanoRuntimeLifecycleEvent =
  | "manager.create.started"
  | "manager.create.completed"
  | "manager.attached"
  | "manager.replaced"
  | "manager.detached"
  | "manager.dispose.started"
  | "manager.dispose.completed"
  | "blockfrost.request"
  | "blockfrost.request_after_dispose"
  | "blockfrost.request_blocked_inactive_runtime";

type RequestKind =
  | "address_discovery"
  | "chain_history"
  | "network"
  | "pool"
  | "rewards"
  | "submit_tx"
  | "tx"
  | "utxo"
  | "other";

interface StatsBucket {
  avgMs: number;
  count: number;
  errorCount: number;
  maxMs: number;
  okCount: number;
  totalMs: number;
}

interface FailureRecord {
  callerTag: string;
  endpoint: string;
  kind: RequestKind;
  ms: number;
  sourceTag: string;
  status: number | "unknown" | "ok";
  timestamp: number;
}

const resolveFailureStatus = (error: unknown): FailureRecord["status"] => {
  const direct = (error as { status?: unknown })?.status;
  if (typeof direct === "number") {
    return direct;
  }
  const nested = (error as { response?: { status?: unknown } })?.response
    ?.status;
  if (typeof nested === "number") {
    return nested;
  }
  if (isBlockfrostRateLimitError(error)) {
    return 402;
  }
  return "unknown";
};

interface RequestRecord {
  callerTag: string;
  endpoint: string;
  kind: RequestKind;
  ms: number;
  sourceTag: string;
  status: number | "unknown" | "ok";
  timestamp: number;
}

export interface AggregatedStats {
  attached?: boolean;
  byCallerTag: Record<string, StatsBucket>;
  byEndpoint: Record<string, StatsBucket>;
  byKind: Record<RequestKind, StatsBucket>;
  bySourceTag: Record<string, StatsBucket>;
  chainId?: string;
  chainName: string;
  createdBy?: CardanoRuntimeCreatedBy;
  disposed?: boolean;
  failures: FailureRecord[];
  ownerSwitchGeneration?: number;
  recentRequests: RequestRecord[];
  registryKey?: string;
  runtimeGeneration?: number;
  runtimeInstanceId?: string;
  selectedChainIdAtCreate?: string;
  startedAt: number;
  totals: StatsBucket;
}

export interface CardanoRuntimeTelemetryMeta {
  chainId?: string;
  chainName: string;
  createdBy?: CardanoRuntimeCreatedBy;
  getSelectedChainId?: () => string | undefined;
  ownerSwitchGeneration?: number;
  runtimeGeneration?: number;
  runtimeInstanceId: string;
  runtimeLease?: CardanoRuntimeLease;
  selectedChainIdAtCreate?: string;
}

interface TelemetryGlobalApi {
  getActiveRuntimes: () => AggregatedStats[];
  getAllSnapshots: () => Record<string, AggregatedStats>;
  getDisposedRuntimes: () => AggregatedStats[];
  getRequestCountsByType: () => Record<string, Record<RequestKind, number>>;
  captureBaseline: (label: string) => Record<string, AggregatedStats>;
  getBaselines: () => Record<string, Record<string, AggregatedStats>>;
  printAll: () => Record<string, AggregatedStats>;
  printRequestCountsByType: () => Record<string, Record<RequestKind, number>>;
  reset: () => void;
}

interface TelemetryCollector {
  getSnapshot: () => AggregatedStats;
  markAttached: () => void;
  markDetached: () => void;
  markDisposed: () => void;
  reset: () => void;
  setLifecycleFlags: (flags: { attached: boolean; disposed: boolean }) => void;
}

type RuntimeTelemetryEntry = {
  attached: boolean;
  chainId?: string;
  chainName: string;
  collector: TelemetryCollector;
  createdBy?: CardanoRuntimeCreatedBy;
  disposed: boolean;
  disposedAt?: number;
  getSelectedChainId?: () => string | undefined;
  ownerSwitchGeneration?: number;
  registryKey: string;
  runtimeGeneration?: number;
  runtimeInstanceId: string;
  selectedChainIdAtCreate?: string;
};

type TelemetryStore = {
  active: Map<string, RuntimeTelemetryEntry>;
  disposed: RuntimeTelemetryEntry[];
};

const createBucket = (): StatsBucket => ({
  avgMs: 0,
  count: 0,
  errorCount: 0,
  maxMs: 0,
  okCount: 0,
  totalMs: 0,
});

const updateBucket = (bucket: StatsBucket, ok: boolean, ms: number) => {
  bucket.count += 1;
  bucket.totalMs += ms;
  bucket.avgMs = Math.round(bucket.totalMs / bucket.count);
  bucket.maxMs = Math.max(bucket.maxMs, ms);
  if (ok) bucket.okCount += 1;
  else bucket.errorCount += 1;
};

const toStatsRecord = (
  map: Map<string, StatsBucket>
): Record<string, StatsBucket> => Object.fromEntries(map.entries());

const toKindCounts = (
  byKind: Record<RequestKind, StatsBucket>
): Record<RequestKind, number> => ({
  address_discovery: byKind.address_discovery.count,
  chain_history: byKind.chain_history.count,
  network: byKind.network.count,
  pool: byKind.pool.count,
  rewards: byKind.rewards.count,
  submit_tx: byKind.submit_tx.count,
  tx: byKind.tx.count,
  utxo: byKind.utxo.count,
  other: byKind.other.count,
});

const getRequestKind = (endpoint: string): RequestKind => {
  if (endpoint.startsWith("accounts/") && endpoint.includes("/addresses"))
    return "address_discovery";
  if (endpoint.startsWith("accounts/")) return "rewards";
  if (endpoint.startsWith("addresses/") && endpoint.includes("/utxos"))
    return "utxo";
  if (
    endpoint.startsWith("addresses/") &&
    (endpoint.includes("/transactions") || endpoint.includes("/txs"))
  )
    return "chain_history";
  if (endpoint.startsWith("addresses/")) return "other";
  if (endpoint.startsWith("tx/submit")) return "submit_tx";
  if (endpoint.startsWith("txs/")) return "tx";
  if (endpoint.startsWith("epochs/") || endpoint.startsWith("blocks/"))
    return "chain_history";
  if (endpoint.startsWith("network")) return "network";
  if (endpoint.startsWith("pools/")) return "pool";
  if (endpoint.startsWith("rewards/")) return "rewards";
  return "other";
};

const normalizeEndpoint = (endpoint: string): string => {
  const [path, queryString] = endpoint.split("?");
  const normalizedPath = path
    .split("/")
    .map((part) => {
      if (/^\d+$/.test(part)) return ":n";
      if (/^[a-f0-9]{24,}$/i.test(part)) return ":id";
      if (/^[a-z0-9]{24,}$/i.test(part)) return ":id";
      return part;
    })
    .join("/");

  if (!queryString) return normalizedPath;
  const query = new URLSearchParams(queryString);
  if (query.has("count")) query.set("count", ":n");
  if (query.has("page")) query.set("page", ":n");
  const serialized = query.toString();
  return serialized ? `${normalizedPath}?${serialized}` : normalizedPath;
};

const getCallerTag = (): string => {
  const stack = new Error().stack;
  if (!stack) return "unknown";
  const lines = stack.split("\n");

  for (const line of lines) {
    if (!line.includes("packages/")) continue;
    if (line.includes("blockfrost-request-telemetry")) continue;
    const match = line.match(/packages\/([^)\s]+):\d+:\d+/);
    if (match?.[1]) return match[1];
  }

  return "unknown";
};

const storeGlobalKey = "__cardanoBlockfrostTelemetryStore";
const baselineGlobalKey = "__cardanoBlockfrostTelemetryBaselines";
const apiGlobalKey = "__cardanoBlockfrostTelemetry";

/** Dev/test default on; production requires CARDANO_RUNTIME_TELEMETRY=1. */
export const isCardanoRuntimeTelemetryDebugEnabled = (): boolean => {
  if (process.env["CARDANO_RUNTIME_TELEMETRY"] === "1") {
    return true;
  }
  if (process.env["CARDANO_RUNTIME_TELEMETRY"] === "0") {
    return false;
  }
  return process.env["NODE_ENV"] !== "production";
};

export const createRuntimeInstanceId = (): string =>
  `cad_rt_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;

export const toRuntimeRegistryKey = (
  chainName: string,
  runtimeInstanceId: string
): string => `${chainName}::${runtimeInstanceId}`;

const getStore = (): TelemetryStore => {
  const globalScope = globalThis as Record<string, unknown>;
  if (!globalScope[storeGlobalKey]) {
    globalScope[storeGlobalKey] = {
      active: new Map<string, RuntimeTelemetryEntry>(),
      disposed: [],
    } satisfies TelemetryStore;
  }
  return globalScope[storeGlobalKey] as TelemetryStore;
};

const getBaselinesStore = (): Map<string, Record<string, AggregatedStats>> => {
  const globalScope = globalThis as Record<string, unknown>;
  if (!globalScope[baselineGlobalKey]) {
    globalScope[baselineGlobalKey] = new Map<
      string,
      Record<string, AggregatedStats>
    >();
  }
  return globalScope[baselineGlobalKey] as Map<
    string,
    Record<string, AggregatedStats>
  >;
};

const pruneDisposed = (store: TelemetryStore, now = Date.now()): void => {
  store.disposed = store.disposed.filter(
    (entry) =>
      entry.disposedAt == null ||
      now - entry.disposedAt <= DISPOSED_RUNTIME_TTL_MS
  );
  while (store.disposed.length > MAX_DISPOSED_RUNTIMES_TO_KEEP) {
    store.disposed.shift();
  }
};

const emitLifecycle = (
  event: CardanoRuntimeLifecycleEvent,
  payload: Record<string, unknown>,
  logger?: Logger
) => {
  if (!isCardanoRuntimeTelemetryDebugEnabled()) {
    return;
  }
  const log = logger?.debug?.bind(logger) ?? console.debug;
  log(`[Cardano runtime telemetry] ${event}`, payload);
};

// Telemetry snapshots are JSON-only by design (no BigInt/Map/Date/functions).
const cloneSnapshot = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const listEntriesForChain = (chainName: string): RuntimeTelemetryEntry[] => {
  const store = getStore();
  pruneDisposed(store);
  const matches = (entry: RuntimeTelemetryEntry) =>
    entry.chainName === chainName;
  return [
    ...[...store.active.values()].filter(matches),
    ...store.disposed.filter(matches),
  ];
};

const moveToDisposed = (entry: RuntimeTelemetryEntry): void => {
  const store = getStore();
  store.active.delete(entry.registryKey);
  entry.disposed = true;
  entry.attached = false;
  entry.disposedAt = Date.now();
  entry.collector.setLifecycleFlags({ attached: false, disposed: true });
  store.disposed.push(entry);
  pruneDisposed(store);
};

export const recordCardanoRuntimeLifecycle = (
  event: CardanoRuntimeLifecycleEvent,
  payload: {
    chainId?: string;
    chainName?: string;
    createdBy?: CardanoRuntimeCreatedBy;
    logger?: Logger;
    ownerSwitchGeneration?: number;
    runtimeGeneration?: number;
    runtimeInstanceId: string;
    selectedChainId?: string;
  }
): void => {
  emitLifecycle(
    event,
    {
      chainId: payload.chainId,
      chainName: payload.chainName,
      createdBy: payload.createdBy,
      ownerSwitchGeneration: payload.ownerSwitchGeneration,
      runtimeGeneration: payload.runtimeGeneration,
      runtimeInstanceId: payload.runtimeInstanceId,
      selectedChainId: payload.selectedChainId,
    },
    payload.logger
  );
};

export const markCardanoRuntimeAttached = (
  runtimeInstanceId: string,
  options?: { logger?: Logger; replacedInstanceId?: string }
): void => {
  const store = getStore();
  for (const entry of store.active.values()) {
    if (entry.runtimeInstanceId !== runtimeInstanceId) {
      continue;
    }
    entry.attached = true;
    entry.collector.setLifecycleFlags({
      attached: true,
      disposed: entry.disposed,
    });
    if (options?.replacedInstanceId) {
      recordCardanoRuntimeLifecycle("manager.replaced", {
        logger: options?.logger,
        runtimeInstanceId,
        chainName: entry.chainName,
        chainId: entry.chainId,
      });
    }
    recordCardanoRuntimeLifecycle("manager.attached", {
      logger: options?.logger,
      runtimeInstanceId,
      chainName: entry.chainName,
      chainId: entry.chainId,
      createdBy: entry.createdBy,
      runtimeGeneration: entry.runtimeGeneration,
      ownerSwitchGeneration: entry.ownerSwitchGeneration,
    });
    return;
  }
};

export const markCardanoRuntimeDetached = (
  runtimeInstanceId: string,
  options?: { logger?: Logger }
): void => {
  const store = getStore();
  for (const entry of store.active.values()) {
    if (entry.runtimeInstanceId !== runtimeInstanceId) {
      continue;
    }
    entry.attached = false;
    entry.collector.setLifecycleFlags({
      attached: false,
      disposed: entry.disposed,
    });
    recordCardanoRuntimeLifecycle("manager.detached", {
      logger: options?.logger,
      runtimeInstanceId,
      chainName: entry.chainName,
      chainId: entry.chainId,
    });
    return;
  }
};

export const markCardanoRuntimeDisposed = (
  runtimeInstanceId: string,
  options?: { logger?: Logger }
): void => {
  const store = getStore();
  const entry = [...store.active.values()].find(
    (item) => item.runtimeInstanceId === runtimeInstanceId
  );
  if (!entry) {
    return;
  }
  recordCardanoRuntimeLifecycle("manager.dispose.started", {
    logger: options?.logger,
    runtimeInstanceId,
    chainName: entry.chainName,
    chainId: entry.chainId,
  });
  moveToDisposed(entry);
  recordCardanoRuntimeLifecycle("manager.dispose.completed", {
    logger: options?.logger,
    runtimeInstanceId,
    chainName: entry.chainName,
    chainId: entry.chainId,
  });
};

export const installBlockfrostRequestTelemetry = ({
  blockfrostClient,
  chainName,
  logger,
  runtimeInstanceId: runtimeInstanceIdInput,
  runtimeGeneration,
  ownerSwitchGeneration,
  chainId,
  createdBy,
  selectedChainIdAtCreate,
  getSelectedChainId,
  runtimeLease,
}: {
  blockfrostClient: BlockfrostClient;
  chainName: string;
  logger: Logger;
} & Partial<Omit<CardanoRuntimeTelemetryMeta, "chainName">>) => {
  const runtimeInstanceId = runtimeInstanceIdInput ?? createRuntimeInstanceId();
  const registryKey = toRuntimeRegistryKey(chainName, runtimeInstanceId);

  const clientWithPatchedRequest = blockfrostClient as BlockfrostClient & {
    __telemetryPatched?: boolean;
    __telemetryRequest?: <T>(
      endpoint: string,
      sourceTag: string,
      ...args: unknown[]
    ) => Promise<T>;
    __telemetrySnapshot?: () => AggregatedStats;
    __telemetryRuntimeInstanceId?: string;
    request: <T>(endpoint: string, ...args: unknown[]) => Promise<T>;
  };
  if (clientWithPatchedRequest.__telemetryPatched) {
    return runtimeInstanceId;
  }

  let attached = false;
  let disposed = false;
  let startedAt = Date.now();
  let totals = createBucket();
  let byEndpoint = new Map<string, StatsBucket>();
  let byKind = new Map<RequestKind, StatsBucket>();
  let byCallerTag = new Map<string, StatsBucket>();
  let bySourceTag = new Map<string, StatsBucket>();
  let failures: FailureRecord[] = [];
  let recentRequests: RequestRecord[] = [];

  const rawRequest = clientWithPatchedRequest.request.bind(blockfrostClient);

  const trackRequest = (
    payload: Omit<RequestRecord, "timestamp"> & { timestamp?: number }
  ) => {
    recentRequests.push({
      ...payload,
      timestamp: payload.timestamp || Date.now(),
    });
    if (recentRequests.length > MAX_RECENT_REQUESTS_TO_KEEP) {
      recentRequests.shift();
    }
  };

  const buildSnapshot = (): AggregatedStats => ({
    attached,
    byCallerTag: toStatsRecord(byCallerTag),
    byEndpoint: toStatsRecord(byEndpoint),
    byKind: {
      address_discovery: byKind.get("address_discovery") || createBucket(),
      chain_history: byKind.get("chain_history") || createBucket(),
      network: byKind.get("network") || createBucket(),
      pool: byKind.get("pool") || createBucket(),
      rewards: byKind.get("rewards") || createBucket(),
      submit_tx: byKind.get("submit_tx") || createBucket(),
      tx: byKind.get("tx") || createBucket(),
      utxo: byKind.get("utxo") || createBucket(),
      other: byKind.get("other") || createBucket(),
    },
    bySourceTag: toStatsRecord(bySourceTag),
    chainId,
    chainName,
    createdBy,
    disposed,
    failures: [...failures],
    ownerSwitchGeneration,
    recentRequests: [...recentRequests],
    registryKey,
    runtimeGeneration,
    runtimeInstanceId,
    selectedChainIdAtCreate,
    startedAt,
    totals: { ...totals },
  });

  clientWithPatchedRequest.__telemetryRequest = async <T>(
    endpoint: string,
    sourceTag: string,
    ...args: unknown[]
  ): Promise<T> => {
    const started = Date.now();
    const kind = getRequestKind(endpoint);
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const callerTag = getCallerTag();
    const selectedChainIdAtRequest = getSelectedChainId?.();
    const requestPayloadBase = {
      callerTag,
      chainId,
      chainName,
      createdBy,
      endpoint: normalizedEndpoint,
      kind,
      ownerSwitchGeneration,
      runtimeGeneration,
      runtimeInstanceId,
      selectedChainIdAtCreate,
      selectedChainIdAtRequest,
      sourceTag,
    };

    const blockInactive = (error: CardanoRuntimeInactiveError): never => {
      emitLifecycle(
        "blockfrost.request_blocked_inactive_runtime",
        {
          ...requestPayloadBase,
          currentChainId: error.currentChainId,
          currentGeneration: error.currentGeneration,
          currentRevision: error.currentRevision,
          expectedChainId: error.expectedChainId,
          expectedGeneration: error.expectedGeneration,
          expectedRevision: error.expectedRevision,
          reason: error.reason,
          revokeReason: error.revokeReason,
        },
        logger
      );
      if (disposed) {
        emitLifecycle(
          "blockfrost.request_after_dispose",
          requestPayloadBase,
          logger
        );
      }
      throw error;
    };

    try {
      runtimeLease?.assertActive(`blockfrost:${normalizedEndpoint}`);
    } catch (error) {
      if (isCardanoRuntimeInactiveError(error)) {
        blockInactive(
          error instanceof CardanoRuntimeInactiveError
            ? error
            : new CardanoRuntimeInactiveError({
                reason: error.reason ?? "revoked",
                expectedChainId:
                  error.expectedChainId ??
                  chainId ??
                  runtimeLease?.chainId ??
                  "unknown",
                expectedRevision:
                  error.expectedRevision ??
                  ownerSwitchGeneration ??
                  runtimeLease?.authorityRevision ??
                  -1,
                expectedGeneration:
                  error.expectedGeneration ??
                  runtimeGeneration ??
                  runtimeLease?.runtimeGeneration ??
                  -1,
                currentChainId:
                  error.currentChainId ?? selectedChainIdAtRequest,
                currentRevision: error.currentRevision,
                currentGeneration: error.currentGeneration,
                operation: `blockfrost:${normalizedEndpoint}`,
                revokeReason: error.revokeReason,
                message: error.message,
              })
        );
      }
      throw error;
    }

    if (disposed) {
      blockInactive(
        new CardanoRuntimeInactiveError({
          reason: "disposed",
          expectedChainId: chainId ?? runtimeLease?.chainId ?? "unknown",
          expectedRevision:
            ownerSwitchGeneration ?? runtimeLease?.authorityRevision ?? -1,
          expectedGeneration:
            runtimeGeneration ?? runtimeLease?.runtimeGeneration ?? -1,
          currentChainId: selectedChainIdAtRequest,
          operation: `blockfrost:${normalizedEndpoint}`,
          revokeReason: "manager_disposed",
        })
      );
    }

    emitLifecycle("blockfrost.request", requestPayloadBase, logger);

    try {
      // No await between assertActive / disposed check and rawRequest.
      const result = await rawRequest<T>(endpoint, ...args);
      const ms = Date.now() - started;
      const endpointBucket =
        byEndpoint.get(normalizedEndpoint) || createBucket();
      const kindBucket = byKind.get(kind) || createBucket();
      const callerBucket = byCallerTag.get(callerTag) || createBucket();
      const sourceBucket = bySourceTag.get(sourceTag) || createBucket();
      updateBucket(totals, true, ms);
      updateBucket(endpointBucket, true, ms);
      updateBucket(kindBucket, true, ms);
      updateBucket(callerBucket, true, ms);
      updateBucket(sourceBucket, true, ms);
      byEndpoint.set(normalizedEndpoint, endpointBucket);
      byKind.set(kind, kindBucket);
      byCallerTag.set(callerTag, callerBucket);
      bySourceTag.set(sourceTag, sourceBucket);
      trackRequest({
        callerTag,
        endpoint: normalizedEndpoint,
        kind,
        ms,
        sourceTag,
        status: "ok",
      });

      if (ms >= SLOW_REQUEST_MS && isCardanoRuntimeTelemetryDebugEnabled()) {
        logger.debug("[Blockfrost telemetry] slow request", {
          ...requestPayloadBase,
          ms,
        });
      }
      return result;
    } catch (error: any) {
      const ms = Date.now() - started;
      const endpointBucket =
        byEndpoint.get(normalizedEndpoint) || createBucket();
      const kindBucket = byKind.get(kind) || createBucket();
      const callerBucket = byCallerTag.get(callerTag) || createBucket();
      const sourceBucket = bySourceTag.get(sourceTag) || createBucket();
      updateBucket(totals, false, ms);
      updateBucket(endpointBucket, false, ms);
      updateBucket(kindBucket, false, ms);
      updateBucket(callerBucket, false, ms);
      updateBucket(sourceBucket, false, ms);
      byEndpoint.set(normalizedEndpoint, endpointBucket);
      byKind.set(kind, kindBucket);
      byCallerTag.set(callerTag, callerBucket);
      bySourceTag.set(sourceTag, sourceBucket);

      const failureStatus = resolveFailureStatus(error);
      failures.push({
        callerTag,
        endpoint: normalizedEndpoint,
        kind,
        ms,
        sourceTag,
        status: failureStatus,
        timestamp: Date.now(),
      });
      if (failures.length > MAX_FAILURES_TO_KEEP) failures.shift();
      trackRequest({
        callerTag,
        endpoint: normalizedEndpoint,
        kind,
        ms,
        sourceTag,
        status: failureStatus,
      });

      logger.warn("[Blockfrost telemetry] request failed", {
        ...requestPayloadBase,
        ms,
        status: failureStatus,
      });
      throw error;
    }
  };
  clientWithPatchedRequest.request = async <T>(
    endpoint: string,
    ...args: unknown[]
  ): Promise<T> =>
    clientWithPatchedRequest.__telemetryRequest!(
      endpoint,
      "direct-client",
      ...args
    );

  clientWithPatchedRequest.__telemetrySnapshot = () => buildSnapshot();
  clientWithPatchedRequest.__telemetryPatched = true;
  clientWithPatchedRequest.__telemetryRuntimeInstanceId = runtimeInstanceId;

  const collector: TelemetryCollector = {
    getSnapshot: () => buildSnapshot(),
    markAttached: () => {
      attached = true;
    },
    markDetached: () => {
      attached = false;
    },
    markDisposed: () => {
      disposed = true;
      attached = false;
    },
    setLifecycleFlags: (flags) => {
      attached = flags.attached;
      disposed = flags.disposed;
    },
    reset: () => {
      startedAt = Date.now();
      totals = createBucket();
      byEndpoint = new Map<string, StatsBucket>();
      byKind = new Map<RequestKind, StatsBucket>();
      byCallerTag = new Map<string, StatsBucket>();
      bySourceTag = new Map<string, StatsBucket>();
      failures = [];
      recentRequests = [];
    },
  };

  const store = getStore();
  pruneDisposed(store);
  const entry: RuntimeTelemetryEntry = {
    attached: false,
    chainId,
    chainName,
    collector,
    createdBy,
    disposed: false,
    getSelectedChainId,
    ownerSwitchGeneration,
    registryKey,
    runtimeGeneration,
    runtimeInstanceId,
    selectedChainIdAtCreate,
  };
  store.active.set(registryKey, entry);

  const globalScope = globalThis as Record<string, unknown>;
  const baselinesStore = getBaselinesStore();
  const getAllSnapshots = () => {
    pruneDisposed(store);
    const snapshots: Record<string, AggregatedStats> = {};
    for (const runtimeEntry of store.active.values()) {
      snapshots[runtimeEntry.registryKey] =
        runtimeEntry.collector.getSnapshot();
    }
    for (const runtimeEntry of store.disposed) {
      snapshots[runtimeEntry.registryKey] =
        runtimeEntry.collector.getSnapshot();
    }
    return snapshots;
  };
  const getRequestCountsByType = () =>
    Object.fromEntries(
      Object.entries(getAllSnapshots()).map(([key, snapshot]) => [
        key,
        toKindCounts(snapshot.byKind),
      ])
    );
  if (!globalScope[apiGlobalKey]) {
    const telemetryGlobalApi: TelemetryGlobalApi = {
      getActiveRuntimes: () => {
        pruneDisposed(getStore());
        return [...getStore().active.values()].map((item) =>
          item.collector.getSnapshot()
        );
      },
      getDisposedRuntimes: () => {
        pruneDisposed(getStore());
        return getStore().disposed.map((item) => item.collector.getSnapshot());
      },
      getAllSnapshots: () => getAllSnapshots(),
      getRequestCountsByType: () => getRequestCountsByType(),
      captureBaseline: (label: string) => {
        const key = label.trim();
        if (!key) {
          throw new Error("Baseline label must be non-empty");
        }
        const snapshot = cloneSnapshot(getAllSnapshots());
        baselinesStore.set(key, snapshot);
        if (isCardanoRuntimeTelemetryDebugEnabled()) {
          logger.debug("[Blockfrost telemetry] baseline captured", {
            label: key,
            runtimes: Object.keys(snapshot),
          });
        }
        return snapshot;
      },
      getBaselines: () =>
        cloneSnapshot(Object.fromEntries(baselinesStore.entries())),
      printAll: () => {
        const data = getAllSnapshots();
        logger.debug("[Blockfrost telemetry] snapshots", data);
        return data;
      },
      printRequestCountsByType: () => {
        const data = getRequestCountsByType();
        logger.debug("[Blockfrost telemetry] request counts by type", data);
        return data;
      },
      reset: () => {
        const current = getStore();
        for (const runtimeEntry of current.active.values()) {
          runtimeEntry.collector.reset();
        }
        for (const runtimeEntry of current.disposed) {
          runtimeEntry.collector.reset();
        }
      },
    };
    globalScope[apiGlobalKey] = telemetryGlobalApi;
  }

  return runtimeInstanceId;
};

export const BLOCKFROST_RATE_LIMIT_RECENT_WINDOW_MS = 15 * 60 * 1000;

const isRateLimitFailureRecord = (failure: FailureRecord): boolean => {
  if (isBlockfrostRateLimitHttpStatus(failure.status)) {
    return true;
  }

  return isBlockfrostRateLimitError({ status: failure.status });
};

export const wasRateLimitedRecently = (
  chainName: string,
  windowMs: number = BLOCKFROST_RATE_LIMIT_RECENT_WINDOW_MS
): boolean => {
  const cutoff = Date.now() - windowMs;
  return listEntriesForChain(chainName).some((entry) =>
    entry.collector
      .getSnapshot()
      .failures.some(
        (failure) =>
          failure.timestamp >= cutoff && isRateLimitFailureRecord(failure)
      )
  );
};

export const resetBlockfrostRateLimitTelemetry = (chainName: string): void => {
  for (const entry of listEntriesForChain(chainName)) {
    entry.collector.reset();
  }
};

/** Test helper: wipe active + disposed runtime telemetry store. */
export const clearCardanoRuntimeTelemetryForTests = (): void => {
  const globalScope = globalThis as Record<string, unknown>;
  delete globalScope[storeGlobalKey];
  delete globalScope[apiGlobalKey];
};

export const getCardanoRuntimeTelemetryActiveCount = (): number => {
  pruneDisposed(getStore());
  return getStore().active.size;
};

export const getCardanoRuntimeTelemetryDisposedCount = (): number => {
  pruneDisposed(getStore());
  return getStore().disposed.length;
};

export const createTelemetryTaggedClient = (
  blockfrostClient: BlockfrostClient,
  sourceTag: string
): BlockfrostClient => {
  const clientWithPatchedRequest = blockfrostClient as BlockfrostClient & {
    __telemetryRequest?: <T>(
      endpoint: string,
      source: string,
      ...args: unknown[]
    ) => Promise<T>;
    request: <T>(endpoint: string, ...args: unknown[]) => Promise<T>;
  };

  const taggedClient = Object.create(blockfrostClient) as BlockfrostClient;
  taggedClient.request = <T>(endpoint: string, ...args: unknown[]) => {
    if (clientWithPatchedRequest.__telemetryRequest) {
      return clientWithPatchedRequest.__telemetryRequest<T>(
        endpoint,
        sourceTag,
        ...args
      );
    }
    return clientWithPatchedRequest.request<T>(endpoint, ...args);
  };

  return taggedClient;
};
