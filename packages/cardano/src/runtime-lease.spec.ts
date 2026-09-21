import {
  CardanoRuntimeInactiveError,
  createCardanoRuntimeLease,
} from "./runtime-lease";

describe("CardanoRuntimeLease", () => {
  const makeAuthority = (state: {
    chainId: string | null;
    revision: number | null;
    generation: number;
  }) => ({
    getChainId: () => state.chainId,
    getRevision: () => state.revision,
    getRuntimeGeneration: () => state.generation,
  });

  it("assertActive succeeds while ownership matches", () => {
    const state = {
      chainId: "cardano-preprod",
      revision: 2,
      generation: 5,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 2,
      runtimeGeneration: 5,
      authority: makeAuthority(state),
    });

    expect(() => lease.assertActive("test")).not.toThrow();
  });

  it("revoke blocks assertActive with revoked reason", () => {
    const state = {
      chainId: "cardano-preprod",
      revision: 2,
      generation: 5,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 2,
      runtimeGeneration: 5,
      authority: makeAuthority(state),
    });

    lease.revoke("authority_commit");
    expect(lease.signal.aborted).toBe(true);

    try {
      lease.assertActive("op");
      fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CardanoRuntimeInactiveError);
      expect((error as CardanoRuntimeInactiveError).reason).toBe("revoked");
      expect((error as CardanoRuntimeInactiveError).revokeReason).toBe(
        "authority_commit"
      );
    }
  });

  it("blocks on generation mismatch even when chain/revision match", () => {
    const state = {
      chainId: "cardano-preprod",
      revision: 2,
      generation: 5,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 2,
      runtimeGeneration: 5,
      authority: makeAuthority(state),
    });

    state.generation = 6;

    try {
      lease.assertActive("op");
      fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CardanoRuntimeInactiveError);
      expect((error as CardanoRuntimeInactiveError).reason).toBe(
        "generation_mismatch"
      );
    }
  });

  it("blocks on authority mismatch with matching generation", () => {
    const state = {
      chainId: "cardano-preprod",
      revision: 2,
      generation: 5,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 2,
      runtimeGeneration: 5,
      authority: makeAuthority(state),
    });

    state.chainId = "fetchhub-4";
    state.revision = 3;

    try {
      lease.assertActive("op");
      fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CardanoRuntimeInactiveError);
      expect((error as CardanoRuntimeInactiveError).reason).toBe(
        "authority_mismatch"
      );
    }
  });
});
