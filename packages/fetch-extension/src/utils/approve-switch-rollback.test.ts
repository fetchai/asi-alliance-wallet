jest.mock("./keyring-surfaces-sync", () => ({
  requestKeyringSurfacesSyncBroadcast: jest.fn().mockResolvedValue(undefined),
}));

import { rollbackLocalStateAfterFailedApproveSwitch } from "./approve-switch-rollback";
import { requestKeyringSurfacesSyncBroadcast } from "./keyring-surfaces-sync";

describe("rollbackLocalStateAfterFailedApproveSwitch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves index by previousWalletId, restores chain when it differs, then syncs surfaces", async () => {
    const multi = [
      { selected: false, meta: { __id__: "w0" } },
      { selected: true, meta: { __id__: "w1" } },
    ];
    const changeKeyRing = jest.fn(function* (i: number) {
      multi.forEach((k, idx) => {
        k.selected = idx === i;
      });
      yield undefined;
    });
    let selectedChainId = "fetchhub-4";
    const selectChainAndPersist = jest.fn(function* (id: string) {
      selectedChainId = id;
      yield undefined;
    });

    await rollbackLocalStateAfterFailedApproveSwitch({
      multiKeyStoreInfo: multi as any,
      previousWalletId: "w0",
      previousKeyRingIndex: 0,
      previousChainId: "cardano-preview",
      getSelectedChainId: () => selectedChainId,
      changeKeyRing,
      selectChainAndPersist,
    });

    expect(changeKeyRing).toHaveBeenCalledWith(0);
    expect(selectChainAndPersist).toHaveBeenCalledWith("cardano-preview");
    expect(requestKeyringSurfacesSyncBroadcast).toHaveBeenCalledTimes(1);
  });

  it("falls back to previousKeyRingIndex when wallet id is unknown", async () => {
    const multi = [
      { selected: false, meta: { __id__: "w0" } },
      { selected: true, meta: { __id__: "w1" } },
    ];
    const changeKeyRing = jest.fn(function* (i: number) {
      multi.forEach((k, idx) => {
        k.selected = idx === i;
      });
      yield undefined;
    });
    const selectedChainId = "fetchhub-4";
    const selectChainAndPersist = jest.fn(function* () {
      yield undefined;
    });

    await rollbackLocalStateAfterFailedApproveSwitch({
      multiKeyStoreInfo: multi as any,
      previousWalletId: "missing",
      previousKeyRingIndex: 0,
      previousChainId: "fetchhub-4",
      getSelectedChainId: () => selectedChainId,
      changeKeyRing,
      selectChainAndPersist,
    });

    expect(changeKeyRing).toHaveBeenCalledWith(0);
    expect(selectChainAndPersist).not.toHaveBeenCalled();
    expect(requestKeyringSurfacesSyncBroadcast).toHaveBeenCalledTimes(1);
  });

  it("throws when index cannot be resolved", async () => {
    await expect(
      rollbackLocalStateAfterFailedApproveSwitch({
        multiKeyStoreInfo: [] as any,
        previousWalletId: "",
        previousKeyRingIndex: -1,
        previousChainId: "a",
        getSelectedChainId: () => "a",
        changeKeyRing: jest.fn(function* () {
          yield undefined;
        }),
        selectChainAndPersist: jest.fn(function* () {
          yield undefined;
        }),
      })
    ).rejects.toThrow(/resolve previous wallet/);
  });

  it("restores wallet and chain after approve fails post local alignment", async () => {
    const multi = [
      { selected: true, meta: { __id__: "wallet-prev" } },
      { selected: false, meta: { __id__: "wallet-next" } },
    ];
    let selectedChainId = "cardano-preview";

    const changeKeyRing = jest.fn((i: number) => {
      multi.forEach((k, idx) => {
        k.selected = idx === i;
      });
      return (function* () {
        yield undefined;
      })();
    });
    const selectChainAndPersist = jest.fn((id: string) => {
      selectedChainId = id;
      return (function* () {
        yield undefined;
      })();
    });

    // Local alignment and switch already happened before approve.
    multi[0].selected = false;
    multi[1].selected = true;
    selectedChainId = "fetchhub-4";

    await rollbackLocalStateAfterFailedApproveSwitch({
      multiKeyStoreInfo: multi as any,
      previousWalletId: "wallet-prev",
      previousKeyRingIndex: 0,
      previousChainId: "cardano-preview",
      getSelectedChainId: () => selectedChainId,
      changeKeyRing,
      selectChainAndPersist,
    });

    expect(multi[0].selected).toBe(true);
    expect(multi[1].selected).toBe(false);
    expect(selectedChainId).toBe("cardano-preview");
    expect(requestKeyringSurfacesSyncBroadcast).toHaveBeenCalled();
  });
});
