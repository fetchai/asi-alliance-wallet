import {
  clearBlockfrostRequestGuardForTests,
  installBlockfrostRequestGuard,
  markCardanoRuntimeDisposed,
  wasRateLimitedRecently,
} from "./blockfrost-request-guard";
import {
  CardanoRuntimeInactiveError,
  createCardanoRuntimeLease,
} from "../../runtime-lease";

describe("request-time runtime lease guard", () => {
  afterEach(() => {
    clearBlockfrostRequestGuardForTests();
  });

  const makeAuthority = (state: {
    chainId: string | null;
    revision: number | null;
    generation: number;
  }) => ({
    getChainId: () => state.chainId,
    getRevision: () => state.revision,
    getRuntimeGeneration: () => state.generation,
  });

  it("calls rawRequest once when lease is active", async () => {
    const rawRequest = jest.fn().mockResolvedValue({ ok: true });
    const client = { request: rawRequest };
    const state = {
      chainId: "cardano-preprod",
      revision: 1,
      generation: 1,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      authority: makeAuthority(state),
    });

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_active",
      runtimeLease: lease,
      chainId: "cardano-preprod",
      runtimeGeneration: 1,
      ownerSwitchGeneration: 1,
    });

    await expect(client.request("network")).resolves.toEqual({ ok: true });
    expect(rawRequest).toHaveBeenCalledTimes(1);
  });

  it("blocks rawRequest when lease is revoked", async () => {
    const rawRequest = jest.fn().mockResolvedValue({ ok: true });
    const client = { request: rawRequest };
    const state = {
      chainId: "cardano-preprod",
      revision: 1,
      generation: 1,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      authority: makeAuthority(state),
    });

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_revoked",
      runtimeLease: lease,
      chainId: "cardano-preprod",
    });

    lease.revoke("authority_commit");

    await expect(client.request("network")).rejects.toBeInstanceOf(
      CardanoRuntimeInactiveError
    );
    expect(rawRequest).not.toHaveBeenCalled();
  });

  it("blocks rawRequest when manager is disposed", async () => {
    const rawRequest = jest.fn().mockResolvedValue({ ok: true });
    const client = { request: rawRequest };

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_disposed",
      chainId: "cardano-preprod",
      runtimeGeneration: 1,
      ownerSwitchGeneration: 1,
    });

    markCardanoRuntimeDisposed("rt_disposed");

    await expect(client.request("network")).rejects.toBeInstanceOf(
      CardanoRuntimeInactiveError
    );
    expect(rawRequest).not.toHaveBeenCalled();
  });

  it("keeps dispose gate after Map entry is pruned", async () => {
    const rawRequest = jest.fn().mockResolvedValue({ ok: true });
    const client = { request: rawRequest };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      authority: makeAuthority({
        chainId: "cardano-preprod",
        revision: 1,
        generation: 1,
      }),
    });

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_prune",
      runtimeLease: lease,
      chainId: "cardano-preprod",
    });

    markCardanoRuntimeDisposed("rt_prune");
    // Second mark is a no-op once the Map entry is gone.
    markCardanoRuntimeDisposed("rt_prune");

    await expect(client.request("network")).rejects.toMatchObject({
      reason: "disposed",
    });
    expect(rawRequest).not.toHaveBeenCalled();
  });

  it("blocks rawRequest on stale revision with matching chain", async () => {
    const rawRequest = jest.fn().mockResolvedValue({ ok: true });
    const client = { request: rawRequest };
    const state = {
      chainId: "cardano-preprod",
      revision: 1,
      generation: 1,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      authority: makeAuthority(state),
    });

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_stale_rev",
      runtimeLease: lease,
    });

    state.revision = 2;

    await expect(client.request("network")).rejects.toMatchObject({
      reason: "authority_mismatch",
    });
    expect(rawRequest).not.toHaveBeenCalled();
  });

  it("blocks rawRequest on stale generation with matching chain/revision", async () => {
    const rawRequest = jest.fn().mockResolvedValue({ ok: true });
    const client = { request: rawRequest };
    const state = {
      chainId: "cardano-preprod",
      revision: 1,
      generation: 1,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      authority: makeAuthority(state),
    });

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_stale_gen",
      runtimeLease: lease,
    });

    state.generation = 2;

    await expect(client.request("network")).rejects.toMatchObject({
      reason: "generation_mismatch",
    });
    expect(rawRequest).not.toHaveBeenCalled();
  });

  it("allows in-flight request started before revoke to finish", async () => {
    let resolveRaw!: (value: { ok: boolean }) => void;
    const rawRequest = jest.fn(
      (..._args: unknown[]) =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveRaw = resolve;
        })
    );
    const client = {
      request: rawRequest as (
        endpoint: string,
        ...args: unknown[]
      ) => Promise<{ ok: boolean }>,
    };
    const state = {
      chainId: "cardano-preprod",
      revision: 1,
      generation: 1,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      authority: makeAuthority(state),
    });

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_inflight",
      runtimeLease: lease,
    });

    const inFlight = client.request("network");
    expect(rawRequest).toHaveBeenCalledTimes(1);

    lease.revoke("authority_commit");

    await expect(client.request("txs")).rejects.toBeInstanceOf(
      CardanoRuntimeInactiveError
    );
    expect(rawRequest).toHaveBeenCalledTimes(1);

    resolveRaw({ ok: true });
    await expect(inFlight).resolves.toEqual({ ok: true });
  });

  it("does not record inactive-runtime blocks as rate-limit failures", async () => {
    const rawRequest = jest.fn().mockResolvedValue({ ok: true });
    const client = { request: rawRequest };
    const state = {
      chainId: "cardano-preprod",
      revision: 1,
      generation: 1,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      authority: makeAuthority(state),
    });

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_no_rl",
      runtimeLease: lease,
      chainId: "cardano-preprod",
    });

    lease.revoke("authority_commit");
    await expect(client.request("network")).rejects.toBeInstanceOf(
      CardanoRuntimeInactiveError
    );

    expect(wasRateLimitedRecently("Preprod")).toBe(false);
  });

  it("blocks duck-typed inactive errors", async () => {
    const rawRequest = jest.fn().mockResolvedValue({ ok: true });
    const client = { request: rawRequest };
    const duckLease = {
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      signal: new AbortController().signal,
      assertActive: () => {
        const err = new Error("inactive from other module copy") as Error & {
          code: string;
          reason: string;
          expectedChainId: string;
          expectedRevision: number;
          expectedGeneration: number;
        };
        err.code = "cardano_runtime_inactive";
        err.reason = "revoked";
        err.expectedChainId = "cardano-preprod";
        err.expectedRevision = 1;
        err.expectedGeneration = 1;
        throw err;
      },
    };

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_duck",
      runtimeLease: duckLease as any,
      chainId: "cardano-preprod",
    });

    await expect(client.request("network")).rejects.toMatchObject({
      code: "cardano_runtime_inactive",
      reason: "revoked",
    });
    expect(rawRequest).not.toHaveBeenCalled();
  });
});
