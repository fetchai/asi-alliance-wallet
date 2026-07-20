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

  it("disposeRuntimeIfInstance soft-detaches during rebuild without wiping key ring", () => {
    const service = new CardanoService();
    const disposeOld = jest.fn();
    const markDetached = jest.fn();
    const invalidatePendingRebuilds = jest.fn();
    const detachWalletManagerIfInstance = jest.fn((id: string) => {
      if (id !== "rt_A") {
        return false;
      }
      markDetached();
      disposeOld();
      (service["keyRing"] as any).getWalletManager = jest
        .fn()
        .mockReturnValue(undefined);
      return true;
    });

    service["boundChainId"] = "cardano-preprod";
    service["keyRing"] = {
      invalidatePendingRebuilds,
      isRebuildInFlight: jest.fn().mockReturnValue(true),
      detachWalletManagerIfInstance,
      getWalletManager: jest.fn().mockReturnValue({
        getRuntimeInstanceId: () => "rt_A",
        dispose: disposeOld,
        markDetached,
      }),
    } as any;

    expect(service.disposeRuntimeIfInstance("rt_A")).toBe(true);

    expect(detachWalletManagerIfInstance).toHaveBeenCalledWith("rt_A");
    expect(invalidatePendingRebuilds).not.toHaveBeenCalled();
    expect(service["keyRing"]).toBeTruthy();
    expect(service["boundChainId"]).toBeUndefined();
  });

  it("disposeRuntimeIfInstance leaves a newer attached runtime untouched", () => {
    const service = new CardanoService();
    const disposeNew = jest.fn();
    service["keyRing"] = {
      invalidatePendingRebuilds: jest.fn(),
      getWalletManager: jest.fn().mockReturnValue({
        getRuntimeInstanceId: () => "rt_new",
        dispose: disposeNew,
      }),
    } as any;

    expect(service.disposeRuntimeIfInstance("rt_old")).toBe(false);

    expect(disposeNew).not.toHaveBeenCalled();
    expect(service["keyRing"]).toBeTruthy();
  });

  it("disposeRuntimeIfInstance resets when captured instance is still current", () => {
    const service = new CardanoService();
    const dispose = jest.fn();
    service["keyRing"] = {
      invalidatePendingRebuilds: jest.fn(),
      getWalletManager: jest.fn().mockReturnValue({
        getRuntimeInstanceId: () => "rt_current",
        dispose,
      }),
    } as any;

    expect(service.disposeRuntimeIfInstance("rt_current")).toBe(true);

    expect(dispose).toHaveBeenCalled();
    expect(service["keyRing"]).toBeUndefined();
  });

  it("disposeRuntimeIfInstance does not reset mid-init runtime when captured id is gone", () => {
    const service = new CardanoService();
    const invalidatePendingRebuilds = jest.fn();
    // Newer runtime published keyRing but manager not attached yet.
    service["keyRing"] = {
      invalidatePendingRebuilds,
      getWalletManager: jest.fn().mockReturnValue(undefined),
    } as any;
    service["runtimeSessionId"] = "cad_sess_mid_init";

    expect(service.disposeRuntimeIfInstance("rt_old")).toBe(false);

    expect(invalidatePendingRebuilds).not.toHaveBeenCalled();
    expect(service["keyRing"]).toBeTruthy();
    expect(service["runtimeSessionId"]).toBe("cad_sess_mid_init");
  });

  it("disposeRuntimeIfInstance with undefined never resets", () => {
    const service = new CardanoService();
    service["keyRing"] = {
      invalidatePendingRebuilds: jest.fn(),
      getWalletManager: jest.fn().mockReturnValue(undefined),
    } as any;

    expect(service.disposeRuntimeIfInstance(undefined)).toBe(false);
    expect(service["keyRing"]).toBeTruthy();
  });
});
