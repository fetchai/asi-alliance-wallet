import fs from "fs";
import path from "path";
import {
  assertViewingKeyApproveStillValid,
  formatViewingKeyPrepareError,
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

describe("prepareViewingKeyRequest", () => {
  const registry = {
    chainInfos: [{ chainId: "secret-4" }, { chainId: "fetchhub-4" }],
  } as any;

  it("resolves single requested chain without requiring active selection", () => {
    const result = prepareViewingKeyRequest(
      registry,
      waiting({ chainIds: ["secret-4"] })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requested.chainInfo.chainId).toBe("secret-4");
      expect(result.interactionId).toBe("vk-1");
    }
  });

  it("fails closed on empty chainIds", () => {
    expect(
      prepareViewingKeyRequest(registry, waiting({ chainIds: [] }))
    ).toEqual({
      ok: false,
      error: { code: "empty_chain_ids" },
    });
  });

  it("fails closed on multi chainIds", () => {
    expect(
      prepareViewingKeyRequest(
        registry,
        waiting({ chainIds: ["secret-4", "fetchhub-4"] })
      )
    ).toEqual({
      ok: false,
      error: { code: "multi_chain_ids", count: 2 },
    });
  });

  it("fails for unknown chain", () => {
    const result = prepareViewingKeyRequest(
      registry,
      waiting({ chainIds: ["missing-1"] })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("resolve_failed");
    }
  });

  it("detects replaced interaction id", () => {
    expect(
      prepareViewingKeyRequest(registry, waiting({ id: "b" }), "a")
    ).toEqual({
      ok: false,
      error: { code: "interaction_replaced" },
    });
  });

  it("recovers after registry catch-up without remount (same waiting ref)", () => {
    const mutableRegistry = {
      chainInfos: [] as { chainId: string }[],
    };
    const payload = waiting({ chainIds: ["secret-4"] });

    expect(prepareViewingKeyRequest(mutableRegistry as any, payload).ok).toBe(
      false
    );

    mutableRegistry.chainInfos = [{ chainId: "secret-4" }];
    const after = prepareViewingKeyRequest(mutableRegistry as any, payload);
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.requested.chainInfo.chainId).toBe("secret-4");
    }
  });

  it("does not require active selection to match request chain", () => {
    const result = prepareViewingKeyRequest(
      registry,
      waiting({ chainIds: ["secret-4"] })
    );
    expect(result.ok).toBe(true);
    // Active authority is irrelevant: prepare only reads the registry.
    expect(result).not.toHaveProperty("activeChainId");
  });

  it("approve identity stays valid when active authority differs (A≠B)", () => {
    // Authority A is never an assert input — only waiting id + payload chain B.
    expect(() =>
      assertViewingKeyApproveStillValid(
        waiting({ id: "vk-b", chainIds: ["secret-4"] }),
        "vk-b",
        "secret-4"
      )
    ).not.toThrow();
  });
});

describe("assertViewingKeyApproveStillValid", () => {
  it("throws when interaction was replaced", () => {
    expect(() =>
      assertViewingKeyApproveStillValid(waiting({ id: "2" }), "1", "secret-4")
    ).toThrow(/replaced/);
  });

  it("throws when chain id drifts", () => {
    expect(() =>
      assertViewingKeyApproveStillValid(
        waiting({ id: "1", chainIds: ["fetchhub-4"] }),
        "1",
        "secret-4"
      )
    ).toThrow(/chain id changed/);
  });

  it("passes when identity still matches", () => {
    expect(() =>
      assertViewingKeyApproveStillValid(
        waiting({ id: "1", chainIds: ["secret-4"] }),
        "1",
        "secret-4"
      )
    ).not.toThrow();
  });
});

describe("formatViewingKeyPrepareError", () => {
  it("formats multi_chain_ids", () => {
    expect(
      formatViewingKeyPrepareError({ code: "multi_chain_ids", count: 3 })
    ).toMatch(/exactly one chain/);
  });
});

describe("viewing-key page mount invariant (source lock)", () => {
  // Prepare never saw Select/Persist APIs — locking only the helper is vacuous.
  // Mount must not Select/Persist — only request-scoped prepare.
  const pageSource = fs.readFileSync(
    path.join(__dirname, "viewing-key.tsx"),
    "utf8"
  );

  it("does not call selectChainAndPersist / selectChain / setChainInfos", () => {
    expect(pageSource).not.toMatch(/selectChainAndPersist\s*\(/);
    expect(pageSource).not.toMatch(/\.selectChain\s*\(/);
    expect(pageSource).not.toMatch(/setChainInfos\s*\(/);
    expect(pageSource).not.toMatch(/\bflowResult\s*\(/);
  });

  it("resolves chain via prepareViewingKeyRequest (request-scoped)", () => {
    expect(pageSource).toMatch(/prepareViewingKeyRequest\s*\(/);
    expect(pageSource).toMatch(/RequestedChainProvider/);
    expect(pageSource).toMatch(/assertViewingKeyApproveStillValid\s*\(/);
  });

  it("closes popup only when viewing-key queue is empty (approve + both rejects)", () => {
    const closeGuards = pageSource.match(
      /waitingSecret20ViewingKeyAccessPermissions\s*\n?\s*\.length\s*===\s*0/g
    );
    // Body reject, body approve, prepare-failure reject.
    expect(closeGuards?.length).toBeGreaterThanOrEqual(3);
  });
});
