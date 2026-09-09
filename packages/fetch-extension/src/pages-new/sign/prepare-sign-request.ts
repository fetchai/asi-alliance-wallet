import { SignDocWrapper } from "@keplr-wallet/cosmos";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import {
  assertStrictChainIdentity,
  resolveRequestedChain,
  type RequestedChainContextValue,
  type RequestedChainRegistry,
  type ResolveRequestedChainFailure,
} from "../../utils/requested-chain-context";

/** Mirrors @keplr-wallet/cardano isCardanoChainId without pulling wallet natives. */
function isCardanoChainId(chainId: string): boolean {
  return chainId.startsWith("cardano-");
}

export type SignWaitingPayload = {
  id: string;
  isInternal: boolean;
  data: {
    chainId: string;
    msgOrigin: string;
    signer: string;
    signDocWrapper: SignDocWrapper;
    signOptions: {
      preferNoSetFee?: boolean;
      preferNoSetMemo?: boolean;
      disableBalanceCheck?: boolean;
    };
    isADR36WithString?: boolean;
    ethSignType?: unknown;
  };
};

export type PrepareSignRequestSuccess = {
  ok: true;
  interactionId: string;
  requested: RequestedChainContextValue;
  isADR36: boolean;
};

export type PrepareSignRequestFailure = {
  ok: false;
  error:
    | { code: "no_waiting_data" }
    | { code: "resolve_failed"; cause: ResolveRequestedChainFailure }
    | { code: "chain_id_unmatched"; expected: string; actual: string }
    | { code: "interaction_replaced" };
};

export function chainIdentifiersMatch(a: string, b: string): boolean {
  try {
    return (
      ChainIdHelper.parse(a).identifier === ChainIdHelper.parse(b).identifier
    );
  } catch {
    return a === b;
  }
}

/**
 * Live Cardano txs (non-ADR-36) need NetworkAuthority on the requested Cardano
 * network before approve. ADR-36 / key-only must NOT force a switch.
 *
 * Gate clears when BG authority already matches requested, OR when a BG
 * sign-switch ticket is valid for this interaction (Select ACK while UI
 * projection may still lag).
 *
 * `authorityChainId` must be NetworkAuthority (e.g. GetSelectedChainIdMsg) —
 * never UI projection (`chainStore.selectedChainId`): projection can
 * lag after concurrent Select while still showing requested.
 */
export function requiresCardanoLiveNetworkSwitch(params: {
  requestedChainId: string;
  /** BG NetworkAuthority selected chain id; null/undefined = unknown (fail closed). */
  authorityChainId: string | null | undefined;
  isADR36: boolean;
  /** BG ticket still valid for this interaction at current authority revision. */
  switchTicketValid?: boolean;
}): boolean {
  if (params.isADR36) {
    return false;
  }
  if (!isCardanoChainId(params.requestedChainId)) {
    return false;
  }
  if (params.switchTicketValid) {
    return false;
  }
  if (
    params.authorityChainId != null &&
    chainIdentifiersMatch(params.authorityChainId, params.requestedChainId)
  ) {
    return false;
  }
  return true;
}

/**
 * Validate a sign interaction without mutating network authority.
 * Registry resolve + strict payload identity (non-ADR-36).
 */
export function prepareSignRequest(
  registry: RequestedChainRegistry,
  waiting: SignWaitingPayload | undefined,
  expectedInteractionId?: string
): PrepareSignRequestSuccess | PrepareSignRequestFailure {
  if (!waiting) {
    return { ok: false, error: { code: "no_waiting_data" } };
  }

  if (expectedInteractionId != null && waiting.id !== expectedInteractionId) {
    return { ok: false, error: { code: "interaction_replaced" } };
  }

  const resolved = resolveRequestedChain(registry, waiting.data.chainId);
  if (!resolved.ok) {
    return {
      ok: false,
      error: { code: "resolve_failed", cause: resolved.error },
    };
  }

  const isADR36 = waiting.data.signDocWrapper.isADR36SignDoc;
  if (!isADR36) {
    try {
      assertStrictChainIdentity(
        waiting.data.chainId,
        waiting.data.signDocWrapper.chainId
      );
    } catch {
      return {
        ok: false,
        error: {
          code: "chain_id_unmatched",
          expected: waiting.data.chainId,
          actual: waiting.data.signDocWrapper.chainId,
        },
      };
    }
  }

  return {
    ok: true,
    interactionId: waiting.id,
    requested: resolved.value,
    isADR36,
  };
}

export type AssertSignApproveOptions = {
  /** Registry chain id used for hooks / Cardano live gate. */
  requestedRegistryChainId: string;
  /** Fresh BG NetworkAuthority chain id — not UI projection. */
  authorityChainId: string | null | undefined;
  isADR36: boolean;
  /** Fresh BG ticket query for this interaction. */
  switchTicketValid?: boolean;
};

/** Pre-approve: waiting identity + Cardano live gate after awaits. */
export function assertSignApproveStillValid(
  waiting: SignWaitingPayload | undefined,
  expectedInteractionId: string,
  expectedRequestedChainId: string,
  options?: AssertSignApproveOptions
): void {
  if (!waiting || waiting.id !== expectedInteractionId) {
    throw new Error("Sign request was replaced or cancelled");
  }
  if (waiting.data.chainId !== expectedRequestedChainId) {
    throw new Error("Sign request chain id changed");
  }
  if (
    options &&
    requiresCardanoLiveNetworkSwitch({
      requestedChainId: options.requestedRegistryChainId,
      authorityChainId: options.authorityChainId,
      isADR36: options.isADR36,
      switchTicketValid: options.switchTicketValid,
    })
  ) {
    throw new Error(
      "Cardano network switch required before approving this transaction"
    );
  }
}
