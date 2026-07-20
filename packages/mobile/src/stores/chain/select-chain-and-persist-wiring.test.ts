import { selectChainAndPersistWiring } from "./select-chain-and-persist-wiring";
import { SelectedChainApplyResult } from "./apply-selected-chain-authority";

async function runGenerator(
  iterator: IterableIterator<unknown>
): Promise<unknown> {
  let next = iterator.next();

  while (!next.done) {
    try {
      const resolved = await next.value;
      next = (iterator as any).next(resolved);
    } catch (error) {
      if (!iterator.throw) {
        throw error;
      }
      next = (iterator as any).throw(error);
    }
  }

  return next.value;
}

describe("selectChainAndPersistWiring", () => {
  it("ack success -> local apply -> persist", async () => {
    const calls: string[] = [];

    await runGenerator(
      selectChainAndPersistWiring(
        {
          sendSelectSelectedChain: async (chainId: string) => {
            calls.push(`ack:${chainId}`);
            return { chainId, revision: 1 };
          },
          tryApplyBackgroundSelectedChain: (chainId, revision) => {
            calls.push(`local:${chainId}:${revision}`);
            return "applied";
          },
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "fetchhub-4"
      )
    );

    expect(calls).toEqual(["ack:fetchhub-4", "local:fetchhub-4:1", "persist"]);
  });

  it("ack failure -> local unchanged -> persist not called", async () => {
    const calls: string[] = [];

    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            sendSelectSelectedChain: async () => {
              calls.push("ack:fail");
              throw new Error("ack failed");
            },
            tryApplyBackgroundSelectedChain: (chainId) => {
              calls.push(`local:${chainId}`);
              return "applied";
            },
            saveLastViewChainId: async () => {
              calls.push("persist");
            },
          },
          "fetchhub-4"
        )
      )
    ).rejects.toThrow("ack failed");

    expect(calls).toEqual(["ack:fail"]);
  });

  it("ack success but stale revision rejects as superseded", async () => {
    const calls: string[] = [];

    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            sendSelectSelectedChain: async (chainId: string) => {
              calls.push(`ack:${chainId}`);
              return { chainId, revision: 1 };
            },
            tryApplyBackgroundSelectedChain: (): SelectedChainApplyResult => {
              calls.push("local:stale");
              return "stale";
            },
            saveLastViewChainId: async () => {
              calls.push("persist");
            },
          },
          "fetchhub-4"
        )
      )
    ).rejects.toThrow("network_switch_superseded");

    expect(calls).toEqual(["ack:fetchhub-4", "local:stale"]);
  });

  it("ack success + persist failure still resolves", async () => {
    const calls: string[] = [];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            sendSelectSelectedChain: async (chainId: string) => {
              calls.push(`ack:${chainId}`);
              return { chainId, revision: 1 };
            },
            tryApplyBackgroundSelectedChain: (chainId, revision) => {
              calls.push(`local:${chainId}:${revision}`);
              return "applied";
            },
            saveLastViewChainId: async () => {
              calls.push("persist:fail");
              throw new Error("persist failed");
            },
          },
          "fetchhub-4"
        )
      )
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      "ack:fetchhub-4",
      "local:fetchhub-4:1",
      "persist:fail",
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
