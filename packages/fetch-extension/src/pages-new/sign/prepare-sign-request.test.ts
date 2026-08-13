import {
  assertSignApproveStillValid,
  prepareSignRequest,
  requiresCardanoLiveNetworkSwitch,
  type SignWaitingPayload,
} from "./prepare-sign-request";
import { SignDocWrapper } from "@keplr-wallet/cosmos";

function aminoWrapper(chainId: string): SignDocWrapper {
  return SignDocWrapper.fromAminoSignDoc({
    chain_id: chainId,
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "1" },
    msgs: [],
    memo: "",
  });
}

function waiting(partial: {
  id?: string;
  chainId: string;
  signDocChainId?: string;
  isADR36?: boolean;
}): SignWaitingPayload {
  const signDocChainId = partial.signDocChainId ?? partial.chainId;
  const wrapper = aminoWrapper(signDocChainId);
  if (partial.isADR36) {
    Object.defineProperty(wrapper, "isADR36SignDoc", {
      get: () => true,
    });
  }
  return {
    id: partial.id ?? "interaction-1",
    isInternal: false,
    data: {
      chainId: partial.chainId,
      msgOrigin: "https://dapp.example",
      signer: "fetch1signer",
      signDocWrapper: wrapper,
      signOptions: {},
    },
  };
}

describe("prepareSignRequest", () => {
  const registry = {
    chainInfos: [
      { chainId: "fetchhub-4" },
      { chainId: "dorado-1" },
      { chainId: "cardano-preprod" },
    ],
  } as any;

  it("resolves requested chain without requiring active selection", () => {
    const result = prepareSignRequest(
      registry,
      waiting({ chainId: "dorado-1" })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requested.chainInfo.chainId).toBe("dorado-1");
      expect(result.interactionId).toBe("interaction-1");
    }
  });

  it("fails closed on strict signDoc chain mismatch", () => {
    const result = prepareSignRequest(
      registry,
      waiting({ chainId: "dorado-1", signDocChainId: "fetchhub-4" })
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "chain_id_unmatched",
        expected: "dorado-1",
        actual: "fetchhub-4",
      },
    });
  });

  it("skips strict signDoc match for ADR-36", () => {
    const result = prepareSignRequest(
      registry,
      waiting({
        chainId: "dorado-1",
        signDocChainId: "fetchhub-4",
        isADR36: true,
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isADR36).toBe(true);
    }
  });

  it("detects replaced interaction id", () => {
    const result = prepareSignRequest(
      registry,
      waiting({ id: "b", chainId: "dorado-1" }),
      "a"
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "interaction_replaced" },
    });
  });

  it("fails for unknown requested chain", () => {
    const result = prepareSignRequest(
      registry,
      waiting({ chainId: "missing-1" })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("resolve_failed");
    }
  });

  it("treats concurrent A→B as interaction_replaced when expected id is stale", () => {
    const result = prepareSignRequest(
      registry,
      waiting({ id: "interaction-b", chainId: "cardano-preprod" }),
      "interaction-a"
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "interaction_replaced" },
    });
  });
});

describe("requiresCardanoLiveNetworkSwitch", () => {
  it("is false for Cardano ADR-36 even when authority differs", () => {
    expect(
      requiresCardanoLiveNetworkSwitch({
        requestedChainId: "cardano-preprod",
        authorityChainId: "fetchhub-4",
        isADR36: true,
      })
    ).toBe(false);
  });

  it("is true for live Cardano when authority differs and no ticket", () => {
    expect(
      requiresCardanoLiveNetworkSwitch({
        requestedChainId: "cardano-preprod",
        authorityChainId: "fetchhub-4",
        isADR36: false,
      })
    ).toBe(true);
  });

  it("is false for live Cardano when BG authority already matches", () => {
    expect(
      requiresCardanoLiveNetworkSwitch({
        requestedChainId: "cardano-preprod",
        authorityChainId: "cardano-preprod",
        isADR36: false,
      })
    ).toBe(false);
  });

  it("is false when BG switch ticket is valid under projection lag", () => {
    expect(
      requiresCardanoLiveNetworkSwitch({
        requestedChainId: "cardano-preprod",
        authorityChainId: "fetchhub-4",
        isADR36: false,
        switchTicketValid: true,
      })
    ).toBe(false);
  });

  it("is true when ticket is not valid even if authority differs", () => {
    expect(
      requiresCardanoLiveNetworkSwitch({
        requestedChainId: "cardano-preprod",
        authorityChainId: "fetchhub-4",
        isADR36: false,
        switchTicketValid: false,
      })
    ).toBe(true);
  });

  it("fails closed when BG authority unknown (do not trust UI projection)", () => {
    expect(
      requiresCardanoLiveNetworkSwitch({
        requestedChainId: "cardano-preprod",
        authorityChainId: undefined,
        isADR36: false,
        switchTicketValid: false,
      })
    ).toBe(true);
  });

  it("does not clear gate on lagging projection-shaped id without ticket", () => {
    // Regression P0: projection may still show requested after concurrent Select
    // while BG authority already moved — caller must pass BG authority, not
    // chainStore.selectedChainId. If a stale projection id were passed as
    // authorityChainId that would be a wiring bug; this asserts unknown≠match.
    expect(
      requiresCardanoLiveNetworkSwitch({
        requestedChainId: "cardano-preprod",
        authorityChainId: "dorado-1",
        isADR36: false,
        switchTicketValid: false,
      })
    ).toBe(true);
  });

  it("is false for non-Cardano requests", () => {
    expect(
      requiresCardanoLiveNetworkSwitch({
        requestedChainId: "dorado-1",
        authorityChainId: "fetchhub-4",
        isADR36: false,
      })
    ).toBe(false);
  });
});

describe("assertSignApproveStillValid", () => {
  it("throws when interaction was replaced", () => {
    expect(() =>
      assertSignApproveStillValid(
        waiting({ id: "2", chainId: "dorado-1" }),
        "1",
        "dorado-1"
      )
    ).toThrow(/replaced/);
  });

  it("passes when interaction and chain still match", () => {
    expect(() =>
      assertSignApproveStillValid(
        waiting({ id: "1", chainId: "dorado-1" }),
        "1",
        "dorado-1"
      )
    ).not.toThrow();
  });

  it("fails closed when waiting payload chainId drifts", () => {
    expect(() =>
      assertSignApproveStillValid(
        waiting({ id: "1", chainId: "fetchhub-4" }),
        "1",
        "dorado-1"
      )
    ).toThrow(/chain id changed/);
  });

  it("fails closed when Cardano live gate needs switch and ticket invalid", () => {
    expect(() =>
      assertSignApproveStillValid(
        waiting({ id: "1", chainId: "cardano-preprod" }),
        "1",
        "cardano-preprod",
        {
          requestedRegistryChainId: "cardano-preprod",
          authorityChainId: "fetchhub-4",
          isADR36: false,
          switchTicketValid: false,
        }
      )
    ).toThrow(/Cardano network switch required/);
  });

  it("fails closed when projection would match but BG authority does not", () => {
    expect(() =>
      assertSignApproveStillValid(
        waiting({ id: "1", chainId: "cardano-preprod" }),
        "1",
        "cardano-preprod",
        {
          requestedRegistryChainId: "cardano-preprod",
          // BG after concurrent Select; projection may still be cardano-preprod
          authorityChainId: "fetchhub-4",
          isADR36: false,
          switchTicketValid: false,
        }
      )
    ).toThrow(/Cardano network switch required/);
  });

  it("passes when switch ticket is valid under projection lag", () => {
    expect(() =>
      assertSignApproveStillValid(
        waiting({ id: "1", chainId: "cardano-preprod" }),
        "1",
        "cardano-preprod",
        {
          requestedRegistryChainId: "cardano-preprod",
          authorityChainId: "fetchhub-4",
          isADR36: false,
          switchTicketValid: true,
        }
      )
    ).not.toThrow();
  });

  it("does not require Cardano switch for ADR-36 on pre-approve", () => {
    expect(() =>
      assertSignApproveStillValid(
        waiting({ id: "1", chainId: "cardano-preprod", isADR36: true }),
        "1",
        "cardano-preprod",
        {
          requestedRegistryChainId: "cardano-preprod",
          authorityChainId: "fetchhub-4",
          isADR36: true,
        }
      )
    ).not.toThrow();
  });
});
