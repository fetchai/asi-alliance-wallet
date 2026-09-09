import {
  assertSuggestedTokenApproveIdentity,
  assertSuggestedTokenRejectIdentity,
  type SuggestedTokenWaitingData,
} from "./suggested-token-identity";

/**
 * Production gate for TokensStore.approveSuggestedToken.
 * Fail-closed on missing/replaced waiting or chain-id drift (A→C).
 */
export function resolveSuggestedTokenApprove(
  waiting: SuggestedTokenWaitingData | undefined,
  identity: { interactionId: string; chainId: string }
): SuggestedTokenWaitingData {
  assertSuggestedTokenApproveIdentity(waiting, identity);
  return waiting;
}

/**
 * Production gate for TokensStore.rejectSuggestedToken.
 */
export function resolveSuggestedTokenReject(
  waiting: SuggestedTokenWaitingData | undefined,
  identity: { interactionId: string }
): SuggestedTokenWaitingData {
  assertSuggestedTokenRejectIdentity(waiting, identity);
  return waiting;
}
