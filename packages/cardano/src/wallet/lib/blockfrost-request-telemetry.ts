import { Logger } from "ts-log";
import { BlockfrostClient } from "@cardano-sdk/cardano-services-client";
import {
  isBlockfrostRateLimitError,
  isBlockfrostRateLimitHttpStatus,
} from "../../adapters/blockfrost-error-classifier";

const SLOW_REQUEST_MS = 1000;
const MAX_FAILURES_TO_KEEP = 50;

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

interface RequestRecord {
  callerTag: string;
  endpoint: string;
  kind: RequestKind;
  ms: number;
  sourceTag: string;
  status: number | "unknown" | "ok";
  timestamp: number;
}

interface AggregatedStats {
  byCallerTag: Record<string, StatsBucket>;
  byEndpoint: Record<string, StatsBucket>;
  byKind: Record<RequestKind, StatsBucket>;
  bySourceTag: Record<string, StatsBucket>;
  chainName: string;
  failures: FailureRecord[];
  recentRequests: RequestRecord[];
  startedAt: number;
  totals: StatsBucket;
}

interface TelemetryGlobalApi {
  getAllSnapshots: () => Record<string, AggregatedStats>;
  getRequestCountsByType: () => Record<string, Record<RequestKind, number>>;
  captureBaseline: (label: string) => Record<string, AggregatedStats>;
  getBaselines: () => Record<string, Record<string, AggregatedStats>>;
  printAll: () => Record<string, AggregatedStats>;
  printRequestCountsByType: () => Record<string, Record<RequestKind, number>>;
  reset: () => void;
}

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

const MAX_RECENT_REQUESTS_TO_KEEP = 300;
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

const globalKey = "__cardanoBlockfrostTelemetryRegistry";
const baselineGlobalKey = "__cardanoBlockfrostTelemetryBaselines";

interface TelemetryCollector {
  getSnapshot: () => AggregatedStats;
  reset: () => void;
}

const getRegistry = (): Map<string, TelemetryCollector> => {
  const globalScope = globalThis as Record<string, unknown>;
  if (!globalScope[globalKey]) {
    globalScope[globalKey] = new Map<string, TelemetryCollector>();
  }
  return globalScope[globalKey] as Map<string, TelemetryCollector>;
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

// Telemetry snapshots are JSON-only by design (no BigInt/Map/Date/functions).
const cloneSnapshot = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

export const installBlockfrostRequestTelemetry = ({
  blockfrostClient,
  chainName,
  logger,
}: {
  blockfrostClient: BlockfrostClient;
  chainName: string;
  logger: Logger;
}) => {
  const clientWithPatchedRequest = blockfrostClient as BlockfrostClient & {
    __telemetryPatched?: boolean;
    __telemetryRequest?: <T>(
      endpoint: string,
      sourceTag: string,
      ...args: unknown[]
    ) => Promise<T>;
    __telemetrySnapshot?: () => AggregatedStats;
    request: <T>(endpoint: string, ...args: unknown[]) => Promise<T>;
  };
  if (clientWithPatchedRequest.__telemetryPatched) return;

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

  clientWithPatchedRequest.__telemetryRequest = async <T>(
    endpoint: string,
    sourceTag: string,
    ...args: unknown[]
  ): Promise<T> => {
    const started = Date.now();
    const kind = getRequestKind(endpoint);
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const callerTag = getCallerTag();
    try {
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

      if (ms >= SLOW_REQUEST_MS) {
        logger.debug("[Blockfrost telemetry] slow request", {
          callerTag,
          chainName,
          endpoint: normalizedEndpoint,
          kind,
          ms,
          sourceTag,
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

      failures.push({
        callerTag,
        endpoint: normalizedEndpoint,
        kind,
        ms,
        sourceTag,
        status: error?.status ?? "unknown",
        timestamp: Date.now(),
      });
      if (failures.length > MAX_FAILURES_TO_KEEP) failures.shift();
      trackRequest({
        callerTag,
        endpoint: normalizedEndpoint,
        kind,
        ms,
        sourceTag,
        status: error?.status ?? "unknown",
      });

      logger.warn("[Blockfrost telemetry] request failed", {
        callerTag,
        chainName,
        endpoint: normalizedEndpoint,
        kind,
        ms,
        sourceTag,
        status: error?.status,
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

  clientWithPatchedRequest.__telemetrySnapshot = () => ({
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
    chainName,
    failures: [...failures],
    recentRequests: [...recentRequests],
    startedAt,
    totals: { ...totals },
  });
  clientWithPatchedRequest.__telemetryPatched = true;

  const registry = getRegistry();
  const collector: TelemetryCollector = {
    getSnapshot: () => clientWithPatchedRequest.__telemetrySnapshot!(),
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
  registry.set(chainName, collector);
  const globalScope = globalThis as Record<string, unknown>;
  const baselinesStore = getBaselinesStore();
  const getAllSnapshots = () =>
    Object.fromEntries(
      [...registry.entries()].map(([name, telemetryCollector]) => [
        name,
        telemetryCollector.getSnapshot(),
      ])
    );
  const getRequestCountsByType = () =>
    Object.fromEntries(
      [...registry.entries()].map(([name, telemetryCollector]) => {
        const snapshot = telemetryCollector.getSnapshot();
        return [name, toKindCounts(snapshot.byKind)];
      })
    );
  if (!globalScope["__cardanoBlockfrostTelemetry"]) {
    const telemetryGlobalApi: TelemetryGlobalApi = {
      getAllSnapshots: () => getAllSnapshots(),
      getRequestCountsByType: () => getRequestCountsByType(),
      captureBaseline: (label: string) => {
        const key = label.trim();
        if (!key) {
          throw new Error("Baseline label must be non-empty");
        }
        const snapshot = cloneSnapshot(getAllSnapshots());
        baselinesStore.set(key, snapshot);
        logger.debug("[Blockfrost telemetry] baseline captured", {
          label: key,
          chains: Object.keys(snapshot),
        });
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
        for (const telemetryCollector of registry.values()) {
          telemetryCollector.reset();
        }
      },
    };
    globalScope["__cardanoBlockfrostTelemetry"] = telemetryGlobalApi;
  }
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
  const collector = getRegistry().get(chainName);
  if (!collector) {
    return false;
  }

  const cutoff = Date.now() - windowMs;
  return collector
    .getSnapshot()
    .failures.some(
      (failure) =>
        failure.timestamp >= cutoff && isRateLimitFailureRecord(failure)
    );
};

export const resetBlockfrostRateLimitTelemetry = (chainName: string): void => {
  getRegistry().get(chainName)?.reset();
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
