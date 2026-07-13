import { CardanoService } from "./service";

describe("CardanoService restoreFromKeyStore detached cleanup", () => {
  it("disposes wallet manager when restore completes after reset detached it", async () => {
    const service = new CardanoService();
    const dispose = jest.fn();
    const restoringKeyRing = {
      restore: jest.fn().mockImplementation(async () => {
        // Simulate reset() while restore is in flight: current pointer cleared,
        // but this local instance may still hold a live Blockfrost wallet.
        service["keyRing"] = undefined;
      }),
      isKeyAgentReady: jest.fn().mockReturnValue(true),
      getWalletManager: jest.fn().mockReturnValue({ dispose }),
    };
    service["keyRing"] = restoringKeyRing as any;

    await service.restoreFromKeyStore(
      {
        type: "mnemonic",
        meta: {},
        version: "1.2",
        curve: "ed25519",
        crypto: {},
      } as any,
      "pw"
    );

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(service["keyRing"]).toBeUndefined();
    expect(service["runtimeSessionId"]).toBe("");
  });

  it("does not dispose wallet manager when restore remains current", async () => {
    const service = new CardanoService();
    const dispose = jest.fn();
    const restoringKeyRing = {
      restore: jest.fn().mockResolvedValue(undefined),
      isKeyAgentReady: jest.fn().mockReturnValue(true),
      getWalletManager: jest.fn().mockReturnValue({ dispose }),
    };
    service["keyRing"] = restoringKeyRing as any;

    await service.restoreFromKeyStore(
      {
        type: "mnemonic",
        meta: {},
        version: "1.2",
        curve: "ed25519",
        crypto: {},
      } as any,
      "pw"
    );

    expect(dispose).not.toHaveBeenCalled();
    expect(service["keyRing"]).toBe(restoringKeyRing);
    expect(service["runtimeSessionId"]).toMatch(/^cad_sess_/);
  });

  it("disposes detached restore even when caller ignores the void result", async () => {
    const service = new CardanoService();
    const dispose = jest.fn();
    const newerKeyRing = { id: "newer" };
    const restoringKeyRing = {
      restore: jest.fn().mockImplementation(async () => {
        // Newer restore already published while this one finishes.
        service["keyRing"] = newerKeyRing as any;
        service["runtimeSessionId"] = "cad_sess_newer";
      }),
      isKeyAgentReady: jest.fn().mockReturnValue(true),
      getWalletManager: jest.fn().mockReturnValue({ dispose }),
    };
    service["keyRing"] = restoringKeyRing as any;

    await service.restoreFromKeyStore(
      {
        type: "mnemonic",
        meta: {},
        version: "1.2",
        curve: "ed25519",
        crypto: {},
      } as any,
      "pw"
    );

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(service["keyRing"]).toBe(newerKeyRing);
    expect(service["runtimeSessionId"]).toBe("cad_sess_newer");
  });
});
