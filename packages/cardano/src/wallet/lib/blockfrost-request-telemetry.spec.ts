import {
  clearCardanoRuntimeTelemetryForTests,
  getCardanoRuntimeTelemetryActiveCount,
  getCardanoRuntimeTelemetryDisposedCount,
  installBlockfrostRequestTelemetry,
  markCardanoRuntimeAttached,
  markCardanoRuntimeDisposed,
  resetBlockfrostRateLimitTelemetry,
  toRuntimeRegistryKey,
} from "./blockfrost-request-telemetry";

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
