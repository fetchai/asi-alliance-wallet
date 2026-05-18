import { resetBlockfrostRateLimitTelemetry } from "./blockfrost-request-telemetry";

const registryKey = "__cardanoBlockfrostTelemetryRegistry";

describe("resetBlockfrostRateLimitTelemetry", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[registryKey];
  });

  it("resets telemetry collector for the given chain", () => {
    const reset = jest.fn();
    const globalScope = globalThis as Record<string, unknown>;
    globalScope[registryKey] = new Map([
      ["Preprod", { getSnapshot: jest.fn(), reset }],
    ]);

    resetBlockfrostRateLimitTelemetry("Preprod");

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
