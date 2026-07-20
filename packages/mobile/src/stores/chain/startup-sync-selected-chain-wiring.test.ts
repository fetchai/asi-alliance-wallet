import { startupSyncSelectedChainWiring } from "./startup-sync-selected-chain-wiring";

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

describe("startupSyncSelectedChainWiring", () => {
  it("reads background snapshot and applies locally without writing", async () => {
    const calls: string[] = [];

    await runGenerator(
      startupSyncSelectedChainWiring({
        getBackgroundSnapshot: async () => {
          calls.push("get");
          return { chainId: "dorado-1", revision: 5 };
        },
        tryApplyBackgroundSelectedChain: (chainId, revision) => {
          calls.push(`apply:${chainId}:${revision}`);
          return "applied";
        },
      })
    );

    expect(calls).toEqual(["get", "apply:dorado-1:5"]);
  });
});
