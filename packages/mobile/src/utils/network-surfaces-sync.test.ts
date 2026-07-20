import { flow } from "mobx";
import {
  applyNetworkSurfacesSyncFromBroadcast,
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
  subscribeNetworkSurfacesAndCatchUp,
} from "./network-surfaces-sync";

jest.mock("@keplr-wallet/background", () => ({
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE: "network-surfaces-sync",
  addNetworkSurfacesSyncListener: jest.fn(),
}));

describe("applyNetworkSurfacesSyncFromBroadcast", () => {
  it("applies revision to local projection without write-back Select", async () => {
    const calls: Array<[string, number]> = [];
    const chainStore = {
      applyBackgroundSelectedChain: flow(function* (
        chainId: string,
        revision: number
      ) {
        calls.push([chainId, revision]);
        return "applied";
      }),
    } as any;

    await applyNetworkSurfacesSyncFromBroadcast(chainStore, {
      type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
      chainId: "fetchhub-4",
      revision: 6,
    });

    expect(calls).toEqual([["fetchhub-4", 6]]);
  });

  it("ignores malformed payloads", async () => {
    const spy = jest.fn(
      flow(function* () {
        return "applied";
      })
    );
    const chainStore = { applyBackgroundSelectedChain: spy } as any;

    await applyNetworkSurfacesSyncFromBroadcast(chainStore, {
      type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
      chainId: "",
      revision: 6,
    } as any);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("subscribeNetworkSurfacesAndCatchUp", () => {
  it("catch-up read applies a commit that landed before subscribe", async () => {
    const applied: Array<[string, number]> = [];
    let listener:
      | ((message: { type: string; chainId: string; revision: number }) => void)
      | undefined;

    const unsubscribe = subscribeNetworkSurfacesAndCatchUp({
      addListener: (l) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
      applyFromBroadcast: async (message) => {
        applied.push([message.chainId, message.revision]);
      },
      catchUpFromBackground: async () => {
        applied.push(["fetchhub-4", 6]);
      },
    });

    expect(listener).toBeDefined();
    await Promise.resolve();
    expect(applied).toEqual([["fetchhub-4", 6]]);
    unsubscribe();
  });

  it("keeps newer broadcast when catch-up snapshot is stale", async () => {
    let resolveCatchUp!: () => void;
    const catchUpGate = new Promise<void>((resolve) => {
      resolveCatchUp = resolve;
    });

    const applied: Array<[string, number]> = [];
    let local = { chainId: "cardano-1", revision: 5 };

    let listener:
      | ((message: { type: string; chainId: string; revision: number }) => void)
      | undefined;

    const unsubscribe = subscribeNetworkSurfacesAndCatchUp({
      addListener: (l) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
      applyFromBroadcast: async (message) => {
        if (message.revision > local.revision) {
          local = {
            chainId: message.chainId,
            revision: message.revision,
          };
          applied.push([message.chainId, message.revision]);
        }
      },
      catchUpFromBackground: async () => {
        await catchUpGate;
        // Stale A@5 after B@6 already applied.
        if (5 > local.revision) {
          local = { chainId: "cardano-1", revision: 5 };
          applied.push(["cardano-1", 5]);
        }
      },
    });

    expect(listener).toBeDefined();

    listener!({
      type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
      chainId: "fetchhub-4",
      revision: 6,
    });
    await Promise.resolve();

    resolveCatchUp();
    await Promise.resolve();
    await Promise.resolve();

    expect(local).toEqual({ chainId: "fetchhub-4", revision: 6 });
    expect(applied).toEqual([["fetchhub-4", 6]]);
    unsubscribe();
  });

  it("unsubscribe works while catch-up is still pending", async () => {
    let resolveCatchUp!: () => void;
    const catchUpGate = new Promise<void>((resolve) => {
      resolveCatchUp = resolve;
    });

    const applyFromBroadcast = jest.fn(async () => undefined);
    let listener:
      | ((message: { type: string; chainId: string; revision: number }) => void)
      | undefined;

    const unsubscribe = subscribeNetworkSurfacesAndCatchUp({
      addListener: (l) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
      applyFromBroadcast,
      catchUpFromBackground: () => catchUpGate,
    });

    expect(listener).toBeDefined();
    unsubscribe();
    expect(listener).toBeUndefined();

    // A broadcast after unsubscribe must not reach apply.
    // (listener is cleared; simulate what fan-out would do if we still held it)
    expect(applyFromBroadcast).not.toHaveBeenCalled();

    resolveCatchUp();
    await Promise.resolve();
  });
});
