import { ChainInfoWithRepoUpdateOptions } from "../types";

/** Committed selected chain. `revision` increases on each changed commit. */
export type NetworkAuthoritySnapshot = {
  chainId: string;
  revision: number;
};

export type NetworkAuthorityChainInfo = {
  chainId: string;
  features?: string[];
};

/**
 * Registry used for validation and commit-only mutations.
 * Approval and probing stay outside the authority command queue.
 */
export type NetworkAuthorityRegistry = {
  getChainInfos: () => Promise<NetworkAuthorityChainInfo[]>;
  /** Canonical registered chainId, or undefined if unknown. */
  findCanonicalChainId: (chainId: string) => Promise<string | undefined>;
  commitAddChain: (chainInfo: ChainInfoWithRepoUpdateOptions) => Promise<void>;
  /** Persist removal and invalidate cache. Must not change selection. */
  commitRemoveChain: (chainId: string) => Promise<void>;
};

/** Called synchronously after durable + in-memory commit. Must not roll back. */
export type NetworkAuthorityCommitObserver = (
  snapshot: NetworkAuthoritySnapshot,
  previous: NetworkAuthoritySnapshot | undefined
) => void;

export type NetworkAuthorityPublisher = {
  publishInternalSurfacesSync?: (snapshot: NetworkAuthoritySnapshot) => void;
  /** Webpage notification uses an opaque sequence, not `snapshot.revision`. */
  publishWebpageNetworkChanged?: (opaqueSeq: number) => void;
};

export type NetworkAuthorityDeps = {
  kvStore: {
    get: <T = unknown>(key: string) => Promise<T | undefined>;
    set: <T = unknown>(key: string, data: T | null) => Promise<void>;
  };
  registry: NetworkAuthorityRegistry;
  /**
   * Used once when no durable snapshot exists yet.
   * Extension: `extension_last_view_chain_id`; mobile: `last_view_chain_id`.
   */
  readLegacyLastViewChainId: () => Promise<string | undefined>;
  resolveFallbackChainId: (chainInfos: NetworkAuthorityChainInfo[]) => string;
  publisher?: NetworkAuthorityPublisher;
};
