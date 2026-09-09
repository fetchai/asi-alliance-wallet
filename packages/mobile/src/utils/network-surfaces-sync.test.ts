import type { AppStateStatus } from "react-native";
import {
  attachMobileNetworkProjectionListeners,
  invalidateNetworkProjectionFromBroadcast,
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
} from "./network-surfaces-sync";

jest.mock("@keplr-wallet/background", () => ({
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE: "network-surfaces-sync",
  addNetworkSurfacesSyncListener: jest.fn(),
}));

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
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

describe("attachMobileNetworkProjectionListeners", () => {
  it("invalidates on broadcast, AppState active, and syncs catch-up after subscribe", async () => {
    const invalidateNetworkProjection = jest.fn();
    const syncNetworkProjection = jest.fn(async () => "applied" as const);
    const cancelPendingNetworkProjectionRetry = jest.fn();
    const chainStore = {
      invalidateNetworkProjection,
      syncNetworkProjection,
      cancelPendingNetworkProjectionRetry,
    } as any;

    let listener:
      | ((message: { type: string; chainId: string; revision: number }) => void)
      | undefined;
    let appStateListener: ((state: AppStateStatus) => void) | undefined;

    const unsubscribe = attachMobileNetworkProjectionListeners({
      chainStore,
      addListener: (l) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
      addAppStateListener: (l) => {
        appStateListener = l;
        return () => {
          appStateListener = undefined;
        };
      },
    });

    expect(listener).toBeDefined();
    expect(appStateListener).toBeDefined();
    await Promise.resolve();
    expect(syncNetworkProjection).toHaveBeenCalledTimes(1);

    listener!({
      type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
      chainId: "fetchhub-4",
      revision: 6,
    });
    expect(invalidateNetworkProjection).toHaveBeenCalledTimes(1);

    appStateListener!("active");
    expect(invalidateNetworkProjection).toHaveBeenCalledTimes(2);

    appStateListener!("background");
    expect(invalidateNetworkProjection).toHaveBeenCalledTimes(2);

    unsubscribe();
    expect(listener).toBeUndefined();
    expect(appStateListener).toBeUndefined();
    expect(cancelPendingNetworkProjectionRetry).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops receiving broadcasts", () => {
    const invalidateNetworkProjection = jest.fn();
    const syncNetworkProjection = jest.fn(async () => "applied" as const);
    const cancelPendingNetworkProjectionRetry = jest.fn();
    const chainStore = {
      invalidateNetworkProjection,
      syncNetworkProjection,
      cancelPendingNetworkProjectionRetry,
    } as any;

    let listener:
      | ((message: { type: string; chainId: string; revision: number }) => void)
      | undefined;

    const unsubscribe = attachMobileNetworkProjectionListeners({
      chainStore,
      addListener: (l) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
      addAppStateListener: () => () => undefined,
    });

    unsubscribe();
    expect(listener).toBeUndefined();
    expect(invalidateNetworkProjection).not.toHaveBeenCalled();
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
      cancelPendingNetworkProjectionRetry: jest.fn(),
    } as any;

    attachMobileNetworkProjectionListeners({
      chainStore,
      addListener: () => () => undefined,
      addAppStateListener: () => () => undefined,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(syncNetworkProjection).toHaveBeenCalledTimes(1);
    expect(unhandled).toHaveLength(0);

    process.off("unhandledRejection", onUnhandled);
  });
});
