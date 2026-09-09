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
  it("ack success -> syncProjection applied -> persist", async () => {
    const calls: string[] = [];

    await runGenerator(
      selectChainAndPersistWiring(
        {
          sendSelectSelectedChain: async (chainId: string) => {
            calls.push(`ack:${chainId}`);
            return { chainId, revision: 1 };
          },
          syncProjection: async () => {
            calls.push("sync");
            return "applied";
          },
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "fetchhub-4"
      )
    );

    expect(calls).toEqual(["ack:fetchhub-4", "sync", "persist"]);
  });

  it("ack failure -> sync and persist not called", async () => {
    const calls: string[] = [];

    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            sendSelectSelectedChain: async () => {
              calls.push("ack:fail");
              throw new Error("ack failed");
            },
            syncProjection: async () => {
              calls.push("sync");
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

  it("ack success with retry-scheduled does not fail switch and skips persist", async () => {
    const calls: string[] = [];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await runGenerator(
      selectChainAndPersistWiring(
        {
          sendSelectSelectedChain: async (chainId: string) => {
            calls.push(`ack:${chainId}`);
            return { chainId, revision: 1 };
          },
          syncProjection: async () => {
            calls.push("sync");
            return "retry-scheduled";
          },
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "fetchhub-4"
      )
    );

    expect(calls).toEqual(["ack:fetchhub-4", "sync"]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("projection sync scheduled retry"),
      expect.any(String)
    );
    warn.mockRestore();
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
            syncProjection: async () => {
              calls.push("sync");
              return "applied";
            },
            saveLastViewChainId: async () => {
              calls.push("persist");
              throw new Error("persist failed");
            },
          },
          "fetchhub-4"
        )
      )
    ).resolves.toBeUndefined();

    expect(calls).toEqual(["ack:fetchhub-4", "sync", "persist"]);
    warn.mockRestore();
  });
});
