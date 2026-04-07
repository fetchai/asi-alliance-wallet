import { selectChainAndPersistWiring } from "./select-chain-and-persist-wiring";

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
  it("ack success -> local commit -> persist", async () => {
    const calls: string[] = [];
    let local = "cardano-preview";

    await runGenerator(
      selectChainAndPersistWiring(
        {
          isInitializing: false,
          setDeferChainIdSelect: (chainId: string) => {
            calls.push(`defer:${chainId}`);
          },
          sendSetSelectedChain: async (chainId: string) => {
            calls.push(`ack:${chainId}`);
          },
          setSelectedChainIdLocal: (chainId: string) => {
            calls.push(`local:${chainId}`);
            local = chainId;
          },
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "fetchhub-4"
      )
    );

    expect(calls).toEqual(["ack:fetchhub-4", "local:fetchhub-4", "persist"]);
    expect(local).toBe("fetchhub-4");
  });

  it("ack failure -> local unchanged -> persist not called", async () => {
    const calls: string[] = [];
    let local = "cardano-preview";

    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            isInitializing: false,
            setDeferChainIdSelect: () => {
              calls.push("defer");
            },
            sendSetSelectedChain: async () => {
              calls.push("ack:fail");
              throw new Error("ack failed");
            },
            setSelectedChainIdLocal: (chainId: string) => {
              calls.push(`local:${chainId}`);
              local = chainId;
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
    expect(local).toBe("cardano-preview");
  });

  it("ack success + persist failure -> local updated, flow rejects", async () => {
    const calls: string[] = [];
    let local = "cardano-preview";

    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            isInitializing: false,
            setDeferChainIdSelect: () => {
              calls.push("defer");
            },
            sendSetSelectedChain: async (chainId: string) => {
              calls.push(`ack:${chainId}`);
            },
            setSelectedChainIdLocal: (chainId: string) => {
              calls.push(`local:${chainId}`);
              local = chainId;
            },
            saveLastViewChainId: async () => {
              calls.push("persist:fail");
              throw new Error("persist failed");
            },
          },
          "fetchhub-4"
        )
      )
    ).rejects.toThrow("persist failed");

    expect(calls).toEqual([
      "ack:fetchhub-4",
      "local:fetchhub-4",
      "persist:fail",
    ]);
    expect(local).toBe("fetchhub-4");
  });
});

