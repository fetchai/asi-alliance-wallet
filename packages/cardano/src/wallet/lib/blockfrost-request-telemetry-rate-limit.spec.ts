import {
  clearBlockfrostRequestGuardForTests,
  installBlockfrostRequestGuard,
  resetBlockfrostRateLimitTelemetry,
  wasRateLimitedRecently,
} from "./blockfrost-request-guard";

describe("wasRateLimitedRecently", () => {
  afterEach(() => {
    clearBlockfrostRequestGuardForTests();
  });

  it("is false before any quota failure", () => {
    expect(wasRateLimitedRecently("Preprod")).toBe(false);
  });

  it("returns false when a recent failure has burst-throttle HTTP 429", async () => {
    const rawRequest = jest.fn().mockRejectedValue({ status: 429 });
    const client = { request: rawRequest };

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_burst",
    });

    await expect(client.request("network")).rejects.toEqual({ status: 429 });
    expect(wasRateLimitedRecently("Preprod")).toBe(false);
  });

  it("returns true when a recent failure has quota-exceeded HTTP 402", async () => {
    const rawRequest = jest.fn().mockRejectedValue({ status: 402 });
    const client = { request: rawRequest };

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_quota",
    });

    await expect(client.request("network")).rejects.toEqual({ status: 402 });
    expect(wasRateLimitedRecently("Preprod")).toBe(true);
  });

  it("returns true when nested response.status is 402", async () => {
    const rawRequest = jest
      .fn()
      .mockRejectedValue({ response: { status: 402 } });
    const client = { request: rawRequest };

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_nested",
    });

    await expect(client.request("network")).rejects.toEqual({
      response: { status: 402 },
    });
    expect(wasRateLimitedRecently("Preprod")).toBe(true);
  });

  it("returns false when nested response.status is burst-throttle 429", async () => {
    const rawRequest = jest
      .fn()
      .mockRejectedValue({ response: { status: 429 } });
    const client = { request: rawRequest };

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_nested_burst",
    });

    await expect(client.request("network")).rejects.toEqual({
      response: { status: 429 },
    });
    expect(wasRateLimitedRecently("Preprod")).toBe(false);
  });

  it("reset clears recent quota for the chain", async () => {
    const rawRequest = jest.fn().mockRejectedValue({ status: 402 });
    const client = { request: rawRequest };

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_rl_reset",
    });

    await expect(client.request("network")).rejects.toEqual({ status: 402 });
    expect(wasRateLimitedRecently("Preprod")).toBe(true);

    resetBlockfrostRateLimitTelemetry("Preprod");
    expect(wasRateLimitedRecently("Preprod")).toBe(false);
  });

  it("does not cross-contaminate chains", async () => {
    const rawRequest = jest.fn().mockRejectedValue({ status: 402 });
    const client = { request: rawRequest };

    installBlockfrostRequestGuard({
      blockfrostClient: client as any,
      chainName: "Preprod",
      runtimeInstanceId: "rt_rl_preprod",
    });

    await expect(client.request("network")).rejects.toEqual({ status: 402 });
    expect(wasRateLimitedRecently("Preprod")).toBe(true);
    expect(wasRateLimitedRecently("Mainnet")).toBe(false);
  });
});
