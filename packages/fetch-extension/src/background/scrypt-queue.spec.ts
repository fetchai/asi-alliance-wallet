import {
  runScryptExclusive,
  SCRYPT_INACTIVITY_TIMEOUT_MS,
  ScryptInactivityTimeoutError,
} from "./scrypt-queue";

describe("runScryptExclusive", () => {
  it("runs only one operation at a time", async () => {
    let active = 0;
    let maxConcurrent = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runScryptExclusive(async () => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      await firstGate;
      active -= 1;
      return "first";
    });
    const second = runScryptExclusive(async () => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      active -= 1;
      return "second";
    });

    await Promise.resolve();
    expect(active).toBe(1);

    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(maxConcurrent).toBe(1);
  });

  it("continues after an operation rejects", async () => {
    const first = runScryptExclusive(async () => {
      throw new Error("failed");
    });
    const second = runScryptExclusive(async () => "recovered");

    await expect(first).rejects.toThrow("failed");
    await expect(second).resolves.toBe("recovered");
  });

  it("rejects a timed-out caller but holds both priorities until underlying settle", async () => {
    jest.useFakeTimers();
    try {
      let stalledSignal: AbortSignal | undefined;
      let finishStalled!: (value: string) => void;
      let interactiveRan = false;
      let backgroundRan = false;
      const stalled = runScryptExclusive(async (signal) => {
        stalledSignal = signal;
        return await new Promise<string>((resolve) => {
          finishStalled = resolve;
        });
      });
      const interactive = runScryptExclusive(async () => {
        interactiveRan = true;
        return "interactive";
      });
      const background = runScryptExclusive(async () => {
        backgroundRan = true;
        return "background";
      }, "background");
      const stalledRejection = expect(stalled).rejects.toBeInstanceOf(
        ScryptInactivityTimeoutError
      );

      await Promise.resolve();
      expect(interactiveRan).toBe(false);
      expect(backgroundRan).toBe(false);

      // The caller times out immediately, but no queued working set may start
      // until the provider acknowledges abort by settling its Promise.
      jest.runOnlyPendingTimers();

      await stalledRejection;
      expect(stalledSignal?.aborted).toBe(true);
      expect(interactiveRan).toBe(false);
      expect(backgroundRan).toBe(false);

      finishStalled("late");

      await expect(Promise.all([interactive, background])).resolves.toEqual([
        "interactive",
        "background",
      ]);
      expect(interactiveRan).toBe(true);
      expect(backgroundRan).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("drains exactly once after a timed-out operation rejects late", async () => {
    jest.useFakeTimers();
    try {
      let rejectUnderlying!: (error: Error) => void;
      let nextStarts = 0;
      const stalled = runScryptExclusive(
        async () =>
          await new Promise<string>((_resolve, reject) => {
            rejectUnderlying = reject;
          })
      );
      const next = runScryptExclusive(async () => {
        nextStarts += 1;
        return "next";
      });
      const timeout = expect(stalled).rejects.toBeInstanceOf(
        ScryptInactivityTimeoutError
      );

      await Promise.resolve();
      jest.advanceTimersByTime(SCRYPT_INACTIVITY_TIMEOUT_MS);
      await timeout;
      expect(nextStarts).toBe(0);

      rejectUnderlying(new Error("abort acknowledged"));
      await expect(next).resolves.toBe("next");
      expect(nextStarts).toBe(1);
      await Promise.resolve();
      expect(nextStarts).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps a slow operation alive while it continues reporting progress", async () => {
    jest.useFakeTimers();
    try {
      let reportProgress!: () => void;
      let finish!: (value: string) => void;
      const operation = runScryptExclusive(async (_signal, report) => {
        reportProgress = report;
        return await new Promise<string>((resolve) => {
          finish = resolve;
        });
      });
      const result = expect(operation).resolves.toBe("completed");

      await Promise.resolve();
      for (let index = 0; index < 3; index++) {
        jest.advanceTimersByTime(SCRYPT_INACTIVITY_TIMEOUT_MS - 1);
        reportProgress();
      }

      finish("completed");
      await result;
    } finally {
      jest.useRealTimers();
    }
  });

  it("runs interactive work before queued background work", async () => {
    const order: string[] = [];
    let releaseRunning!: () => void;
    const runningGate = new Promise<void>((resolve) => {
      releaseRunning = resolve;
    });

    const running = runScryptExclusive(async () => {
      order.push("background-running");
      await runningGate;
      return "running";
    }, "background");
    const queuedBackground = runScryptExclusive(async () => {
      order.push("background-queued");
      return "background";
    }, "background");

    await Promise.resolve();

    const interactive = runScryptExclusive(async () => {
      order.push("interactive");
      return "interactive";
    });

    releaseRunning();

    await expect(
      Promise.all([running, queuedBackground, interactive])
    ).resolves.toEqual(["running", "background", "interactive"]);
    expect(order).toEqual([
      "background-running",
      "interactive",
      "background-queued",
    ]);
  });

  it("allows background work through during a sustained interactive burst", async () => {
    const order: string[] = [];
    let releaseRunning!: () => void;
    const runningGate = new Promise<void>((resolve) => {
      releaseRunning = resolve;
    });

    const running = runScryptExclusive(async () => {
      await runningGate;
    }, "background");
    const background = runScryptExclusive(async () => {
      order.push("background");
    }, "background");
    const interactive = Array.from({ length: 6 }, (_, index) =>
      runScryptExclusive(async () => {
        order.push(`interactive-${index + 1}`);
      })
    );

    releaseRunning();
    await Promise.all([running, background, ...interactive]);

    expect(order).toEqual([
      "interactive-1",
      "interactive-2",
      "interactive-3",
      "interactive-4",
      "background",
      "interactive-5",
      "interactive-6",
    ]);
  });

  it("does not carry interactive burst debt from a period with no background work", async () => {
    const order: string[] = [];
    let releaseLeading!: () => void;
    let releaseFourth!: () => void;
    let markFourthStarted!: () => void;
    const leadingGate = new Promise<void>((resolve) => {
      releaseLeading = resolve;
    });
    const fourthGate = new Promise<void>((resolve) => {
      releaseFourth = resolve;
    });
    const fourthStarted = new Promise<void>((resolve) => {
      markFourthStarted = resolve;
    });

    const leading = runScryptExclusive(async () => {
      await leadingGate;
    });
    const queued = [1, 2, 3, 4, 5, 6].map((index) =>
      runScryptExclusive(async () => {
        order.push(`interactive-${index}`);
        if (index === 4) {
          markFourthStarted();
          await fourthGate;
        }
      })
    );

    releaseLeading();
    await fourthStarted;

    const background = runScryptExclusive(async () => {
      order.push("background");
    }, "background");
    releaseFourth();

    await Promise.all([leading, ...queued, background]);
    expect(order).toEqual([
      "interactive-1",
      "interactive-2",
      "interactive-3",
      "interactive-4",
      "interactive-5",
      "interactive-6",
      "background",
    ]);
  });
});
