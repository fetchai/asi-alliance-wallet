/**
 * Compatibility shim — temporary Blockfrost QA telemetry was retired.
 * Prefer importing from `./blockfrost-request-guard`.
 */
export {
  BLOCKFROST_RATE_LIMIT_RECENT_WINDOW_MS,
  clearBlockfrostRequestGuardForTests,
  clearCardanoRuntimeTelemetryForTests,
  createRuntimeInstanceId,
  installBlockfrostRequestGuard,
  installBlockfrostRequestTelemetry,
  markCardanoRuntimeDisposed,
  resetBlockfrostRateLimitTelemetry,
  wasRateLimitedRecently,
  type CardanoRuntimeCreatedBy,
} from "./blockfrost-request-guard";

/** No-op: attach/detach were telemetry-only. */
export const markCardanoRuntimeAttached = (
  _runtimeInstanceId?: string,
  _options?: { replacedInstanceId?: string }
): void => {
  // retired
};

/** No-op: attach/detach were telemetry-only. */
export const markCardanoRuntimeDetached = (
  _runtimeInstanceId?: string
): void => {
  // retired
};

/** No-op: lifecycle event dumps were telemetry-only. */
export const recordCardanoRuntimeLifecycle = (
  _event: string,
  _payload?: Record<string, unknown>,
  _logger?: unknown
): void => {
  // retired
};

export const isCardanoRuntimeTelemetryDebugEnabled = (): boolean => false;

export const getCardanoRuntimeTelemetryActiveCount = (): number => 0;

export const getCardanoRuntimeTelemetryDisposedCount = (): number => 0;

/** Tagged clients were for telemetry source tags — return the same client. */
export const createTelemetryTaggedClient = <T>(
  client: T,
  _sourceTag: string
): T => client;

export type CardanoRuntimeLifecycleEvent = string;

export type CardanoRuntimeTelemetryMeta = {
  chainId?: string;
  chainName: string;
  createdBy?: import("./blockfrost-request-guard").CardanoRuntimeCreatedBy;
  ownerSwitchGeneration?: number;
  runtimeGeneration?: number;
  runtimeInstanceId?: string;
  selectedChainIdAtCreate?: string;
  getSelectedChainId?: () => string | undefined;
  runtimeLease?: import("../../runtime-lease").CardanoRuntimeLease;
};
