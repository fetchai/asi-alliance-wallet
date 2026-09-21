import { afterBlockfrostCredentialsChanged } from "./blockfrost-credentials-post-save";
import { resetBlockfrostRateLimitTelemetry } from "@keplr-wallet/cardano";

jest.mock("@keplr-wallet/cardano", () => {
  const actual = jest.requireActual("@keplr-wallet/cardano");
  return {
    ...actual,
    resetBlockfrostRateLimitTelemetry: jest.fn(),
  };
});

describe("afterBlockfrostCredentialsChanged", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reinitializes only when edited chain is selected and registered", async () => {
    const reinitializeCardanoService = jest.fn().mockResolvedValue(undefined);
    const keyRingService = {
      chainsService: {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preprod"),
      },
      isRegisteredCardanoChain: jest.fn().mockResolvedValue(true),
      reinitializeCardanoService,
    } as any;

    await afterBlockfrostCredentialsChanged({
      chainId: "cardano-preprod",
      network: "preprod",
      keyRingService,
    });

    expect(resetBlockfrostRateLimitTelemetry).toHaveBeenCalledWith("Preprod");
    expect(reinitializeCardanoService).toHaveBeenCalledWith("cardano-preprod");
  });

  it("does not throw when post-save reinit fails", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const reinitializeCardanoService = jest
      .fn()
      .mockRejectedValue(new Error("provider_unavailable"));
    const keyRingService = {
      chainsService: {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preprod"),
      },
      isRegisteredCardanoChain: jest.fn().mockResolvedValue(true),
      reinitializeCardanoService,
    } as any;

    await expect(
      afterBlockfrostCredentialsChanged({
        chainId: "cardano-preprod",
        network: "preprod",
        keyRingService,
      })
    ).resolves.toBeUndefined();

    expect(resetBlockfrostRateLimitTelemetry).toHaveBeenCalledWith("Preprod");
    expect(warnSpy).toHaveBeenCalledWith(
      "[Cardano] Failed to refresh runtime after Blockfrost credentials change"
    );
    expect(
      JSON.stringify(warnSpy.mock.calls).includes("provider_unavailable")
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it("resets telemetry but skips reinit for non-selected chain", async () => {
    const reinitializeCardanoService = jest.fn().mockResolvedValue(undefined);
    const keyRingService = {
      chainsService: {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
      },
      isRegisteredCardanoChain: jest.fn().mockResolvedValue(true),
      reinitializeCardanoService,
    } as any;

    await afterBlockfrostCredentialsChanged({
      chainId: "cardano-preprod",
      network: "preprod",
      keyRingService,
    });

    expect(resetBlockfrostRateLimitTelemetry).toHaveBeenCalledWith("Preprod");
    expect(reinitializeCardanoService).not.toHaveBeenCalled();
  });
});
