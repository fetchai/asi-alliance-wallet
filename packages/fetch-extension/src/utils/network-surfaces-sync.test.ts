import {
  attachExtensionNetworkProjectionListeners,
  invalidateNetworkProjectionFromBroadcast,
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
} from "./network-surfaces-sync";

jest.mock("@keplr-wallet/background", () => ({
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE: "network-surfaces-sync",
}));

describe("invalidateNetworkProjectionFromBroadcast", () => {
  it("invalidates projection and ignores payload chainId/revision", () => {
    const invalidateNetworkProjection = jest.fn();
    const chainStore = { invalidateNetworkProjection } as any;

    invalidateNetworkProjectionFromBroadcast(chainStore, {
      type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
      chainId: "fetchhub-4",
      revision: 6,
    });

    expect(invalidateNetworkProjection).toHaveBeenCalledTimes(1);
  });

  it("ignores non-network-surfaces messages", () => {
    const invalidateNetworkProjection = jest.fn();
    const chainStore = { invalidateNetworkProjection } as any;

    invalidateNetworkProjectionFromBroadcast(chainStore, {
      type: "other",
      chainId: "fetchhub-4",
      revision: 6,
    });

    expect(invalidateNetworkProjection).not.toHaveBeenCalled();
  });
});

describe("attachExtensionNetworkProjectionListeners", () => {
  it("invalidates on broadcast, focus, and catch-up syncs after subscribe", async () => {
    const invalidateNetworkProjection = jest.fn();
    const syncNetworkProjection = jest.fn(async () => "applied" as const);
    const cancelPendingNetworkProjectionRetry = jest.fn();
    const chainStore = {
      invalidateNetworkProjection,
      syncNetworkProjection,
      cancelPendingNetworkProjectionRetry,
    } as any;

    let runtimeListener: ((message: unknown) => void) | undefined;
    let focusListener: (() => void) | undefined;

    const detach = attachExtensionNetworkProjectionListeners({
      chainStore,
      addRuntimeMessageListener: (listener) => {
        runtimeListener = listener;
        return () => {
          runtimeListener = undefined;
        };
      },
      addFocusListener: (listener) => {
        focusListener = listener;
        return () => {
          focusListener = undefined;
        };
      },
    });

    await Promise.resolve();
    expect(syncNetworkProjection).toHaveBeenCalledTimes(1);

    runtimeListener!({
      type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
      chainId: "fetchhub-4",
      revision: 6,
    });
    expect(invalidateNetworkProjection).toHaveBeenCalledTimes(1);

    focusListener!();
    expect(invalidateNetworkProjection).toHaveBeenCalledTimes(2);

    detach();
    expect(runtimeListener).toBeUndefined();
    expect(focusListener).toBeUndefined();
    expect(cancelPendingNetworkProjectionRetry).toHaveBeenCalledTimes(1);
  });

  it("catch-up dispose reject does not become unhandled", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    const syncNetworkProjection = jest.fn(() =>
      Promise.reject(new Error("network_projection_controller_disposed"))
    );
    const chainStore = {
      invalidateNetworkProjection: jest.fn(),
      syncNetworkProjection,
    } as any;

    attachExtensionNetworkProjectionListeners({
      chainStore,
      addRuntimeMessageListener: () => () => undefined,
      addFocusListener: () => () => undefined,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(syncNetworkProjection).toHaveBeenCalledTimes(1);
    expect(unhandled).toHaveLength(0);

    process.off("unhandledRejection", onUnhandled);
  });
});
