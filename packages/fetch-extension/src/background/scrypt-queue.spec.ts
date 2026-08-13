import {
  runScryptExclusive,
  SCRYPT_INACTIVITY_TIMEOUT_MS,
} from "./scrypt-queue";

type ScryptQueueModule = typeof import("./scrypt-queue");

/**
 * The queue keeps its wedge state in module scope on purpose (one service
 * worker, one working-set budget). Tests that abandon a working set therefore
 * need their own module instance so the budget does not leak into later tests.
 */
function loadIsolatedQueue(): ScryptQueueModule {
  let queue!: ScryptQueueModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    queue = require("./scrypt-queue");
  });
  return queue;
}

/**
 * Capture an outcome without ever rejecting. A regression that rejects a
 * promise which is only asserted later must fail as an assertion instead of
 * killing the worker with an unhandled rejection before jest can report.
 */
function settled<T>(
  promise: Promise<T>
): Promise<{ status: "resolved"; value: T } | { status: "rejected" }> {
  return promise.then(
    (value) => ({ status: "resolved" as const, value }),
    () => ({ status: "rejected" as const })
  );
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

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

  it("rejects timed-out caller and waiters without starting another working set", async () => {
    const queue = loadIsolatedQueue();
    jest.useFakeTimers();
    try {
      let stalledSignal: AbortSignal | undefined;
      let finishStalled!: (value: string) => void;
      let interactiveRan = false;
      let backgroundRan = false;
      const stalled = queue.runScryptExclusive(async (signal) => {
        stalledSignal = signal;
        return await new Promise<string>((resolve) => {
          finishStalled = resolve;
        });
      });
      const interactive = queue.runScryptExclusive(async () => {
        interactiveRan = true;
        return "interactive";
      });
      const background = queue.runScryptExclusive(async () => {
        backgroundRan = true;
        return "background";
      }, "background");
      const stalledRejection = expect(stalled).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );

      await Promise.resolve();
      expect(interactiveRan).toBe(false);
      expect(backgroundRan).toBe(false);

      // Timeout rejects the caller and any waiters immediately, but the single
      // working-set slot stays occupied until the underlying Promise settles.
      jest.runOnlyPendingTimers();

      await stalledRejection;
      await expect(interactive).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );
      await expect(background).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );
      expect(stalledSignal?.aborted).toBe(true);
      expect(interactiveRan).toBe(false);
      expect(backgroundRan).toBe(false);

      const duringWedge = queue.runScryptExclusive(async () => "during-wedge");
      await expect(duringWedge).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );

      // Leave fake timers so the late underlying settle is delivered on the
      // real microtask queue, then confirm the wedge clears for new work.
      jest.useRealTimers();
      await new Promise<void>((resolve) => {
        finishStalled("late");
        queueMicrotask(() => queueMicrotask(resolve));
      });

      await expect(
        queue.runScryptExclusive(async () => "recovered")
      ).resolves.toBe("recovered");
    } finally {
      jest.useRealTimers();
    }
  });

  it("drains exactly once after a timed-out operation rejects late", async () => {
    const queue = loadIsolatedQueue();
    jest.useFakeTimers();
    try {
      let rejectUnderlying!: (error: Error) => void;
      let nextStarts = 0;
      const stalled = queue.runScryptExclusive(
        async () =>
          await new Promise<string>((_resolve, reject) => {
            rejectUnderlying = reject;
          })
      );
      const queued = queue.runScryptExclusive(async () => {
        nextStarts += 1;
        return "queued";
      });
      const timeout = expect(stalled).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );

      await Promise.resolve();
      jest.advanceTimersByTime(queue.SCRYPT_INACTIVITY_TIMEOUT_MS);
      await timeout;
      await expect(queued).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );
      expect(nextStarts).toBe(0);

      jest.useRealTimers();
      await new Promise<void>((resolve) => {
        rejectUnderlying(new Error("abort acknowledged"));
        queueMicrotask(() => queueMicrotask(resolve));
      });
      expect(nextStarts).toBe(0);

      await expect(
        queue.runScryptExclusive(async () => {
          nextStarts += 1;
          return "next";
        })
      ).resolves.toBe("next");
      expect(nextStarts).toBe(1);
      await Promise.resolve();
      expect(nextStarts).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("reopens the queue for new work after the wedge recovery delay", async () => {
    const queue = loadIsolatedQueue();
    jest.useFakeTimers();
    try {
      let stalledSignal: AbortSignal | undefined;
      const stalled = queue.runScryptExclusive(async (signal) => {
        stalledSignal = signal;
        return await new Promise<string>(() => undefined);
      });
      const timedOut = expect(stalled).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );

      await Promise.resolve();
      jest.advanceTimersByTime(queue.SCRYPT_INACTIVITY_TIMEOUT_MS);
      await timedOut;
      expect(stalledSignal?.aborted).toBe(true);

      // Inside the grace period the slot is still considered occupied.
      await expect(
        queue.runScryptExclusive(async () => "during-wedge")
      ).rejects.toBeInstanceOf(queue.ScryptInactivityTimeoutError);

      // The provider never acknowledged the abort, and the keep-alive alarm
      // means no fresh service worker is coming: write the working set off.
      jest.advanceTimersByTime(queue.SCRYPT_WEDGE_RECOVERY_DELAY_MS);
      await flushMicrotasks();

      await expect(
        queue.runScryptExclusive(async () => "recovered")
      ).resolves.toBe("recovered");
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps one live working set after recovering from a wedge", async () => {
    const queue = loadIsolatedQueue();
    jest.useFakeTimers();
    try {
      let finishStalled!: (value: string) => void;
      const stalled = queue.runScryptExclusive(
        async () =>
          await new Promise<string>((resolve) => {
            finishStalled = resolve;
          })
      );
      const timedOut = expect(stalled).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );
      await Promise.resolve();
      jest.advanceTimersByTime(queue.SCRYPT_INACTIVITY_TIMEOUT_MS);
      await timedOut;
      jest.advanceTimersByTime(queue.SCRYPT_WEDGE_RECOVERY_DELAY_MS);
      await flushMicrotasks();

      let releaseSecond!: () => void;
      const secondGate = new Promise<void>((resolve) => {
        releaseSecond = resolve;
      });
      let thirdStarts = 0;
      const second = queue.runScryptExclusive(async () => {
        await secondGate;
        return "second";
      });
      const third = queue.runScryptExclusive(async () => {
        thirdStarts += 1;
        return "third";
      });
      const secondOutcome = settled(second);
      const thirdOutcome = settled(third);
      await flushMicrotasks();
      expect(thirdStarts).toBe(0);

      // A late settle of the abandoned operation must not release the slot the
      // second operation now owns, or the third would run beside it.
      finishStalled("late");
      await flushMicrotasks();
      expect(thirdStarts).toBe(0);

      releaseSecond();
      await expect(secondOutcome).resolves.toEqual({
        status: "resolved",
        value: "second",
      });
      await expect(thirdOutcome).resolves.toEqual({
        status: "resolved",
        value: "third",
      });
      expect(thirdStarts).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("stays wedged when a second working set never settles either", async () => {
    const queue = loadIsolatedQueue();
    jest.useFakeTimers();
    try {
      let finishFirst!: (value: string) => void;
      const first = queue.runScryptExclusive(
        async () =>
          await new Promise<string>((resolve) => {
            finishFirst = resolve;
          })
      );
      const firstTimedOut = expect(first).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );
      await Promise.resolve();
      jest.advanceTimersByTime(queue.SCRYPT_INACTIVITY_TIMEOUT_MS);
      await firstTimedOut;
      jest.advanceTimersByTime(queue.SCRYPT_WEDGE_RECOVERY_DELAY_MS);
      await flushMicrotasks();

      const second = queue.runScryptExclusive(
        async () => await new Promise<string>(() => undefined)
      );
      const secondTimedOut = expect(second).rejects.toBeInstanceOf(
        queue.ScryptInactivityTimeoutError
      );
      await flushMicrotasks();
      jest.advanceTimersByTime(queue.SCRYPT_INACTIVITY_TIMEOUT_MS);
      await secondTimedOut;

      // The write-off budget is spent: a second abandoned working set would
      // stack a third allocation, so the queue must keep failing fast.
      jest.advanceTimersByTime(queue.SCRYPT_WEDGE_RECOVERY_DELAY_MS);
      await flushMicrotasks();
      await expect(
        queue.runScryptExclusive(async () => "still-wedged")
      ).rejects.toBeInstanceOf(queue.ScryptInactivityTimeoutError);

      // The first operation settling late returns its memory, which unblocks
      // the recovery that the budget had refused.
      finishFirst("late");
      await flushMicrotasks();
      await expect(
        queue.runScryptExclusive(async () => "recovered")
      ).resolves.toBe("recovered");
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
