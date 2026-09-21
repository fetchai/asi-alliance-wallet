/**
 * Viewing-key authority invariants — fail-closed prepare + approve identity.
 * Page mount no-Select is locked in prepare-viewing-key-request.test.ts
 * (viewing-key.tsx source lock).
 */
import {
  assertViewingKeyApproveStillValid,
  prepareViewingKeyRequest,
  type ViewingKeyWaitingPayload,
} from "./prepare-viewing-key-request";

function waiting(partial?: {
  id?: string;
  chainIds?: string[];
  contractAddress?: string;
}): ViewingKeyWaitingPayload {
  return {
    id: partial?.id ?? "vk-1",
    data: {
      chainIds: partial?.chainIds ?? ["secret-4"],
      contractAddress: partial?.contractAddress ?? "secret1contract",
      origins: ["https://dapp.example"],
    },
  };
}

const registry = {
  chainInfos: [{ chainId: "secret-4" }, { chainId: "fetchhub-4" }],
} as any;

describe("viewing-key authority invariants", () => {
  it("resolves request chain without requiring active selection", () => {
    const result = prepareViewingKeyRequest(
      registry,
      waiting({ chainIds: ["secret-4"] })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requested.chainInfo.chainId).toBe("secret-4");
    }
  });

  it("fails closed on empty / multi chainIds", () => {
    expect(
      prepareViewingKeyRequest(registry, waiting({ chainIds: [] }))
    ).toEqual({ ok: false, error: { code: "empty_chain_ids" } });
    expect(
      prepareViewingKeyRequest(
        registry,
        waiting({ chainIds: ["secret-4", "fetchhub-4"] })
      )
    ).toEqual({ ok: false, error: { code: "multi_chain_ids", count: 2 } });
  });

  it("approve identity fails closed on replace / chain drift", () => {
    const payload = waiting({ chainIds: ["secret-4"] });
    expect(() =>
      assertViewingKeyApproveStillValid(payload, "vk-1", "secret-4")
    ).not.toThrow();

    expect(() =>
      assertViewingKeyApproveStillValid(payload, "vk-2", "secret-4")
    ).toThrow();

    expect(() =>
      assertViewingKeyApproveStillValid(
        waiting({ chainIds: ["fetchhub-4"] }),
        "vk-1",
        "secret-4"
      )
    ).toThrow();
  });
});
