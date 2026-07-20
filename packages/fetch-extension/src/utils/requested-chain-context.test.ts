import {
  assertStrictChainIdentity,
  matchStrictChainIdentity,
  resolveRequestedChain,
  type RequestedChainRegistry,
} from "./requested-chain-context";

function fakeChainInfo(chainId: string): { chainId: string } {
  return { chainId };
}

function registry(...chainIds: string[]): RequestedChainRegistry<any> {
  return {
    chainInfos: chainIds.map(fakeChainInfo) as any,
  };
}

describe("resolveRequestedChain", () => {
  it("resolves an exact registered chainId without mutating selection", () => {
    const select = jest.fn();
    const reg = registry("fetchhub-4", "dorado-1");

    const result = resolveRequestedChain(reg, "dorado-1");

    expect(result).toEqual({
      ok: true,
      value: {
        requestedChainId: "dorado-1",
        chainInfo: expect.objectContaining({ chainId: "dorado-1" }),
      },
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("canonicalizes Cosmos version by identifier only when the match is unique", () => {
    const result = resolveRequestedChain(
      registry("cosmoshub-4"),
      "cosmoshub-3"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.chainInfo.chainId).toBe("cosmoshub-4");
      expect(result.value.requestedChainId).toBe("cosmoshub-3");
    }
  });

  it("fails closed when identifier matches multiple registered versions", () => {
    const result = resolveRequestedChain(
      registry("cosmoshub-3", "cosmoshub-4"),
      "cosmoshub-3"
    );

    // Exact match for cosmoshub-3 exists — that wins uniquely.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.chainInfo.chainId).toBe("cosmoshub-3");
    }

    const ambiguous = resolveRequestedChain(
      registry("cosmoshub-3", "cosmoshub-4"),
      "cosmoshub"
    );

    expect(ambiguous).toEqual({
      ok: false,
      error: {
        code: "ambiguous_chain",
        requestedChainId: "cosmoshub",
        matches: ["cosmoshub-3", "cosmoshub-4"],
      },
    });
  });

  it("returns unknown_chain for unregistered ids", () => {
    const result = resolveRequestedChain(registry("fetchhub-4"), "missing-1");

    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_chain", requestedChainId: "missing-1" },
    });
  });

  it("returns invalid_chain_id for empty input", () => {
    expect(resolveRequestedChain(registry("fetchhub-4"), "")).toEqual({
      ok: false,
      error: { code: "invalid_chain_id", requestedChainId: "" },
    });
  });

  it("does not fall back to the active/selected chain", () => {
    const reg = registry("fetchhub-4", "dorado-1");
    const result = resolveRequestedChain(reg, "unknown-9");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_chain");
    }
  });
});

describe("matchStrictChainIdentity / assertStrictChainIdentity", () => {
  it("accepts identical chain ids", () => {
    expect(matchStrictChainIdentity("fetchhub-4", "fetchhub-4")).toBe(true);
  });

  it("rejects different Cosmos versions with the same identifier", () => {
    expect(matchStrictChainIdentity("cosmoshub-3", "cosmoshub-4")).toBe(false);
  });

  it("rejects unsuffixed id vs explicit -0 (ChainIdHelper version 0 trap)", () => {
    expect(matchStrictChainIdentity("fetchhub", "fetchhub-0")).toBe(false);
    expect(matchStrictChainIdentity("cosmoshub", "cosmoshub-0")).toBe(false);
    expect(matchStrictChainIdentity("fetchhub-0", "fetchhub")).toBe(false);
  });

  it("rejects different Cardano networks that are not string-equal", () => {
    expect(matchStrictChainIdentity("cardano-preprod", "cardano-preview")).toBe(
      false
    );
    expect(matchStrictChainIdentity("cardano-mainnet", "cardano-preprod")).toBe(
      false
    );
  });

  it("throws on assert when identities differ", () => {
    expect(() => assertStrictChainIdentity("fetchhub-4", "dorado-1")).toThrow(
      /Chain id unmatched/
    );
  });

  it("does not throw when identities match", () => {
    expect(() =>
      assertStrictChainIdentity("fetchhub-4", "fetchhub-4")
    ).not.toThrow();
  });
});

describe("resolveRequestedChain remapped contract for sign prepare", () => {
  it("keeps requestedChainId distinct from remapped chainInfo.chainId", () => {
    const result = resolveRequestedChain(
      registry("cosmoshub-4"),
      "cosmoshub-3"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.requestedChainId).toBe("cosmoshub-3");
      expect(result.value.chainInfo.chainId).toBe("cosmoshub-4");
      expect(result.value.requestedChainId).not.toBe(
        result.value.chainInfo.chainId
      );
      // Payload identity must stay on waiting/signDoc strings, not remapped registry id.
      expect(
        matchStrictChainIdentity(
          result.value.requestedChainId,
          result.value.chainInfo.chainId
        )
      ).toBe(false);
    }
  });

  it("does not cross-match distinct Cardano networks via identifier", () => {
    expect(
      resolveRequestedChain(registry("cardano-preprod"), "cardano-preview")
    ).toEqual({
      ok: false,
      error: { code: "unknown_chain", requestedChainId: "cardano-preview" },
    });
    expect(
      resolveRequestedChain(registry("cardano-mainnet"), "cardano-preprod")
    ).toEqual({
      ok: false,
      error: { code: "unknown_chain", requestedChainId: "cardano-preprod" },
    });
  });
});

describe("resolveRequestedChain authority isolation", () => {
  it("never reads or writes a selectedChainId / revision API", () => {
    const calls: string[] = [];
    const reg = {
      get chainInfos() {
        calls.push("chainInfos");
        return [fakeChainInfo("fetchhub-4"), fakeChainInfo("dorado-1")] as any;
      },
      selectChainAndPersist: () => {
        calls.push("select");
      },
      selectedChainId: "fetchhub-4",
      acceptedRevision: 7,
    };

    const result = resolveRequestedChain(reg, "dorado-1");

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["chainInfos"]);
  });
});
