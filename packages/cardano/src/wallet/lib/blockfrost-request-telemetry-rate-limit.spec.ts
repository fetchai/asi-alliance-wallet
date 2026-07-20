import {
  clearCardanoRuntimeTelemetryForTests,
  installBlockfrostRequestTelemetry,
  wasRateLimitedRecently,
} from "./blockfrost-request-telemetry";

const storeKey = "__cardanoBlockfrostTelemetryStore";
const apiKey = "__cardanoBlockfrostTelemetry";

describe("wasRateLimitedRecently", () => {
  afterEach(() => {
    clearCardanoRuntimeTelemetryForTests();
    delete (globalThis as Record<string, unknown>)[storeKey];
    delete (globalThis as Record<string, unknown>)[apiKey];
  });

  it("returns false when a recent failure has burst-throttle HTTP 429", () => {
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[storeKey] = {
      active: new Map([
        [
          "Preprod::rt1",
          {
            attached: true,
            chainName: "Preprod",
            collector: {
              getSnapshot: () => ({
                failures: [
                  {
                    callerTag: "test",
                    endpoint: "network",
                    kind: "network",
                    ms: 10,
                    sourceTag: "direct-client",
                    status: 429,
                    timestamp: Date.now(),
                  },
                ],
              }),
              reset: jest.fn(),
            },
            disposed: false,
            registryKey: "Preprod::rt1",
            runtimeInstanceId: "rt1",
          },
        ],
      ]),
      disposed: [],
    };

    expect(wasRateLimitedRecently("Preprod")).toBe(false);
  });

  it("returns true when a recent failure has quota-exceeded HTTP 402", () => {
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[storeKey] = {
      active: new Map([
        [
          "Preprod::rt1",
          {
            attached: true,
            chainName: "Preprod",
            collector: {
              getSnapshot: () => ({
                failures: [
                  {
                    callerTag: "test",
                    endpoint: "network",
                    kind: "network",
                    ms: 10,
                    sourceTag: "direct-client",
                    status: 402,
                    timestamp: Date.now(),
                  },
                ],
              }),
              reset: jest.fn(),
            },
            disposed: false,
            registryKey: "Preprod::rt1",
            runtimeInstanceId: "rt1",
          },
        ],
      ]),
      disposed: [],
    };

    expect(wasRateLimitedRecently("Preprod")).toBe(true);
  });

  it("returns false when failures are outside the recent window", () => {
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[storeKey] = {
      active: new Map([
        [
          "Preprod::rt1",
          {
            attached: true,
            chainName: "Preprod",
            collector: {
              getSnapshot: () => ({
                failures: [
                  {
                    callerTag: "test",
                    endpoint: "network",
                    kind: "network",
                    ms: 10,
                    sourceTag: "direct-client",
                    status: 429,
                    timestamp: Date.now() - 60 * 60 * 1000,
                  },
                ],
              }),
              reset: jest.fn(),
            },
            disposed: false,
            registryKey: "Preprod::rt1",
            runtimeInstanceId: "rt1",
          },
        ],
      ]),
      disposed: [],
    };

    expect(wasRateLimitedRecently("Preprod")).toBe(false);
  });

  it("returns true when telemetry records nested response.status 402", async () => {
    const blockfrostClient = {
      request: jest.fn().mockRejectedValue({ response: { status: 402 } }),
    };

    installBlockfrostRequestTelemetry({
      blockfrostClient: blockfrostClient as any,
      chainName: "Preprod",
      logger: { debug: jest.fn(), warn: jest.fn() } as any,
      runtimeInstanceId: "rt_nested",
    });

    await expect(blockfrostClient.request("network")).rejects.toEqual({
      response: { status: 402 },
    });

    expect(wasRateLimitedRecently("Preprod")).toBe(true);
  });

  it("aggregates rate-limit failures across multiple instances of a chain", () => {
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[storeKey] = {
      active: new Map([
        [
          "Preprod::old",
          {
            attached: false,
            chainName: "Preprod",
            collector: {
              getSnapshot: () => ({ failures: [] }),
              reset: jest.fn(),
            },
            disposed: false,
            registryKey: "Preprod::old",
            runtimeInstanceId: "old",
          },
        ],
        [
          "Preprod::new",
          {
            attached: true,
            chainName: "Preprod",
            collector: {
              getSnapshot: () => ({
                failures: [
                  {
                    callerTag: "test",
                    endpoint: "network",
                    kind: "network",
                    ms: 10,
                    sourceTag: "direct-client",
                    status: 402,
                    timestamp: Date.now(),
                  },
                ],
              }),
              reset: jest.fn(),
            },
            disposed: false,
            registryKey: "Preprod::new",
            runtimeInstanceId: "new",
          },
        ],
      ]),
      disposed: [],
    };

    expect(wasRateLimitedRecently("Preprod")).toBe(true);
  });
});
