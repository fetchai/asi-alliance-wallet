import {
  assertTokenAddApproveStillValid,
  isContractAlreadyAdded,
  planTokenAddReject,
  planTokenAddSubmit,
  prepareTokenAddSuggested,
  resolveTokenAddBinding,
  shouldInitTokenAddAccount,
  tokenAddSubmitRequiresReadyAccount,
  type SuggestedTokenWaitingPayload,
} from "./prepare-token-add-request";
import type { RequestedChainRegistry } from "../../../../utils/requested-chain-context";

function waiting(
  partial: {
    id?: string;
    chainId?: string;
    contractAddress?: string;
  } = {}
): SuggestedTokenWaitingPayload {
  return {
    id: partial.id ?? "token-interaction-1",
    data: {
      chainId: partial.chainId ?? "dorado-1",
      contractAddress:
        partial.contractAddress ??
        "fetch1contractaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  };
}

function registry(...chainIds: string[]): RequestedChainRegistry<any> {
  return {
    chainInfos: chainIds.map((chainId) => ({ chainId })) as any,
  };
}

const CONTRACT_B = "fetch1contractbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("prepareTokenAddSuggested", () => {
  const reg = registry("fetchhub-4", "dorado-1", "cardano-preprod");

  it("resolves suggested chain without depending on active selection", () => {
    const result = prepareTokenAddSuggested(reg, waiting());
    expect(result).toEqual({
      ok: true,
      interactionId: "token-interaction-1",
      waitingChainId: "dorado-1",
      contractAddress: "fetch1contractaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      requested: {
        requestedChainId: "dorado-1",
        chainInfo: { chainId: "dorado-1" },
      },
    });
  });

  it("keeps payload waitingChainId when registry remaps identifier", () => {
    const remappingRegistry = registry("cosmoshub-4");
    const result = prepareTokenAddSuggested(
      remappingRegistry,
      waiting({ chainId: "cosmoshub-3" })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.waitingChainId).toBe("cosmoshub-3");
    expect(result.requested.chainInfo.chainId).toBe("cosmoshub-4");
  });

  it("fails closed for unknown chain", () => {
    const result = prepareTokenAddSuggested(
      reg,
      waiting({ chainId: "missing-1" })
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "resolve_failed",
        cause: {
          code: "unknown_chain",
          requestedChainId: "missing-1",
        },
      },
    });
  });

  it("fails closed when waiting data is missing", () => {
    expect(prepareTokenAddSuggested(reg, undefined)).toEqual({
      ok: false,
      error: { code: "no_waiting_data" },
    });
  });
});

describe("resolveTokenAddBinding dual mode", () => {
  const reg = registry("fetchhub-4", "dorado-1", "columbus-5");

  it("manual mode binds queries/write to active chain A", () => {
    const binding = resolveTokenAddBinding("fetchhub-4", reg, undefined);
    expect(binding).toEqual({
      mode: "manual",
      effectiveChainId: "fetchhub-4",
      writePath: "addToken",
    });
    expect(binding.mode).toBe("manual");
    if (binding.mode !== "manual") {
      return;
    }
    expect(planTokenAddSubmit(binding)).toEqual({
      type: "addToken",
      chainId: "fetchhub-4",
    });
    expect(planTokenAddReject(binding)).toBeNull();
  });

  it("suggested mode: authority A + token B binds to B and approves B", () => {
    const binding = resolveTokenAddBinding(
      "fetchhub-4",
      reg,
      waiting({ chainId: "dorado-1", contractAddress: CONTRACT_B })
    );
    expect(binding.mode).toBe("suggested");
    if (binding.mode !== "suggested") {
      return;
    }
    expect(binding.effectiveChainId).toBe("dorado-1");
    expect(binding.waitingChainId).toBe("dorado-1");
    expect(binding.writePath).toBe("approveSuggested");
    expect(binding.contractAddress).toBe(CONTRACT_B);

    expect(planTokenAddSubmit(binding)).toEqual({
      type: "approveSuggested",
      interactionId: "token-interaction-1",
      chainId: "dorado-1",
      destinationChainId: "dorado-1",
    });
  });

  it("suggested write path does not depend on ?interaction= (crossover closed)", () => {
    const binding = resolveTokenAddBinding(
      "fetchhub-4",
      reg,
      waiting({ chainId: "dorado-1" })
    );
    // Page must use binding.writePath, not interactionInfo.interaction.
    expect(binding.mode).toBe("suggested");
    if (binding.mode !== "suggested") {
      return;
    }
    expect(binding.writePath).toBe("approveSuggested");
    expect(planTokenAddSubmit(binding).type).toBe("approveSuggested");
    expect(planTokenAddSubmit(binding).type).not.toBe("addToken");
  });

  it("reject plans interaction id for suggested (and unresolved) modes", () => {
    const ok = resolveTokenAddBinding(
      "fetchhub-4",
      reg,
      waiting({ id: "tok-9", chainId: "dorado-1" })
    );
    expect(planTokenAddReject(ok)).toEqual({
      type: "rejectSuggested",
      interactionId: "tok-9",
    });

    const bad = resolveTokenAddBinding(
      "fetchhub-4",
      reg,
      waiting({ id: "tok-bad", chainId: "missing-1" })
    );
    expect(bad.mode).toBe("suggested_unresolved");
    expect(planTokenAddReject(bad)).toEqual({
      type: "rejectSuggested",
      interactionId: "tok-bad",
    });
  });

  it("concurrent authority A→C during suggested approve still targets B", () => {
    const suggestion = waiting({ chainId: "dorado-1" });
    const whileAuthorityA = resolveTokenAddBinding(
      "fetchhub-4",
      reg,
      suggestion
    );
    const whileAuthorityC = resolveTokenAddBinding(
      "columbus-5",
      reg,
      suggestion
    );

    expect(whileAuthorityA.mode).toBe("suggested");
    expect(whileAuthorityC.mode).toBe("suggested");
    if (
      whileAuthorityA.mode !== "suggested" ||
      whileAuthorityC.mode !== "suggested"
    ) {
      return;
    }

    expect(whileAuthorityA.effectiveChainId).toBe("dorado-1");
    expect(whileAuthorityC.effectiveChainId).toBe("dorado-1");
    expect(planTokenAddSubmit(whileAuthorityC)).toEqual({
      type: "approveSuggested",
      interactionId: "token-interaction-1",
      chainId: "dorado-1",
      destinationChainId: "dorado-1",
    });
    // Active chain is never the write destination when suggestion is for B.
    expect(planTokenAddSubmit(whileAuthorityC)).not.toEqual(
      expect.objectContaining({ chainId: "columbus-5" })
    );
  });

  it("never invokes Select / Persist APIs while resolving binding", () => {
    const selectChainAndPersist = jest.fn();
    const selectChain = jest.fn();
    // Do not object-spread a getter: assign/spread invokes getters.
    const poisonedRegistry = {
      chainInfos: [{ chainId: "fetchhub-4" }, { chainId: "dorado-1" }] as any,
      selectChainAndPersist,
      selectChain,
      get selectedChainId() {
        throw new Error("must not read selectedChainId");
      },
    };

    resolveTokenAddBinding(
      "fetchhub-4",
      poisonedRegistry,
      waiting({ chainId: "dorado-1" })
    );
    resolveTokenAddBinding("fetchhub-4", poisonedRegistry, undefined);
    const suggested = resolveTokenAddBinding(
      "fetchhub-4",
      poisonedRegistry,
      waiting({ chainId: "dorado-1" })
    );
    expect(suggested.mode).toBe("suggested");
    if (suggested.mode === "suggested") {
      planTokenAddSubmit(suggested);
    }
    planTokenAddReject(
      resolveTokenAddBinding(
        "fetchhub-4",
        poisonedRegistry,
        waiting({ chainId: "dorado-1" })
      )
    );

    expect(selectChainAndPersist).not.toHaveBeenCalled();
    expect(selectChain).not.toHaveBeenCalled();
  });
});

describe("duplicate check uses effective (request) chain currencies", () => {
  it("detects duplicate on chain B currencies only", () => {
    const currenciesOnB = [{ coinDenom: "TKN", contractAddress: CONTRACT_B }];
    const currenciesOnA = [
      { coinDenom: "OTHER", contractAddress: "fetch1other" },
    ];

    expect(isContractAlreadyAdded(currenciesOnB, CONTRACT_B)).toBe(true);
    expect(isContractAlreadyAdded(currenciesOnA, CONTRACT_B)).toBe(false);
    expect(
      isContractAlreadyAdded(currenciesOnB, CONTRACT_B.toUpperCase())
    ).toBe(true);
  });
});

describe("account readiness gate A≠B", () => {
  it("CW20/ERC20 submit does not require ready account", () => {
    expect(
      tokenAddSubmitRequiresReadyAccount({
        isSecret20: false,
        isImportingViewingKey: false,
      })
    ).toBe(false);
  });

  it("Secret20 create-viewing-key requires ready account on request chain", () => {
    expect(
      tokenAddSubmitRequiresReadyAccount({
        isSecret20: true,
        isImportingViewingKey: false,
      })
    ).toBe(true);
  });

  it("Secret20 importing viewing key does not require ready account", () => {
    expect(
      tokenAddSubmitRequiresReadyAccount({
        isSecret20: true,
        isImportingViewingKey: true,
      })
    ).toBe(false);
  });

  it("request-scoped account must be inited when NotInit (A≠B)", () => {
    expect(shouldInitTokenAddAccount("NotInit")).toBe(true);
    expect(shouldInitTokenAddAccount("Loading")).toBe(false);
    expect(shouldInitTokenAddAccount("Loaded")).toBe(false);
  });
});

describe("assertTokenAddApproveStillValid", () => {
  it("accepts unchanged waiting identity", () => {
    expect(() =>
      assertTokenAddApproveStillValid(
        waiting(),
        "token-interaction-1",
        "dorado-1"
      )
    ).not.toThrow();
  });

  it("fails when concurrent request replaces waiting", () => {
    expect(() =>
      assertTokenAddApproveStillValid(
        waiting({ id: "token-interaction-2", chainId: "fetchhub-4" }),
        "token-interaction-1",
        "dorado-1"
      )
    ).toThrow("Suggested token request was replaced or cancelled");
  });

  it("fails when chain id on waiting changed", () => {
    expect(() =>
      assertTokenAddApproveStillValid(
        waiting({ chainId: "fetchhub-4" }),
        "token-interaction-1",
        "dorado-1"
      )
    ).toThrow("Suggested token chain id changed");
  });
});
