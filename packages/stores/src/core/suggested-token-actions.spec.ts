/**
 * Suggested-token approve/reject identity gates (pure).
 * TokensStore waiting-queue execution is covered in fetch-extension
 * tokens-store-suggested-approve.test.ts (jest can load the store there).
 */
import {
  resolveSuggestedTokenApprove,
  resolveSuggestedTokenReject,
} from "./suggested-token-actions";
import type { SuggestedTokenWaitingData } from "./suggested-token-identity";

function waiting(
  partial: Partial<SuggestedTokenWaitingData["data"]> & {
    id?: string;
    chainId?: string;
  } = {}
): SuggestedTokenWaitingData {
  return {
    id: partial.id ?? "token-interaction-1",
    data: {
      chainId: partial.chainId ?? "dorado-1",
      contractAddress:
        partial.contractAddress ??
        "fetch1contractaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      viewingKey: partial.viewingKey,
    },
  };
}

describe("resolveSuggestedTokenApprove", () => {
  it("returns waiting when identity matches", () => {
    const payload = waiting();
    expect(
      resolveSuggestedTokenApprove(payload, {
        interactionId: "token-interaction-1",
        chainId: "dorado-1",
      })
    ).toBe(payload);
  });

  it("fails closed when waiting chain drifts under concurrent A→C", () => {
    expect(() =>
      resolveSuggestedTokenApprove(waiting({ chainId: "columbus-5" }), {
        interactionId: "token-interaction-1",
        chainId: "dorado-1",
      })
    ).toThrow(/chain id changed/i);
  });

  it("fails closed when interaction id replaced", () => {
    expect(() =>
      resolveSuggestedTokenApprove(waiting(), {
        interactionId: "other-id",
        chainId: "dorado-1",
      })
    ).toThrow(/replaced/i);
  });
});

describe("resolveSuggestedTokenReject", () => {
  it("fails closed when interaction replaced", () => {
    expect(() =>
      resolveSuggestedTokenReject(waiting({ id: "other" }), {
        interactionId: "token-interaction-1",
      })
    ).toThrow(/replaced/i);
  });
});
