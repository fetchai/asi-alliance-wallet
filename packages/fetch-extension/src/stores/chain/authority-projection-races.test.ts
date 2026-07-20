import { selectChainAndPersistWiring } from "./select-chain-and-persist-wiring";

async function runGenerator(
  iterator: Generator<PromiseLike<unknown>, unknown, unknown>
): Promise<unknown> {
  let next = iterator.next();

  while (!next.done) {
    try {
      const resolved = await next.value;
      next = iterator.next(resolved);
    } catch (error) {
      if (!iterator.throw) {
        throw error;
      }
      next = iterator.throw(error);
    }
  }

  return next.value;
}

describe("selectChainAndPersistWiring during overlapping selects", () => {
  it("awaits ack for B even while a later C is also requested; both sync projection", async () => {
    const calls: string[] = [];

    let releaseB!: (value: { chainId: string; revision: number }) => void;
    const bAck = new Promise<{ chainId: string; revision: number }>(
      (resolve) => {
        releaseB = resolve;
      }
    );

    const sendSelect = async (chainId: string) => {
      calls.push(`send:${chainId}`);
      if (chainId === "dorado-1") {
        return bAck;
      }
      return { chainId: "cardano-preview", revision: 3 };
    };

    const persistB = runGenerator(
      selectChainAndPersistWiring(
        {
          sendSelectSelectedChain: sendSelect,
          syncProjection: async () => {
            calls.push("sync:b");
            return "applied";
          },
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "dorado-1"
      )
    );

    await Promise.resolve();
    expect(calls).toContain("send:dorado-1");

    await runGenerator(
      selectChainAndPersistWiring(
        {
          sendSelectSelectedChain: sendSelect,
          syncProjection: async () => {
            calls.push("sync:c");
            return "applied";
          },
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "cardano-preview"
      )
    );

    expect(calls).toContain("sync:c");

    releaseB({ chainId: "dorado-1", revision: 2 });
    await persistB;
    expect(calls).toContain("sync:b");
  });

  it("does not resolve without sending Select (no startup deferral)", async () => {
    const calls: string[] = [];

    await runGenerator(
      selectChainAndPersistWiring(
        {
          sendSelectSelectedChain: async (chainId) => {
            calls.push(`send:${chainId}`);
            return { chainId, revision: 2 };
          },
          syncProjection: async () => {
            calls.push("sync");
            return "applied";
          },
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "dorado-1"
      )
    );

    expect(calls).toEqual(["send:dorado-1", "sync", "persist"]);
  });
});

describe("sign/token selection gating helpers", () => {
  it("treats rejected selection as not ready for sensitive work", async () => {
    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            sendSelectSelectedChain: async () => {
              throw new Error("network_switch_superseded");
            },
            syncProjection: async () => "applied",
            saveLastViewChainId: async () => undefined,
          },
          "dorado-1"
        )
      )
    ).rejects.toThrow("network_switch_superseded");
  });

  it("projection retry-scheduled after ack does not fail the switch", async () => {
    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            sendSelectSelectedChain: async (chainId) => ({
              chainId,
              revision: 1,
            }),
            syncProjection: async () => "retry-scheduled",
            saveLastViewChainId: async () => undefined,
          },
          "dorado-1"
        )
      )
    ).resolves.toBeUndefined();
  });
});

describe("ACK vs projection sync", () => {
  it("Select ACK succeeds while subsequent syncNow is retry-scheduled", async () => {
    const events: string[] = [];
    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            sendSelectSelectedChain: async (chainId) => {
              events.push(`ack:${chainId}`);
              return { chainId, revision: 4 };
            },
            syncProjection: async () => {
              events.push("sync:retry-scheduled");
              return "retry-scheduled";
            },
            saveLastViewChainId: async () => {
              events.push("persist-last-view");
            },
          },
          "cardano-preprod"
        )
      )
    ).resolves.toBeUndefined();

    expect(events).toEqual(["ack:cardano-preprod", "sync:retry-scheduled"]);
  });
});

describe("approval completion boundary (background owns add→select)", () => {
  it("models CommitAdd then Select before external resolve", async () => {
    const events: string[] = [];

    const waitApprove = async () => {
      events.push("ui-approve");
    };

    const externalRequest = (async () => {
      await waitApprove();
      events.push("commit-add");
      events.push("commit-select");
      events.push("external-resolve");
    })();

    await externalRequest;
    expect(events).toEqual([
      "ui-approve",
      "commit-add",
      "commit-select",
      "external-resolve",
    ]);
  });

  it("models switch Select only after approval, before external resolve", async () => {
    const events: string[] = [];

    const waitApprove = async () => {
      events.push("ui-approve");
      return "dorado-1";
    };

    const externalSwitch = (async () => {
      const chainId = await waitApprove();
      events.push(`commit-select:${chainId}`);
      events.push("external-resolve");
    })();

    await externalSwitch;
    expect(events).toEqual([
      "ui-approve",
      "commit-select:dorado-1",
      "external-resolve",
    ]);
  });
});

describe("keyring surfaces apply-only", () => {
  it("applies snapshot without issuing Select write-back", async () => {
    const calls: string[] = [];
    let local = { chainId: "fetchhub-4", revision: 1 };

    const applyOnly = async (snapshot: {
      chainId: string;
      revision: number;
    }) => {
      calls.push(`apply:${snapshot.chainId}:${snapshot.revision}`);
      if (snapshot.revision >= local.revision) {
        local = snapshot;
      }
    };

    await applyOnly({ chainId: "dorado-1", revision: 5 });
    expect(calls).toEqual(["apply:dorado-1:5"]);
    expect(local).toEqual({ chainId: "dorado-1", revision: 5 });
    expect(calls.some((c) => c.startsWith("select:"))).toBe(false);
  });
});
