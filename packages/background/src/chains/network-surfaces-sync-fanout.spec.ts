import {
  addNetworkSurfacesSyncListener,
  notifyNetworkSurfacesSyncListeners,
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
} from "./network-surfaces-sync-fanout";

describe("network surfaces sync fanout", () => {
  it("delivers in-process payloads when chrome.runtime is absent", () => {
    const received: unknown[] = [];
    const unsubscribe = addNetworkSurfacesSyncListener((payload) => {
      received.push(payload);
    });

    notifyNetworkSurfacesSyncListeners({
      chainId: "fetchhub-4",
      revision: 6,
    });

    expect(received).toEqual([
      {
        type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
        chainId: "fetchhub-4",
        revision: 6,
      },
    ]);

    unsubscribe();
    notifyNetworkSurfacesSyncListeners({
      chainId: "dorado-1",
      revision: 7,
    });
    expect(received).toHaveLength(1);
  });
});
