/**
 * Blockfrost request boundary: runtime lease + dispose latch.
 * Temporary QA telemetry (snapshots / lifecycle dumps) was retired; rate-limit
 * recentness stays as a tiny per-chain timestamp for UI presentation.
 */
import { BlockfrostClient } from "@cardano-sdk/cardano-services-client";
import { isBlockfrostRateLimitError } from "../../adapters/blockfrost-error-classifier";
import {
  CardanoRuntimeInactiveError,
  isCardanoRuntimeInactiveError,
  type CardanoRuntimeLease,
} from "../../runtime-lease";

export type CardanoRuntimeCreatedBy =
  | "getKey"
  | "networkSwitch"
  | "syncStatus"
  | "listAccounts"
  | "restore"
  | "unknown";

export const BLOCKFROST_RATE_LIMIT_RECENT_WINDOW_MS = 15 * 60 * 1000;

type DisposeLatch = {
  disposed: boolean;
  chainId?: string;
  runtimeGeneration?: number;
  ownerSwitchGeneration?: number;
  getSelectedChainId?: () => string | undefined;
  runtimeLease?: CardanoRuntimeLease;
};

const disposeLatches = new Map<string, DisposeLatch>();
/** Last daily-quota failure timestamp per Blockfrost chain name (not burst 429). */
const rateLimitByChain = new Map<string, number>();

export const createRuntimeInstanceId = (): string =>
  `cad_rt_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;

const normalizeEndpoint = (endpoint: string): string => {
  try {
    const url = new URL(endpoint, "https://blockfrost.invalid");
    return `${url.pathname}${url.search}`;
  } catch {
    return endpoint;
  }
};

/**
 * Stamp recent quota only for daily-quota signals (402 / quota-shaped errors).
 * Burst throttle HTTP 429 must NOT set wasRateLimitedRecently — presentation
 * treats that flag as blockfrost_rate_limited sticky UI.
 */
const recordRateLimitIfNeeded = (chainName: string, error: unknown): void => {
  if (isBlockfrostRateLimitError(error)) {
    rateLimitByChain.set(chainName, Date.now());
  }
};

export const wasRateLimitedRecently = (
  chainName: string,
  windowMs: number = BLOCKFROST_RATE_LIMIT_RECENT_WINDOW_MS
): boolean => {
  const ts = rateLimitByChain.get(chainName);
  if (ts == null) {
    return false;
  }
  return Date.now() - ts <= windowMs;
};

export const resetBlockfrostRateLimitTelemetry = (chainName: string): void => {
  rateLimitByChain.delete(chainName);
};

export const markCardanoRuntimeDisposed = (
  runtimeInstanceId: string | undefined
): void => {
  if (!runtimeInstanceId) {
    return;
  }
  const latch = disposeLatches.get(runtimeInstanceId);
  if (!latch) {
    return;
  }
  latch.disposed = true;
  // Drop Map index + lease/selection refs. The patched request still closes
  // over this latch object, so the dispose gate stays effective without
  // retaining historical runtimes in disposeLatches for the process lifetime.
  latch.runtimeLease = undefined;
  latch.getSelectedChainId = undefined;
  disposeLatches.delete(runtimeInstanceId);
};

/** Test helper: wipe dispose latches + rate-limit timestamps. */
export const clearBlockfrostRequestGuardForTests = (): void => {
  disposeLatches.clear();
  rateLimitByChain.clear();
};

/** @deprecated Use clearBlockfrostRequestGuardForTests */
export const clearCardanoRuntimeTelemetryForTests =
  clearBlockfrostRequestGuardForTests;

export const installBlockfrostRequestGuard = ({
  blockfrostClient,
  chainName,
  runtimeInstanceId: runtimeInstanceIdInput,
  runtimeGeneration,
  ownerSwitchGeneration,
  chainId,
  getSelectedChainId,
  runtimeLease,
}: {
  blockfrostClient: BlockfrostClient;
  chainName: string;
  runtimeInstanceId?: string;
  runtimeGeneration?: number;
  ownerSwitchGeneration?: number;
  chainId?: string;
  createdBy?: CardanoRuntimeCreatedBy;
  selectedChainIdAtCreate?: string;
  getSelectedChainId?: () => string | undefined;
  runtimeLease?: CardanoRuntimeLease;
}): string => {
  const runtimeInstanceId = runtimeInstanceIdInput ?? createRuntimeInstanceId();

  const client = blockfrostClient as BlockfrostClient & {
    __requestGuardPatched?: boolean;
    request: <T>(endpoint: string, ...args: unknown[]) => Promise<T>;
  };
  if (client.__requestGuardPatched) {
    return runtimeInstanceId;
  }

  const latch: DisposeLatch = {
    disposed: false,
    chainId,
    runtimeGeneration,
    ownerSwitchGeneration,
    getSelectedChainId,
    runtimeLease,
  };
  disposeLatches.set(runtimeInstanceId, latch);

  const rawRequest = client.request.bind(blockfrostClient);

  client.request = async <T>(
    endpoint: string,
    ...args: unknown[]
  ): Promise<T> => {
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const selectedChainIdAtRequest = latch.getSelectedChainId?.();

    const rethrowInactive = (error: CardanoRuntimeInactiveError): never => {
      throw error;
    };

    try {
      latch.runtimeLease?.assertActive(`blockfrost:${normalizedEndpoint}`);
    } catch (error) {
      if (isCardanoRuntimeInactiveError(error)) {
        rethrowInactive(
          error instanceof CardanoRuntimeInactiveError
            ? error
            : new CardanoRuntimeInactiveError({
                reason: error.reason ?? "revoked",
                expectedChainId:
                  error.expectedChainId ??
                  latch.chainId ??
                  latch.runtimeLease?.chainId ??
                  "unknown",
                expectedRevision:
                  error.expectedRevision ??
                  latch.ownerSwitchGeneration ??
                  latch.runtimeLease?.authorityRevision ??
                  -1,
                expectedGeneration:
                  error.expectedGeneration ??
                  latch.runtimeGeneration ??
                  latch.runtimeLease?.runtimeGeneration ??
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

    if (latch.disposed) {
      rethrowInactive(
        new CardanoRuntimeInactiveError({
          reason: "disposed",
          expectedChainId:
            latch.chainId ?? latch.runtimeLease?.chainId ?? "unknown",
          expectedRevision:
            latch.ownerSwitchGeneration ??
            latch.runtimeLease?.authorityRevision ??
            -1,
          expectedGeneration:
            latch.runtimeGeneration ??
            latch.runtimeLease?.runtimeGeneration ??
            -1,
          currentChainId: selectedChainIdAtRequest,
          operation: `blockfrost:${normalizedEndpoint}`,
          revokeReason: "manager_disposed",
        })
      );
    }

    try {
      return await rawRequest<T>(endpoint, ...args);
    } catch (error) {
      recordRateLimitIfNeeded(chainName, error);
      throw error;
    }
  };

  client.__requestGuardPatched = true;
  return runtimeInstanceId;
};

/** @deprecated Use installBlockfrostRequestGuard */
export const installBlockfrostRequestTelemetry = installBlockfrostRequestGuard;
