import { runWalletPickerAddressSyncAttempt } from "./run-wallet-picker-address-sync";
import type { AddressCacheById } from "@utils/address-cache-store";

describe("runWalletPickerAddressSyncAttempt", () => {
  it("does not write cache when superseded before atomicCacheUpdate (run #1 stale)", async () => {
    const cacheState: Record<string, AddressCacheById> = {
      chain1: {},
    };
    let loadRunId = 1;
    const canCommitForRun1 = (): boolean => loadRunId === 1;

    const listAccounts = jest.fn(async () => ({
      accounts: [
        { bech32Address: "fetch_stale", EVMAddress: "" },
      ] as any[],
    }));

    const atomicCacheUpdate = jest.fn(
      async (
        _chainId: string,
        op: (c: AddressCacheById) => {
          newCache: AddressCacheById;
          result: undefined;
        }
      ) => {
        loadRunId = 2;
        const { newCache } = op(cacheState["chain1"]);
        cacheState["chain1"] = newCache;
        return undefined;
      }
    );

    await runWalletPickerAddressSyncAttempt({
      startChainId: "chain1",
      startWalletIdsKey: "w1",
      snapshotWalletIds: ["w1"],
      canCommit: canCommitForRun1,
      chainStore: {
        getChain: () => ({}),
        current: { features: [] },
      } as any,
      keyRingStore: {
        multiKeyStoreInfo: [{ meta: { __id__: "w1" }, type: "mnemonic" }],
      } as any,
      ports: {
        getCache: (id) => ({ ...cacheState[id] }),
        atomicCacheUpdate,
        listAccounts,
      },
      onHydrateAddresses: jest.fn(),
      onLoadingChange: jest.fn(),
      onNotifyError: jest.fn(),
    });

    expect(cacheState["chain1"]["w1"]).toBeUndefined();
    expect(atomicCacheUpdate).toHaveBeenCalledTimes(1);
  });

  it("mismatch length does not call atomicCacheUpdate", async () => {
    const atomicCacheUpdate = jest.fn();
    await runWalletPickerAddressSyncAttempt({
      startChainId: "c",
      startWalletIdsKey: "a,b",
      snapshotWalletIds: ["a", "b"],
      canCommit: () => true,
      chainStore: {
        getChain: () => ({}),
        current: { features: [] },
      } as any,
      keyRingStore: { multiKeyStoreInfo: [{ meta: { __id__: "a" } }, { meta: { __id__: "b" } }] } as any,
      ports: {
        getCache: () => ({}),
        atomicCacheUpdate,
        listAccounts: async () => ({
          accounts: [{ bech32Address: "x", EVMAddress: "" }] as any,
        }),
      },
      onHydrateAddresses: jest.fn(),
      onLoadingChange: jest.fn(),
      onNotifyError: jest.fn(),
    });
    expect(atomicCacheUpdate).not.toHaveBeenCalled();
  });

  it("stale run does not call onLoadingChange(false) after a newer run already cleared loading", async () => {
    const onLoadingChange = jest.fn();
    let activeRun = 1;
    let resolveRun1List!: (value: any) => void;
    const run1ListP = new Promise<any>((resolve) => {
      resolveRun1List = resolve;
    });

    const mkPorts = (listAccounts: () => Promise<any>) => ({
      getCache: () => ({}),
      atomicCacheUpdate: async (
        _cid: string,
        op: (c: AddressCacheById) => {
          newCache: AddressCacheById;
          result: undefined;
        }
      ) => {
        op({});
        return undefined;
      },
      listAccounts,
    });

    const base = {
      startChainId: "chain1",
      startWalletIdsKey: "w1",
      snapshotWalletIds: ["w1"],
      chainStore: {
        getChain: () => ({}),
        current: { features: [] },
      } as any,
      keyRingStore: {
        multiKeyStoreInfo: [{ meta: { __id__: "w1" } }],
      } as any,
      onHydrateAddresses: jest.fn(),
      onLoadingChange,
      onNotifyError: jest.fn(),
    };

    const p1 = runWalletPickerAddressSyncAttempt({
      ...base,
      canCommit: () => activeRun === 1,
      ports: mkPorts(() => run1ListP),
    });

    activeRun = 2;
    await runWalletPickerAddressSyncAttempt({
      ...base,
      canCommit: () => activeRun === 2,
      ports: mkPorts(async () => ({
        accounts: [{ bech32Address: "fetch_fresh_ok", EVMAddress: "" }],
      })),
    });

    const falseCallsAfterRun2 = onLoadingChange.mock.calls.filter(
      (c) => c[0] === false
    ).length;
    expect(falseCallsAfterRun2).toBeGreaterThanOrEqual(1);

    resolveRun1List({
      accounts: [{ bech32Address: "fetch_stale_noise", EVMAddress: "" }],
    });
    await p1;

    const falseCallsAfterStale1 = onLoadingChange.mock.calls.filter(
      (c) => c[0] === false
    ).length;
    expect(falseCallsAfterStale1).toBe(falseCallsAfterRun2);
  });
});
