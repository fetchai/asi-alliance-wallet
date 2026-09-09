import { MemoryKVStore } from "@keplr-wallet/common";
import { ChainUpdaterService } from "./service";

describe("ChainUpdaterService projection invalidation", () => {
  function createUpdater(options?: { getChainInfo?: jest.Mock }) {
    const kvStore = new MemoryKVStore("test-updater-invalidation");
    const updater = new ChainUpdaterService(kvStore, {
      organizationName: "test",
      repoName: "test",
      branchName: "main",
    });
    const notifyProjectionInvalidation = jest.fn(async () => undefined);
    const clearCachedChainInfos = jest.fn();
    const getChainInfos = jest.fn(async () => [
      { chainId: "fetchhub-4" } as any,
    ]);
    const getChainInfo =
      options?.getChainInfo ??
      jest.fn(async () => ({
        chainId: "fetchhub-4",
        updateFromRepoDisabled: false,
        rpc: "https://rpc",
        features: ["cosmos"],
      }));

    updater.init({
      clearCachedChainInfos,
      getChainInfos,
      getChainInfo,
      notifyProjectionInvalidation,
      selectChainWithAck: jest.fn(async (chainId: string) => ({
        chainId,
        revision: 2,
      })),
      alignSelectedCanonicalIfCurrent: jest.fn(async () => null),
    } as any);

    return {
      updater,
      notifyProjectionInvalidation,
      clearCachedChainInfos,
      getChainInfo,
    };
  }

  it("setChainEndpoints notifies projection invalidation", async () => {
    const { updater, notifyProjectionInvalidation, clearCachedChainInfos } =
      createUpdater();

    await updater.setChainEndpoints(
      "fetchhub-4",
      "https://rpc",
      "https://rest"
    );

    expect(clearCachedChainInfos).toHaveBeenCalled();
    expect(notifyProjectionInvalidation).toHaveBeenCalledTimes(1);
  });

  it("resetChainEndpoints notifies projection invalidation", async () => {
    const { updater, notifyProjectionInvalidation, clearCachedChainInfos } =
      createUpdater();

    await updater.resetChainEndpoints("fetchhub-4");

    expect(clearCachedChainInfos).toHaveBeenCalled();
    expect(notifyProjectionInvalidation).toHaveBeenCalledTimes(1);
  });

  it("setChainEndpoints notifies even when notify throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { updater, notifyProjectionInvalidation } = createUpdater();
    notifyProjectionInvalidation.mockRejectedValueOnce(new Error("fan-out"));

    await expect(
      updater.setChainEndpoints("fetchhub-4", "https://rpc", "https://rest")
    ).resolves.toEqual([{ chainId: "fetchhub-4" }]);
    expect(notifyProjectionInvalidation).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("resetChainEndpoints notifies even when notify throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { updater, notifyProjectionInvalidation } = createUpdater();
    notifyProjectionInvalidation.mockRejectedValueOnce(new Error("fan-out"));

    await expect(updater.resetChainEndpoints("fetchhub-4")).resolves.toEqual([
      { chainId: "fetchhub-4" },
    ]);
    expect(notifyProjectionInvalidation).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("tryUpdateChainInfo notifies even on disabled no-op path", async () => {
    const { updater, notifyProjectionInvalidation } = createUpdater({
      getChainInfo: jest.fn(async () => ({
        chainId: "fetchhub-4",
        updateFromRepoDisabled: true,
      })),
    });

    await expect(updater.tryUpdateChainInfo("fetchhub-4")).resolves.toBe(false);
    expect(notifyProjectionInvalidation).toHaveBeenCalledTimes(1);
  });
});
