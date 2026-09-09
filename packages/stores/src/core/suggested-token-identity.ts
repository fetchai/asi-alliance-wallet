export type SuggestedTokenWaitingData = Readonly<{
  id: string;
  data: {
    chainId: string;
    contractAddress: string;
    viewingKey?: string;
  };
}>;

/**
 * Fail-closed identity for suggested-token approve.
 * Interaction id and payload chainId must still match waiting data.
 */
export function assertSuggestedTokenApproveIdentity(
  waiting: SuggestedTokenWaitingData | undefined,
  identity: { interactionId: string; chainId: string }
): asserts waiting is SuggestedTokenWaitingData {
  if (!waiting) {
    throw new Error("No suggested token request");
  }
  if (waiting.id !== identity.interactionId) {
    throw new Error("Suggested token request was replaced");
  }
  if (waiting.data.chainId !== identity.chainId) {
    throw new Error("Suggested token chain id changed");
  }
}

export function assertSuggestedTokenRejectIdentity(
  waiting: SuggestedTokenWaitingData | undefined,
  identity: { interactionId: string }
): asserts waiting is SuggestedTokenWaitingData {
  if (!waiting) {
    throw new Error("No suggested token request");
  }
  if (waiting.id !== identity.interactionId) {
    throw new Error("Suggested token request was replaced");
  }
}
