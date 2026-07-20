import {
  assertSuggestedTokenApproveIdentity,
  assertSuggestedTokenRejectIdentity,
  type SuggestedTokenWaitingData,
} from "./suggested-token-identity";

function waiting(
  partial: Partial<SuggestedTokenWaitingData["data"]> & {
    id?: string;
    chainId?: string;
  } = {}
): SuggestedTokenWaitingData {
  return {
    id: partial.id ?? "interaction-1",
    data: {
      chainId: partial.chainId ?? "dorado-1",
      contractAddress:
        partial.contractAddress ??
        "fetch1contractaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      viewingKey: partial.viewingKey,
    },
  };
}

describe("assertSuggestedTokenApproveIdentity", () => {
  it("accepts matching interaction id and chain id", () => {
    expect(() =>
      assertSuggestedTokenApproveIdentity(waiting(), {
        interactionId: "interaction-1",
        chainId: "dorado-1",
      })
    ).not.toThrow();
  });

  it("fails closed when waiting is missing", () => {
    expect(() =>
      assertSuggestedTokenApproveIdentity(undefined, {
        interactionId: "interaction-1",
        chainId: "dorado-1",
      })
    ).toThrow("No suggested token request");
  });

  it("fails closed when interaction was replaced", () => {
    expect(() =>
      assertSuggestedTokenApproveIdentity(waiting({ id: "interaction-2" }), {
        interactionId: "interaction-1",
        chainId: "dorado-1",
      })
    ).toThrow("Suggested token request was replaced");
  });

  it("fails closed when payload chain id changed", () => {
    expect(() =>
      assertSuggestedTokenApproveIdentity(waiting({ chainId: "fetchhub-4" }), {
        interactionId: "interaction-1",
        chainId: "dorado-1",
      })
    ).toThrow("Suggested token chain id changed");
  });

  it("does not accept identifier-equivalent remapped chain ids as identity", () => {
    expect(() =>
      assertSuggestedTokenApproveIdentity(waiting({ chainId: "cosmoshub-3" }), {
        interactionId: "interaction-1",
        chainId: "cosmoshub-4",
      })
    ).toThrow("Suggested token chain id changed");
  });
});

describe("assertSuggestedTokenRejectIdentity", () => {
  it("accepts matching interaction id", () => {
    expect(() =>
      assertSuggestedTokenRejectIdentity(waiting(), {
        interactionId: "interaction-1",
      })
    ).not.toThrow();
  });

  it("fails closed when interaction was replaced", () => {
    expect(() =>
      assertSuggestedTokenRejectIdentity(waiting({ id: "interaction-2" }), {
        interactionId: "interaction-1",
      })
    ).toThrow("Suggested token request was replaced");
  });
});
