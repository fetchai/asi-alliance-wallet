import React, {
  createContext,
  useContext,
  type FunctionComponent,
  type ReactNode,
} from "react";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import type { ChainInfoInner } from "@keplr-wallet/stores";
import type { ChainInfo } from "@keplr-wallet/types";

/**
 * Read-only view of a chain requested by an approval / dApp interaction.
 * Must never mutate NetworkAuthority or ChainStore selection.
 */
export type RequestedChainContextValue<C extends ChainInfo = ChainInfo> = {
  requestedChainId: string;
  chainInfo: ChainInfoInner<C>;
};

export type ResolveRequestedChainFailureCode =
  | "invalid_chain_id"
  | "unknown_chain"
  | "ambiguous_chain";

export type ResolveRequestedChainFailure = {
  code: ResolveRequestedChainFailureCode;
  requestedChainId: string;
  /** Present when code is ambiguous_chain. */
  matches?: string[];
};

export type ResolveRequestedChainResult<C extends ChainInfo = ChainInfo> =
  | { ok: true; value: RequestedChainContextValue<C> }
  | { ok: false; error: ResolveRequestedChainFailure };

export type RequestedChainRegistry<C extends ChainInfo = ChainInfo> = {
  readonly chainInfos: ReadonlyArray<ChainInfoInner<C>>;
};

function isUsableChainId(chainId: string): boolean {
  return typeof chainId === "string" && chainId.trim().length > 0;
}

/**
 * Registry resolve for approval UI.
 *
 * Policy: exact chainId match wins when unique. Otherwise Cosmos identifier
 * canonicalization is allowed only when exactly one registered chain shares
 * that identifier. Ambiguous or unknown → fail-closed (no fallback to active).
 *
 * Never writes selection / authority.
 */
export function resolveRequestedChain<C extends ChainInfo = ChainInfo>(
  registry: RequestedChainRegistry<C>,
  requestedChainId: string
): ResolveRequestedChainResult<C> {
  if (!isUsableChainId(requestedChainId)) {
    return {
      ok: false,
      error: {
        code: "invalid_chain_id",
        requestedChainId: requestedChainId ?? "",
      },
    };
  }

  const exactMatches = registry.chainInfos.filter(
    (info) => info.chainId === requestedChainId
  );
  if (exactMatches.length === 1) {
    return {
      ok: true,
      value: {
        requestedChainId,
        chainInfo: exactMatches[0],
      },
    };
  }
  if (exactMatches.length > 1) {
    return {
      ok: false,
      error: {
        code: "ambiguous_chain",
        requestedChainId,
        matches: exactMatches.map((info) => info.chainId),
      },
    };
  }

  let requestedIdentifier: string;
  try {
    requestedIdentifier = ChainIdHelper.parse(requestedChainId).identifier;
  } catch {
    return {
      ok: false,
      error: { code: "invalid_chain_id", requestedChainId },
    };
  }

  const identifierMatches = registry.chainInfos.filter((info) => {
    try {
      return (
        ChainIdHelper.parse(info.chainId).identifier === requestedIdentifier
      );
    } catch {
      return false;
    }
  });

  if (identifierMatches.length === 0) {
    return {
      ok: false,
      error: { code: "unknown_chain", requestedChainId },
    };
  }

  if (identifierMatches.length > 1) {
    return {
      ok: false,
      error: {
        code: "ambiguous_chain",
        requestedChainId,
        matches: identifierMatches.map((info) => info.chainId),
      },
    };
  }

  return {
    ok: true,
    value: {
      requestedChainId,
      chainInfo: identifierMatches[0],
    },
  };
}

/**
 * Strict payload identity: waiting.chainId vs signDoc.chainId (and analogues).
 * Requires exact string equality — same as today's sign-page check.
 * Does NOT accept another Cosmos version, or unsuffixed id vs explicit `-0`
 * (ChainIdHelper would otherwise treat both as version 0).
 * Registry remap from resolveRequestedChain must not be used as payload identity.
 */
export function matchStrictChainIdentity(
  expectedChainId: string,
  actualChainId: string
): boolean {
  if (!isUsableChainId(expectedChainId) || !isUsableChainId(actualChainId)) {
    return false;
  }
  return expectedChainId === actualChainId;
}

export function assertStrictChainIdentity(
  expectedChainId: string,
  actualChainId: string
): void {
  if (!matchStrictChainIdentity(expectedChainId, actualChainId)) {
    throw new Error(
      `Chain id unmatched: expected ${expectedChainId}, got ${actualChainId}`
    );
  }
}

const RequestedChainContext = createContext<RequestedChainContextValue | null>(
  null
);

export const RequestedChainProvider: FunctionComponent<{
  value: RequestedChainContextValue;
  children: ReactNode;
}> = ({ value, children }) => {
  return (
    <RequestedChainContext.Provider value={value}>
      {children}
    </RequestedChainContext.Provider>
  );
};

/** Explicit opt-in; does not fall back to chainStore.current. */
export function useRequestedChain(): RequestedChainContextValue {
  const value = useContext(RequestedChainContext);
  if (!value) {
    throw new Error(
      "useRequestedChain must be used within RequestedChainProvider"
    );
  }
  return value;
}

export function useOptionalRequestedChain(): RequestedChainContextValue | null {
  return useContext(RequestedChainContext);
}
