import {
  installBlockfrostRequestTelemetry,
  wasRateLimitedRecently,
} from "./blockfrost-request-telemetry";

const registryKey = "__cardanoBlockfrostTelemetryRegistry";

describe("wasRateLimitedRecently", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[registryKey];
  });

  it("returns false when a recent failure has burst-throttle HTTP 429", () => {
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[registryKey] = new Map([
      [
        "Preprod",
        {
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
      ],
    ]);

    expect(wasRateLimitedRecently("Preprod")).toBe(false);
  });

  it("returns true when a recent failure has quota-exceeded HTTP 402", () => {
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[registryKey] = new Map([
      [
        "Preprod",
        {
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
      ],
    ]);

    expect(wasRateLimitedRecently("Preprod")).toBe(true);
  });

  it("returns false when failures are outside the recent window", () => {
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[registryKey] = new Map([
      [
        "Preprod",
        {
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
      ],
    ]);

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
    });

    await expect(blockfrostClient.request("network")).rejects.toEqual({
      response: { status: 402 },
    });

    expect(wasRateLimitedRecently("Preprod")).toBe(true);
  });
});
