import {
  resolveRequestedChain,
  type RequestedChainContextValue,
  type RequestedChainRegistry,
  type ResolveRequestedChainFailure,
} from "../../../../utils/requested-chain-context";

export type SuggestedTokenWaitingPayload = {
  id: string;
  data: {
    chainId: string;
    contractAddress: string;
    viewingKey?: string;
  };
};

export type PrepareTokenAddSuggestedSuccess = {
  ok: true;
  interactionId: string;
  /** Payload chain id from waiting data (strict identity for approve). */
  waitingChainId: string;
  contractAddress: string;
  requested: RequestedChainContextValue;
};

export type PrepareTokenAddSuggestedFailure = {
  ok: false;
  error:
    | { code: "no_waiting_data" }
    | { code: "resolve_failed"; cause: ResolveRequestedChainFailure };
};

/**
 * Manual vs suggested binding for token-add.
 * Write path is tied to mode — never to popup `?interaction=` alone.
 */
export type TokenAddBinding =
  | {
      mode: "manual";
      effectiveChainId: string;
      writePath: "addToken";
    }
  | {
      mode: "suggested";
      effectiveChainId: string;
      waitingChainId: string;
      interactionId: string;
      contractAddress: string;
      writePath: "approveSuggested";
      requested: RequestedChainContextValue;
    }
  | {
      mode: "suggested_unresolved";
      interactionId: string;
      error: PrepareTokenAddSuggestedFailure["error"];
    };

export type TokenAddWriteAction =
  | {
      type: "approveSuggested";
      interactionId: string;
      /** Strict waiting payload chain id for store identity. */
      chainId: string;
      /** Registry chain used for tokensOf / queries (may be remapped). */
      destinationChainId: string;
    }
  | { type: "addToken"; chainId: string }
  | { type: "rejectSuggested"; interactionId: string };

/**
 * Resolve suggested-token chain without mutating NetworkAuthority / selection.
 * Manual add does not use this helper — it binds to chainStore.current.
 */
export function prepareTokenAddSuggested(
  registry: RequestedChainRegistry,
  waiting: SuggestedTokenWaitingPayload | undefined
): PrepareTokenAddSuggestedSuccess | PrepareTokenAddSuggestedFailure {
  if (!waiting) {
    return { ok: false, error: { code: "no_waiting_data" } };
  }

  const resolved = resolveRequestedChain(registry, waiting.data.chainId);
  if (!resolved.ok) {
    return {
      ok: false,
      error: { code: "resolve_failed", cause: resolved.error },
    };
  }

  return {
    ok: true,
    interactionId: waiting.id,
    waitingChainId: waiting.data.chainId,
    contractAddress: waiting.data.contractAddress,
    requested: resolved.value,
  };
}

/**
 * Single gate for query binding and submit path.
 * Suggested waiting → approveSuggested (even without ?interaction=true).
 * No waiting → addToken on active chain.
 */
export function resolveTokenAddBinding(
  activeChainId: string,
  registry: RequestedChainRegistry,
  waiting: SuggestedTokenWaitingPayload | undefined
): TokenAddBinding {
  if (!waiting) {
    return {
      mode: "manual",
      effectiveChainId: activeChainId,
      writePath: "addToken",
    };
  }

  const prepared = prepareTokenAddSuggested(registry, waiting);
  if (!prepared.ok) {
    return {
      mode: "suggested_unresolved",
      interactionId: waiting.id,
      error: prepared.error,
    };
  }

  return {
    mode: "suggested",
    effectiveChainId: prepared.requested.chainInfo.chainId,
    waitingChainId: prepared.waitingChainId,
    interactionId: prepared.interactionId,
    contractAddress: prepared.contractAddress,
    writePath: "approveSuggested",
    requested: prepared.requested,
  };
}

export function planTokenAddSubmit(
  binding: Extract<TokenAddBinding, { mode: "manual" | "suggested" }>
): TokenAddWriteAction {
  if (binding.mode === "suggested") {
    return {
      type: "approveSuggested",
      interactionId: binding.interactionId,
      chainId: binding.waitingChainId,
      destinationChainId: binding.effectiveChainId,
    };
  }
  return { type: "addToken", chainId: binding.effectiveChainId };
}

export function planTokenAddReject(
  binding: TokenAddBinding
): Extract<TokenAddWriteAction, { type: "rejectSuggested" }> | null {
  if (binding.mode === "manual") {
    return null;
  }
  return {
    type: "rejectSuggested",
    interactionId: binding.interactionId,
  };
}

/** Duplicate check must use currencies of effectiveChainId (request chain in suggested mode). */
export function isContractAlreadyAdded(
  // AppCurrency is a union; only contract-backed members carry contractAddress.
  currencies: ReadonlyArray<object>,
  contractAddress: string
): boolean {
  const needle = contractAddress.toLowerCase();
  return currencies.some((currency) => {
    const addr = (currency as { contractAddress?: unknown }).contractAddress;
    return typeof addr === "string" && addr.toLowerCase() === needle;
  });
}

/**
 * CW20/ERC20 suggested/manual add needs no wallet tx — only metadata + store write.
 * Secret20 create-viewing-key needs a Loaded account on the request chain;
 * importing an existing viewing key does not.
 */
export function tokenAddSubmitRequiresReadyAccount(params: {
  isSecret20: boolean;
  isImportingViewingKey: boolean;
}): boolean {
  if (!params.isSecret20) {
    return false;
  }
  return !params.isImportingViewingKey;
}

/**
 * Request-scoped chains are not auto-inited (extension autoInit: false; root
 * only inits chainStore.current). Suggested A≠B must explicitly init B.
 */
export function shouldInitTokenAddAccount(walletStatus: string): boolean {
  return walletStatus === "NotInit";
}

export function assertTokenAddApproveStillValid(
  waiting: SuggestedTokenWaitingPayload | undefined,
  expectedInteractionId: string,
  expectedWaitingChainId: string
): void {
  if (!waiting || waiting.id !== expectedInteractionId) {
    throw new Error("Suggested token request was replaced or cancelled");
  }
  if (waiting.data.chainId !== expectedWaitingChainId) {
    throw new Error("Suggested token chain id changed");
  }
}

export function formatTokenAddPrepareError(
  error: PrepareTokenAddSuggestedFailure["error"]
): string {
  switch (error.code) {
    case "no_waiting_data":
      return "No suggested token request is waiting.";
    case "resolve_failed":
      switch (error.cause.code) {
        case "invalid_chain_id":
          return "Suggested token chain id is invalid.";
        case "unknown_chain":
          return `Unknown chain for suggested token: ${error.cause.requestedChainId}`;
        case "ambiguous_chain":
          return `Ambiguous chain for suggested token: ${error.cause.requestedChainId}`;
        default:
          return "Failed to resolve suggested token chain.";
      }
    default:
      return "Failed to prepare suggested token request.";
  }
}
