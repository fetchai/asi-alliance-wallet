/**
 * Revocable ownership token for a Cardano NetworkRuntime.
 * Checked at the network boundary so a superseded create cannot issue
 * Blockfrost requests after authority has moved.
 */

export const CARDANO_RUNTIME_INACTIVE_CODE =
  "cardano_runtime_inactive" as const;

export type CardanoRuntimeInactiveReason =
  | "revoked"
  | "aborted"
  | "generation_mismatch"
  | "authority_mismatch"
  | "disposed";

export class CardanoRuntimeInactiveError extends Error {
  readonly code = CARDANO_RUNTIME_INACTIVE_CODE;
  readonly reason: CardanoRuntimeInactiveReason;
  readonly expectedChainId: string;
  readonly expectedRevision: number;
  readonly expectedGeneration: number;
  readonly currentChainId?: string | null;
  readonly currentRevision?: number | null;
  readonly currentGeneration?: number;
  readonly operation?: string;
  readonly revokeReason?: string;

  constructor(params: {
    reason: CardanoRuntimeInactiveReason;
    expectedChainId: string;
    expectedRevision: number;
    expectedGeneration: number;
    currentChainId?: string | null;
    currentRevision?: number | null;
    currentGeneration?: number;
    operation?: string;
    revokeReason?: string;
    message?: string;
  }) {
    super(
      params.message ??
        `Cardano runtime inactive (${params.reason})${
          params.operation ? `: ${params.operation}` : ""
        }`
    );
    this.name = "CardanoRuntimeInactiveError";
    this.reason = params.reason;
    this.expectedChainId = params.expectedChainId;
    this.expectedRevision = params.expectedRevision;
    this.expectedGeneration = params.expectedGeneration;
    this.currentChainId = params.currentChainId;
    this.currentRevision = params.currentRevision;
    this.currentGeneration = params.currentGeneration;
    this.operation = params.operation;
    this.revokeReason = params.revokeReason;
  }
}

export type CardanoRuntimeInactiveErrorLike = {
  readonly code: typeof CARDANO_RUNTIME_INACTIVE_CODE;
  readonly reason?: CardanoRuntimeInactiveReason;
  readonly expectedChainId?: string;
  readonly expectedRevision?: number;
  readonly expectedGeneration?: number;
  readonly currentChainId?: string | null;
  readonly currentRevision?: number | null;
  readonly currentGeneration?: number;
  readonly operation?: string;
  readonly revokeReason?: string;
  readonly message?: string;
};

export function isCardanoRuntimeInactiveError(
  error: unknown
): error is CardanoRuntimeInactiveErrorLike {
  return (
    error instanceof CardanoRuntimeInactiveError ||
    (typeof error === "object" &&
      error != null &&
      (error as { code?: unknown }).code === CARDANO_RUNTIME_INACTIVE_CODE)
  );
}

export interface CardanoRuntimeLease {
  readonly chainId: string;
  readonly authorityRevision: number;
  readonly runtimeGeneration: number;
  readonly signal: AbortSignal;

  assertActive(operation?: string): void;
}

export type CardanoRuntimeLeaseAuthorityView = {
  getChainId: () => string | null | undefined;
  getRevision: () => number | null | undefined;
  getRuntimeGeneration: () => number;
};

export type MutableCardanoRuntimeLease = CardanoRuntimeLease & {
  readonly revoked: boolean;
  readonly revokeReason: string | undefined;
  revoke(reason: string): void;
};

export function createCardanoRuntimeLease(params: {
  chainId: string;
  authorityRevision: number;
  runtimeGeneration: number;
  authority: CardanoRuntimeLeaseAuthorityView;
  signal?: AbortSignal;
  abortController?: AbortController;
}): MutableCardanoRuntimeLease {
  const abortController = params.abortController ?? new AbortController();
  if (params.signal) {
    if (params.signal.aborted) {
      abortController.abort();
    } else {
      params.signal.addEventListener("abort", () => abortController.abort(), {
        once: true,
      });
    }
  }

  let revoked = false;
  let revokeReason: string | undefined;

  const lease: MutableCardanoRuntimeLease = {
    chainId: params.chainId,
    authorityRevision: params.authorityRevision,
    runtimeGeneration: params.runtimeGeneration,
    signal: abortController.signal,
    get revoked() {
      return revoked;
    },
    get revokeReason() {
      return revokeReason;
    },
    revoke(reason: string) {
      if (revoked) {
        return;
      }
      revoked = true;
      revokeReason = reason;
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    },
    assertActive(operation?: string) {
      const currentGeneration = params.authority.getRuntimeGeneration();
      const currentChainId = params.authority.getChainId();
      const currentRevision = params.authority.getRevision();

      if (revoked || abortController.signal.aborted) {
        throw new CardanoRuntimeInactiveError({
          reason: revoked ? "revoked" : "aborted",
          expectedChainId: params.chainId,
          expectedRevision: params.authorityRevision,
          expectedGeneration: params.runtimeGeneration,
          currentChainId,
          currentRevision,
          currentGeneration,
          operation,
          revokeReason,
        });
      }

      if (currentGeneration !== params.runtimeGeneration) {
        throw new CardanoRuntimeInactiveError({
          reason: "generation_mismatch",
          expectedChainId: params.chainId,
          expectedRevision: params.authorityRevision,
          expectedGeneration: params.runtimeGeneration,
          currentChainId,
          currentRevision,
          currentGeneration,
          operation,
          revokeReason,
        });
      }

      if (
        currentChainId !== params.chainId ||
        currentRevision !== params.authorityRevision
      ) {
        throw new CardanoRuntimeInactiveError({
          reason: "authority_mismatch",
          expectedChainId: params.chainId,
          expectedRevision: params.authorityRevision,
          expectedGeneration: params.runtimeGeneration,
          currentChainId,
          currentRevision,
          currentGeneration,
          operation,
          revokeReason,
        });
      }
    },
  };

  return lease;
}
