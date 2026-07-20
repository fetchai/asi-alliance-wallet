import {
  createNetworkProjectionController,
  type ProjectionSyncOutcome,
} from "./controller";

describe("createNetworkProjectionController", () => {
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it("coalesces invalidate during in-flight pull into a second pull", async () => {
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
    release();
    await flush();
    await flush();
    expect(pulls).toBe(2);
    expect(controller.projectionReady).toBe(true);
    controller.dispose();
  });

  it("does not hot-loop on permanent errors and keeps a single retry timer", async () => {
    const scheduled: Array<{ ms: number; fn: () => void }> = [];
    let pulls = 0;

    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        pulls += 1;
        throw new Error("transport down");
      },
      applyBundle: () => "accepted",
      schedule: (fn, ms) => {
        scheduled.push({ ms, fn });
        return {
          cancel: () => {
            const idx = scheduled.findIndex((s) => s.fn === fn);
            if (idx >= 0) {
              scheduled.splice(idx, 1);
            }
          },
        };
      },
      retryBaseMs: 100,
      retryFactor: 2,
      retryCapMs: 1000,
    });

    const outcome = await controller.syncNow();
    expect(outcome).toBe("retry-scheduled");
    expect(controller.projectionReady).toBe(false);
    expect(pulls).toBe(1);
    expect(scheduled).toHaveLength(1);

    const due = scheduled.shift()!;
    due.fn();
    await flush();
    expect(pulls).toBe(2);
    expect(scheduled).toHaveLength(1);

    controller.dispose();
    expect(scheduled).toHaveLength(0);
  });

  it("cold start failure keeps not-ready until retry succeeds", async () => {
    let shouldFail = true;
    let pulls = 0;
    const scheduled: Array<() => void> = [];

    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        pulls += 1;
        if (shouldFail) {
          throw new Error("fail");
        }
        return "ok";
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
      retryBaseMs: 10,
    });

    expect(controller.projectionReady).toBe(false);
    await expect(controller.syncNow()).resolves.toBe("retry-scheduled");
    expect(controller.projectionReady).toBe(false);

    shouldFail = false;
    scheduled[0]();
    await flush();
    expect(pulls).toBe(2);
    expect(controller.projectionReady).toBe(true);
    controller.dispose();
  });

  it("syncNow returns applied when pull succeeds", async () => {
    const controller = createNetworkProjectionController({
      pullBundle: async () => "bundle",
      applyBundle: () => "accepted",
    });
    await expect(controller.syncNow()).resolves.toBe(
      "applied" as ProjectionSyncOutcome
    );
    expect(controller.projectionReady).toBe(true);
    controller.dispose();
  });

  it("invalidate during backoff keeps the existing timer deadline", async () => {
    const scheduled: Array<{ ms: number; fn: () => void; cancel: () => void }> =
      [];

    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        throw new Error("fail");
      },
      applyBundle: () => "accepted",
      schedule: (fn, ms) => {
        const entry = {
          ms,
          fn,
          cancel: () => {
            const idx = scheduled.indexOf(entry);
            if (idx >= 0) {
              scheduled.splice(idx, 1);
            }
          },
        };
        scheduled.push(entry);
        return entry;
      },
      retryBaseMs: 200,
      retryFactor: 2,
      retryCapMs: 5000,
    });

    await controller.syncNow();
    expect(scheduled).toHaveLength(1);
    const first = scheduled[0];

    controller.invalidate();
    // Must not cancel/reschedule (would postpone deadline indefinitely).
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toBe(first);
    controller.dispose();
  });

  it("dispose discards in-flight pull before apply", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let applied = 0;

    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        await gate;
        return { chainId: "fetchhub-4", revision: 1 };
      },
      applyBundle: () => {
        applied += 1;
        return "accepted";
      },
    });

    const sync = controller.syncNow();
    await flush();
    controller.dispose();
    release();
    await expect(sync).rejects.toThrow(
      /network_projection_controller_disposed/
    );
    expect(applied).toBe(0);
    expect(controller.projectionReady).toBe(false);
  });

  it("onPullError throw still yields retry-scheduled", async () => {
    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        throw new Error("transport");
      },
      applyBundle: () => "accepted",
      onPullError: () => {
        throw new Error("logger failed");
      },
      schedule: () => ({
        cancel: () => undefined,
      }),
      retryBaseMs: 10,
    });

    await expect(controller.syncNow()).resolves.toBe("retry-scheduled");
    controller.dispose();
  });

  it("rejected apply does not count as syncNow applied and arms backoff", async () => {
    const coldScheduled: Array<{ ms: number; fn: () => void }> = [];
    const controller = createNetworkProjectionController({
      pullBundle: async () => "bundle",
      applyBundle: () => "rejected",
      schedule: (fn, ms) => {
        coldScheduled.push({ ms, fn });
        return {
          cancel: () => {
            const idx = coldScheduled.findIndex((s) => s.fn === fn);
            if (idx >= 0) {
              coldScheduled.splice(idx, 1);
            }
          },
        };
      },
      retryBaseMs: 50,
    });

    await expect(controller.syncNow()).resolves.toBe("retry-scheduled");
    expect(controller.projectionReady).toBe(false);
    expect(coldScheduled).toHaveLength(1);
    controller.dispose();
    expect(coldScheduled).toHaveLength(0);

    // Steady-state reject path: stay ready, arm one retry.
    const steadyScheduled: Array<{ ms: number; fn: () => void }> = [];
    const readyController = createNetworkProjectionController({
      pullBundle: async () => "bundle",
      applyBundle: (() => {
        let n = 0;
        return () => {
          n += 1;
          return n === 1 ? "accepted" : "rejected";
        };
      })(),
      schedule: (fn, ms) => {
        steadyScheduled.push({ ms, fn });
        return {
          cancel: () => {
            const idx = steadyScheduled.findIndex((s) => s.fn === fn);
            if (idx >= 0) {
              steadyScheduled.splice(idx, 1);
            }
          },
        };
      },
      retryBaseMs: 50,
    });

    await expect(readyController.syncNow()).resolves.toBe("applied");
    expect(steadyScheduled).toHaveLength(0);
    await expect(readyController.syncNow()).resolves.toBe("retry-scheduled");
    expect(readyController.projectionReady).toBe(true);
    expect(steadyScheduled).toHaveLength(1);
    readyController.dispose();
    expect(steadyScheduled).toHaveLength(0);
  });

  it("syncNow after dispose throws and invalidate is a no-op", async () => {
    let pulls = 0;
    const scheduled: Array<{ ms: number; fn: () => void }> = [];
    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        pulls += 1;
        return "bundle";
      },
      applyBundle: () => "accepted",
      schedule: (fn, ms) => {
        scheduled.push({ ms, fn });
        return {
          cancel: () => {
            const idx = scheduled.findIndex((s) => s.fn === fn);
            if (idx >= 0) {
              scheduled.splice(idx, 1);
            }
          },
        };
      },
      retryBaseMs: 50,
    });

    await expect(controller.syncNow()).resolves.toBe("applied");
    controller.dispose();

    await expect(controller.syncNow()).rejects.toThrow(
      /network_projection_controller_disposed/
    );
    const pullsAfterDispose = pulls;
    controller.invalidate();
    await flush();
    expect(pulls).toBe(pullsAfterDispose);
    expect(scheduled).toHaveLength(0);
  });

  it("success then coalesced follow-up failure returns retry-scheduled with timer armed", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pulls = 0;
    const scheduled: Array<{ ms: number; fn: () => void }> = [];

    const controller = createNetworkProjectionController({
      pullBundle: async () => {
        pulls += 1;
        if (pulls === 1) {
          await gate;
          return "ok";
        }
        throw new Error("coalesced transport fail");
      },
      applyBundle: () => "accepted",
      schedule: (fn, ms) => {
        scheduled.push({ ms, fn });
        return {
          cancel: () => {
            const idx = scheduled.findIndex((s) => s.fn === fn);
            if (idx >= 0) {
              scheduled.splice(idx, 1);
            }
          },
        };
      },
      retryBaseMs: 50,
    });

    const sync = controller.syncNow();
    await flush();
    expect(pulls).toBe(1);

    // Coalesce a second dirty while the first pull is still in flight.
    controller.invalidate();
    release();

    await expect(sync).resolves.toBe("retry-scheduled");
    expect(controller.projectionReady).toBe(true);
    expect(pulls).toBe(2);
    expect(scheduled).toHaveLength(1);

    controller.dispose();
    expect(scheduled).toHaveLength(0);
  });
});
