/**
 * Network projection pull invariants:
 * cold-start success, dispose, rejected apply, equal-rev bundle.
 */
import { createNetworkProjectionController } from "./controller";
import { applyNetworkProjectionBundle } from "./apply-network-projection-bundle";
import type { SelectedChainAuthoritySnapshot } from "./apply-selected-chain-authority";

describe("authority projection invariants", () => {
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it("coalesces dirty invalidates during in-flight pull (single-flight)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pulls = 0;

    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        pulls += 1;
        if (pulls === 1) {
          await gate;
        }
        return pulls;
      },
      applyBundle: () => "accepted",
    });

    controller.invalidate();
    await flush();
    expect(pulls).toBe(1);

    controller.invalidate();
    controller.invalidate();
    release();
    await flush();
    await flush();
    expect(pulls).toBe(2);
    expect(controller.projectionReady).toBe(true);
    controller.dispose();
  });

  it("cold-start fail → retry-scheduled → retry success → applied/ready", async () => {
    let shouldFail = true;
    let pulls = 0;
    const scheduled: Array<() => void> = [];

    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        pulls += 1;
        if (shouldFail) {
          throw new Error("transport down");
        }
        return "ok";
      },
      applyBundle: () => "accepted",
      schedule: (fn) => {
        const wrapped = () => {
          const idx = scheduled.indexOf(wrapped);
          if (idx >= 0) {
            scheduled.splice(idx, 1);
          }
          fn();
        };
        scheduled.push(wrapped);
        return {
          cancel: () => {
            const idx = scheduled.indexOf(wrapped);
            if (idx >= 0) {
              scheduled.splice(idx, 1);
            }
          },
        };
      },
      retryBaseMs: 10,
    });

    expect(controller.projectionReady).toBe(false);
    await expect(controller.syncNow()).resolves.toBe("retry-scheduled");
    expect(controller.projectionReady).toBe(false);
    expect(pulls).toBe(1);
    expect(scheduled).toHaveLength(1);

    // Dirty while backoff armed must not hot-loop / spawn a second timer.
    controller.invalidate();
    await flush();
    expect(pulls).toBe(1);
    expect(scheduled).toHaveLength(1);

    shouldFail = false;
    scheduled[0]();
    await flush();
    expect(pulls).toBe(2);
    expect(controller.projectionReady).toBe(true);
    await expect(controller.syncNow()).resolves.toBe("applied");
    controller.dispose();
    expect(scheduled).toHaveLength(0);
  });

  it("dispose cancels armed backoff timer", async () => {
    const scheduled: Array<() => void> = [];

    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        throw new Error("fail");
      },
      applyBundle: () => "accepted",
      schedule: (fn) => {
        scheduled.push(fn);
        return {
          cancel: () => {
            const idx = scheduled.indexOf(fn);
            if (idx >= 0) {
              scheduled.splice(idx, 1);
            }
          },
        };
      },
      retryBaseMs: 100,
    });

    await expect(controller.syncNow()).resolves.toBe("retry-scheduled");
    expect(scheduled).toHaveLength(1);
    controller.dispose();
    expect(scheduled).toHaveLength(0);
  });

  it("rejected apply does not report false applied", async () => {
    const scheduled: Array<() => void> = [];

    const controller = createNetworkProjectionController({
      pullBundle: async () => "bundle",
      applyBundle: () => "rejected",
      schedule: (fn) => {
        scheduled.push(fn);
        return {
          cancel: () => {
            const idx = scheduled.indexOf(fn);
            if (idx >= 0) {
              scheduled.splice(idx, 1);
            }
          },
        };
      },
      retryBaseMs: 10,
    });

    await expect(controller.syncNow()).resolves.toBe("retry-scheduled");
    expect(controller.projectionReady).toBe(false);
    expect(scheduled).toHaveLength(1);
    controller.dispose();
  });

  it("equal-rev bundle refreshes registry without moving selection", () => {
    let local: SelectedChainAuthoritySnapshot = {
      chainId: "fetchhub-4",
      revision: 3,
    };
    let infos = [{ chainId: "fetchhub-4", rpc: "old" }];
    let snapshotWrites = 0;

    const result = applyNetworkProjectionBundle(
      {
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          snapshotWrites += 1;
          local = { ...next };
        },
        setChainInfos: (next) => {
          infos = next as typeof infos;
        },
      },
      {
        selection: { chainId: "fetchhub-4", revision: 3 },
        chainInfos: [{ chainId: "fetchhub-4", rpc: "new" }],
      }
    );

    expect(result).toBe("already-current");
    expect(local).toEqual({ chainId: "fetchhub-4", revision: 3 });
    expect(infos[0].rpc).toBe("new");
    // already-current must not rewrite selection snapshot as a move.
    expect(snapshotWrites).toBe(0);
  });

  it("revision 0 placeholder cannot become ready via bundle apply", () => {
    let local = { chainId: "fetchhub-4", revision: 0 };
    let infos = [{ chainId: "fetchhub-4", rpc: "old" }];

    const result = applyNetworkProjectionBundle(
      {
        getLocalSnapshot: () => ({ ...local }),
        setLocalSnapshot: (next) => {
          local = { ...next };
        },
        setChainInfos: (next) => {
          infos = next as typeof infos;
        },
      },
      {
        selection: { chainId: "fetchhub-4", revision: 0 },
        chainInfos: [{ chainId: "fetchhub-4", rpc: "new" }],
      }
    );

    expect(result).toBe("stale");
    expect(infos[0].rpc).toBe("old");
    expect(local.revision).toBe(0);
  });
});
