import { applyBackgroundSelectedChainCore } from "./apply-background-selected-chain-core";
import { selectChainAndPersistWiring } from "./select-chain-and-persist-wiring";
import {
  SelectedChainApplyResult,
  SelectedChainAuthoritySnapshot,
} from "./apply-selected-chain-authority";

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

describe("applyBackgroundSelectedChainCore races", () => {
  it("does not let unknown B/rev2 overwrite C/rev3 after delayed registry refresh", async () => {
    let local: SelectedChainAuthoritySnapshot = {
      chainId: "fetchhub-4",
      revision: 1,
    };
    const known = new Set<string>(["fetchhub-4", "dorado-1"]);

    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const applyB = applyBackgroundSelectedChainCore(
      {
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          local = { ...next };
        },
        hasChain: (id) => known.has(id),
        refreshRegistry: async () => {
          await refreshGate;
          known.add("custom-b");
        },
      },
      { chainId: "custom-b", revision: 2 }
    );

    await Promise.resolve();
    await Promise.resolve();

    await expect(
      applyBackgroundSelectedChainCore(
        {
          getLocalSnapshot: () => ({ ...local }),
          setLocalSnapshot: (next) => {
            local = { ...next };
          },
          hasChain: (id) => known.has(id),
          refreshRegistry: async () => undefined,
        },
        { chainId: "dorado-1", revision: 3 }
      )
    ).resolves.toBe("applied");

    expect(local).toEqual({ chainId: "dorado-1", revision: 3 });

    releaseRefresh();
    await expect(applyB).resolves.toBe("stale");
    expect(local).toEqual({ chainId: "dorado-1", revision: 3 });
  });
});

describe("selectChainAndPersistWiring during overlapping selects", () => {
  it("awaits ack for B even while a later C is also requested; C remains applied", async () => {
    const calls: string[] = [];
    let local: SelectedChainAuthoritySnapshot = {
      chainId: "fetchhub-4",
      revision: 1,
    };

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

    const tryApply = async (
      chainId: string,
      revision: number
    ): Promise<SelectedChainApplyResult> => {
      if (revision < local.revision) {
        calls.push(`stale:${chainId}:${revision}`);
        return "stale";
      }
      local = { chainId, revision };
      calls.push(`apply:${chainId}:${revision}`);
      return "applied";
    };

    const persistB = runGenerator(
      selectChainAndPersistWiring(
        {
          sendSelectSelectedChain: sendSelect,
          tryApplyBackgroundSelectedChain: tryApply,
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
          tryApplyBackgroundSelectedChain: tryApply,
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "cardano-preview"
      )
    );

    expect(local).toEqual({ chainId: "cardano-preview", revision: 3 });

    releaseB({ chainId: "dorado-1", revision: 2 });
    await expect(persistB).rejects.toThrow("network_switch_superseded");
    expect(local).toEqual({ chainId: "cardano-preview", revision: 3 });
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
          tryApplyBackgroundSelectedChain: async (
            chainId,
            revision
          ): Promise<SelectedChainApplyResult> => {
            calls.push(`apply:${chainId}:${revision}`);
            return "applied";
          },
          saveLastViewChainId: async () => {
            calls.push("persist");
          },
        },
        "dorado-1"
      )
    );

    expect(calls).toEqual(["send:dorado-1", "apply:dorado-1:2", "persist"]);
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
            tryApplyBackgroundSelectedChain:
              async (): Promise<SelectedChainApplyResult> => "applied",
            saveLastViewChainId: async () => undefined,
          },
          "dorado-1"
        )
      )
    ).rejects.toThrow("network_switch_superseded");
  });

  it("treats stale apply after ack as superseded", async () => {
    await expect(
      runGenerator(
        selectChainAndPersistWiring(
          {
            sendSelectSelectedChain: async (chainId) => ({
              chainId,
              revision: 1,
            }),
            tryApplyBackgroundSelectedChain:
              async (): Promise<SelectedChainApplyResult> => "stale",
            saveLastViewChainId: async () => undefined,
          },
          "dorado-1"
        )
      )
    ).rejects.toThrow("network_switch_superseded");
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
