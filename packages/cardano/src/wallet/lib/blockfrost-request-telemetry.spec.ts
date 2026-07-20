import {
  clearCardanoRuntimeTelemetryForTests,
  getCardanoRuntimeTelemetryActiveCount,
  getCardanoRuntimeTelemetryDisposedCount,
  installBlockfrostRequestTelemetry,
  markCardanoRuntimeAttached,
  markCardanoRuntimeDisposed,
  resetBlockfrostRateLimitTelemetry,
  toRuntimeRegistryKey,
  wasRateLimitedRecently,
} from "./blockfrost-request-telemetry";
import {
  CardanoRuntimeInactiveError,
  createCardanoRuntimeLease,
} from "../../runtime-lease";

const storeKey = "__cardanoBlockfrostTelemetryStore";
const apiKey = "__cardanoBlockfrostTelemetry";

describe("resetBlockfrostRateLimitTelemetry", () => {
  afterEach(() => {
    clearCardanoRuntimeTelemetryForTests();
    delete (globalThis as Record<string, unknown>)[storeKey];
    delete (globalThis as Record<string, unknown>)[apiKey];
  });

  it("resets telemetry collectors for all instances of a chain", () => {
    const resetA = jest.fn();
    const resetB = jest.fn();
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[storeKey] = {
      active: new Map([
        [
          toRuntimeRegistryKey("Preprod", "a"),
          {
            attached: true,
            chainName: "Preprod",
            collector: { getSnapshot: jest.fn(), reset: resetA },
            disposed: false,
            registryKey: toRuntimeRegistryKey("Preprod", "a"),
            runtimeInstanceId: "a",
          },
        ],
        [
          toRuntimeRegistryKey("Preprod", "b"),
          {
            attached: false,
            chainName: "Preprod",
            collector: { getSnapshot: jest.fn(), reset: resetB },
            disposed: false,
            registryKey: toRuntimeRegistryKey("Preprod", "b"),
            runtimeInstanceId: "b",
          },
        ],
      ]),
      disposed: [],
    };

    resetBlockfrostRateLimitTelemetry("Preprod");

    expect(resetA).toHaveBeenCalledTimes(1);
    expect(resetB).toHaveBeenCalledTimes(1);
  });
});

describe("runtime instance registry", () => {
  afterEach(() => {
    clearCardanoRuntimeTelemetryForTests();
  });

  it("keeps two runtimes for the same chainName without overwrite", async () => {
    const clientA = {
      request: jest.fn().mockResolvedValue({ ok: true }),
    };
    const clientB = {
      request: jest.fn().mockResolvedValue({ ok: true }),
    };
    const logger = { debug: jest.fn(), warn: jest.fn() } as any;

    const idA = installBlockfrostRequestTelemetry({
      blockfrostClient: clientA as any,
      chainName: "Preprod",
      logger,
      runtimeInstanceId: "rt_a",
      createdBy: "restore",
    });
    const idB = installBlockfrostRequestTelemetry({
      blockfrostClient: clientB as any,
      chainName: "Preprod",
      logger,
      runtimeInstanceId: "rt_b",
      createdBy: "syncStatus",
    });

    expect(idA).toBe("rt_a");
    expect(idB).toBe("rt_b");
    expect(getCardanoRuntimeTelemetryActiveCount()).toBe(2);

    await clientA.request("network");
    await clientB.request("network");

    const telemetry = (globalThis as Record<string, unknown>)[apiKey] as {
      getAllSnapshots: () => Record<string, { totals: { count: number } }>;
    };
    const snapshots = telemetry.getAllSnapshots();
    expect(Object.keys(snapshots).sort()).toEqual([
      "Preprod::rt_a",
      "Preprod::rt_b",
    ]);
    expect(snapshots["Preprod::rt_a"].totals.count).toBe(1);
    expect(snapshots["Preprod::rt_b"].totals.count).toBe(1);
  });

  it("moves disposed runtimes into a bounded disposed ring", async () => {
    const logger = { debug: jest.fn(), warn: jest.fn() } as any;
    for (let i = 0; i < 3; i++) {
      const client = {
        request: jest.fn().mockResolvedValue({}),
      };
      installBlockfrostRequestTelemetry({
        blockfrostClient: client as any,
        chainName: "Mainnet",
        logger,
        runtimeInstanceId: `rt_${i}`,
      });
      markCardanoRuntimeAttached(`rt_${i}`);
      markCardanoRuntimeDisposed(`rt_${i}`);
    }

    expect(getCardanoRuntimeTelemetryActiveCount()).toBe(0);
    expect(getCardanoRuntimeTelemetryDisposedCount()).toBe(3);

    const telemetry = (globalThis as Record<string, unknown>)[apiKey] as {
      getDisposedRuntimes: () => Array<{ disposed?: boolean }>;
    };
    expect(
      telemetry.getDisposedRuntimes().every((snapshot) => snapshot.disposed)
    ).toBe(true);
  });

  it("clears active telemetry when markDisposed runs after failed create registration", () => {
    const logger = { debug: jest.fn(), warn: jest.fn() } as any;
    installBlockfrostRequestTelemetry({
      blockfrostClient: { request: jest.fn() } as any,
      chainName: "Preprod",
      logger,
      runtimeInstanceId: "rt_failed_create",
      runtimeGeneration: 7,
      ownerSwitchGeneration: 3,
      chainId: "cardano-preprod",
    });

    expect(getCardanoRuntimeTelemetryActiveCount()).toBe(1);
    markCardanoRuntimeDisposed("rt_failed_create");
    expect(getCardanoRuntimeTelemetryActiveCount()).toBe(0);
    expect(getCardanoRuntimeTelemetryDisposedCount()).toBe(1);
  });
});

describe("request-time runtime lease guard", () => {
  afterEach(() => {
    clearCardanoRuntimeTelemetryForTests();
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

    installBlockfrostRequestTelemetry({
      blockfrostClient: client as any,
      chainName: "Preprod",
      logger: { debug: jest.fn(), warn: jest.fn() } as any,
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

    installBlockfrostRequestTelemetry({
      blockfrostClient: client as any,
      chainName: "Preprod",
      logger: { debug: jest.fn(), warn: jest.fn() } as any,
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

    installBlockfrostRequestTelemetry({
      blockfrostClient: client as any,
      chainName: "Preprod",
      logger: { debug: jest.fn(), warn: jest.fn() } as any,
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

    installBlockfrostRequestTelemetry({
      blockfrostClient: client as any,
      chainName: "Preprod",
      logger: { debug: jest.fn(), warn: jest.fn() } as any,
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

    installBlockfrostRequestTelemetry({
      blockfrostClient: client as any,
      chainName: "Preprod",
      logger: { debug: jest.fn(), warn: jest.fn() } as any,
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

    installBlockfrostRequestTelemetry({
      blockfrostClient: client as any,
      chainName: "Preprod",
      logger: { debug: jest.fn(), warn: jest.fn() } as any,
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

    installBlockfrostRequestTelemetry({
      blockfrostClient: client as any,
      chainName: "Preprod",
      logger: { debug: jest.fn(), warn: jest.fn() } as any,
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

  it("blocks duck-typed inactive errors when debug telemetry is off", async () => {
    const previous = process.env["CARDANO_RUNTIME_TELEMETRY"];
    process.env["CARDANO_RUNTIME_TELEMETRY"] = "0";

    try {
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

      installBlockfrostRequestTelemetry({
        blockfrostClient: client as any,
        chainName: "Preprod",
        logger: { debug: jest.fn(), warn: jest.fn() } as any,
        runtimeInstanceId: "rt_duck",
        runtimeLease: duckLease as any,
        chainId: "cardano-preprod",
      });

      await expect(client.request("network")).rejects.toMatchObject({
        code: "cardano_runtime_inactive",
      });
      expect(rawRequest).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env["CARDANO_RUNTIME_TELEMETRY"];
      } else {
        process.env["CARDANO_RUNTIME_TELEMETRY"] = previous;
      }
    }
  });
});
