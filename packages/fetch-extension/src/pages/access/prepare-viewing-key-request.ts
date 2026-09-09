import {
  resolveRequestedChain,
  type RequestedChainContextValue,
  type RequestedChainRegistry,
  type ResolveRequestedChainFailure,
} from "../../utils/requested-chain-context";

export type ViewingKeyWaitingPayload = {
  id: string;
  data: {
    chainIds: string[];
    contractAddress: string;
    origins: string[];
  };
};

export type PrepareViewingKeySuccess = {
  ok: true;
  interactionId: string;
  requestedChainId: string;
  contractAddress: string;
  requested: RequestedChainContextValue;
};

export type PrepareViewingKeyFailure = {
  ok: false;
  error:
    | { code: "no_waiting_data" }
    | { code: "empty_chain_ids" }
    | { code: "multi_chain_ids"; count: number }
    | { code: "resolve_failed"; cause: ResolveRequestedChainFailure }
    | { code: "interaction_replaced" };
};

/**
 * Resolve viewing-key request chain without mutating NetworkAuthority.
 * Fail-closed unless exactly one chainId is present.
 */
export function prepareViewingKeyRequest(
  registry: RequestedChainRegistry,
  waiting: ViewingKeyWaitingPayload | undefined,
  expectedInteractionId?: string
): PrepareViewingKeySuccess | PrepareViewingKeyFailure {
  if (!waiting) {
    return { ok: false, error: { code: "no_waiting_data" } };
  }

  if (expectedInteractionId != null && waiting.id !== expectedInteractionId) {
    return { ok: false, error: { code: "interaction_replaced" } };
  }

  const chainIds = waiting.data.chainIds ?? [];
  if (chainIds.length === 0) {
    return { ok: false, error: { code: "empty_chain_ids" } };
  }
  if (chainIds.length !== 1) {
    return {
      ok: false,
      error: { code: "multi_chain_ids", count: chainIds.length },
    };
  }

  const requestedChainId = chainIds[0];
  const resolved = resolveRequestedChain(registry, requestedChainId);
  if (!resolved.ok) {
    return {
      ok: false,
      error: { code: "resolve_failed", cause: resolved.error },
    };
  }

  return {
    ok: true,
    interactionId: waiting.id,
    requestedChainId,
    contractAddress: waiting.data.contractAddress,
    requested: resolved.value,
  };
}

export function formatViewingKeyPrepareError(
  error: PrepareViewingKeyFailure["error"]
): string {
  switch (error.code) {
    case "no_waiting_data":
      return "No viewing-key request";
    case "empty_chain_ids":
      return "Viewing-key request has no chain id";
    case "multi_chain_ids":
      return `Viewing-key request must target exactly one chain (got ${error.count})`;
    case "interaction_replaced":
      return "Viewing-key request was replaced";
    case "resolve_failed":
      return `Cannot resolve network for this request (${error.cause.code}): ${error.cause.requestedChainId}`;
    default:
      return "Invalid viewing-key request";
  }
}

/** Pre-approve: waiting identity + single-chain payload still match. */
export function assertViewingKeyApproveStillValid(
  waiting: ViewingKeyWaitingPayload | undefined,
  expectedInteractionId: string,
  expectedChainId: string
): void {
  if (!waiting || waiting.id !== expectedInteractionId) {
    throw new Error("Viewing-key request was replaced or cancelled");
  }
  const chainIds = waiting.data.chainIds ?? [];
  if (chainIds.length !== 1 || chainIds[0] !== expectedChainId) {
    throw new Error("Viewing-key request chain id changed");
  }
}
