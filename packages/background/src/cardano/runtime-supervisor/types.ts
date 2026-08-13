import { NetworkAuthoritySnapshot } from "../../chains/authority";
import type { CardanoRuntimeLease } from "@keplr-wallet/cardano";

export type { NetworkAuthoritySnapshot };

/** Context passed into the physical create/attach operation. */
export type RuntimeCreateContext = {
  chainId: string;
  authorityRevision: number;
  runtimeGeneration: number;
  /** Throws if this create no longer owns the runtime slot. */
  assertStillOwner: () => void;
  /** Revocable lease checked at provider/request boundaries. */
  runtimeLease: CardanoRuntimeLease;
};

/**
 * Injectable Cardano runtime surface. Production will wrap CardanoService;
 * tests use an in-memory host.
 */
export type CardanoRuntimeHost = {
  getAttachedInstanceId: () => string | undefined;
  getBoundChainId: () => string | undefined;
  isReadyForChain: (chainId: string) => boolean;
  isInitialized: () => boolean;
  /**
   * Synchronously stop advertising readiness for any previously attached
   * runtime. Must not await physical dispose.
   */
  invalidateAdvertisedReadiness: () => void;
  disposeRuntimeIfInstance: (instanceId: string | undefined) => boolean;
  reset: () => void;
  createAndAttach: (ctx: RuntimeCreateContext) => Promise<void>;
};

export type CardanoRuntimeSupervisorDeps = {
  host: CardanoRuntimeHost;
  isCardanoChain: (chainId: string) => boolean;
};

export type CapturedRuntimeOwnership = {
  instanceId: string | undefined;
  runtimeGeneration: number;
  boundChainId: string | undefined;
  /** True when a runtime/manager was present at capture (bound may still be unset). */
  wasInitialized: boolean;
};
