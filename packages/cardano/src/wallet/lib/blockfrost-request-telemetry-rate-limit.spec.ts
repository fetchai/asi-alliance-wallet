import { wasRateLimitedRecently } from "./blockfrost-request-telemetry";

const registryKey = "__cardanoBlockfrostTelemetryRegistry";

describe("wasRateLimitedRecently", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[registryKey];
  });

  it("returns true when a recent failure has a rate-limit HTTP status", () => {
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
});
