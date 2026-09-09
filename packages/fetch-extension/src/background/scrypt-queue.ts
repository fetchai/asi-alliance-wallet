export type ScryptQueuePriority = "interactive" | "background";

type QueueEntry<T> = {
  run: (signal: AbortSignal, reportProgress: () => void) => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const interactiveQueue: QueueEntry<unknown>[] = [];
const backgroundQueue: QueueEntry<unknown>[] = [];
const MAX_CONSECUTIVE_INTERACTIVE = 4;
export const SCRYPT_INACTIVITY_TIMEOUT_MS = 30_000;
/**
 * Grace period between a timeout and giving up on the working set it holds.
 * An abort that is merely late still settles the underlying Promise inside
 * this window and releases the slot the normal way.
 */
export const SCRYPT_WEDGE_RECOVERY_DELAY_MS = 30_000;
/**
 * How many timed-out working sets may be written off as never settling.
 *
 * The invariant is deliberately "at most one *live* memory-heavy working set
 * plus at most this many abandoned ones", not "at most one allocation ever":
 * a working set whose provider stopped ticking cannot be freed from here, and
 * a service worker kept alive by the keep-alive alarm never recycles it, so a
 * strict rule would leave the wallet unable to derive any key until the user
 * manually reloads the extension. One write-off bounds peak memory at two
 * scrypt allocations; beyond that the queue stays wedged.
 */
const MAX_ABANDONED_WORKING_SETS = 1;
let isRunning = false;
let consecutiveInteractive = 0;
// Set while a timed-out operation still occupies the single working-set slot.
// Waiters must fail fast rather than hang until a settle that may never come
// (e.g. MessageChannel ticks lost while setTimeout still fires). The slot is
// released either by the underlying settle or, after the recovery delay, by
// writing the working set off against the budget above.
let queueWedged = false;
// Timed-out working sets whose slot was released without a settle. A late
// settle proves the provider finally freed one and gives the budget back.
let abandonedWorkingSets = 0;
// Recovery attempt of a wedged run that the budget could not accommodate yet.
let blockedWedgeRecovery: (() => void) | undefined;

export class ScryptInactivityTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Scrypt operation made no progress for ${timeoutMs}ms`);
    this.name = "ScryptInactivityTimeoutError";
  }
}

export function isScryptInactivityTimeoutError(
  error: unknown
): error is ScryptInactivityTimeoutError {
  return (
    error instanceof Error && error.name === "ScryptInactivityTimeoutError"
  );
}

function inactivityTimeoutError(): ScryptInactivityTimeoutError {
  return new ScryptInactivityTimeoutError(SCRYPT_INACTIVITY_TIMEOUT_MS);
}

/**
 * No-op in the browser, where timers are numbers. In Node — that is, under the
 * test runner — it stops a pending timer from holding the process open. The
 * recovery timer below is meant to fire, so on the wedge path no clearTimeout
 * ever reaches it and this is the only thing keeping a run from hanging.
 */
function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
}

function rejectQueuedWaiters(reason: Error): void {
  const pending = interactiveQueue.splice(0).concat(backgroundQueue.splice(0));
  consecutiveInteractive = 0;
  for (const entry of pending) {
    entry.reject(reason);
  }
}

function takeNextEntry(): QueueEntry<unknown> | undefined {
  if (interactiveQueue.length === 0 && backgroundQueue.length === 0) {
    consecutiveInteractive = 0;
    return undefined;
  }

  if (backgroundQueue.length === 0) {
    consecutiveInteractive = 0;
    return interactiveQueue.shift();
  }

  if (
    backgroundQueue.length > 0 &&
    (interactiveQueue.length === 0 ||
      consecutiveInteractive >= MAX_CONSECUTIVE_INTERACTIVE)
  ) {
    consecutiveInteractive = 0;
    return backgroundQueue.shift();
  }

  const interactive = interactiveQueue.shift();
  if (interactive) {
    consecutiveInteractive += 1;
    return interactive;
  }

  consecutiveInteractive = 0;
  return backgroundQueue.shift();
}

function drainQueue(): void {
  if (isRunning) {
    return;
  }

  const entry = takeNextEntry();
  if (!entry) {
    return;
  }

  isRunning = true;
  const abortController = new AbortController();
  let callerSettled = false;
  let underlyingSettled = false;
  let timedOut = false;
  let slotAbandoned = false;
  let watchdog: ReturnType<typeof setTimeout>;
  let recovery: ReturnType<typeof setTimeout> | undefined;
  const attemptWedgeRecovery = (): void => {
    if (underlyingSettled || slotAbandoned) {
      return;
    }
    if (abandonedWorkingSets >= MAX_ABANDONED_WORKING_SETS) {
      // Releasing the slot now would stack another memory-heavy allocation on
      // top of one already written off. Stay wedged — every caller keeps
      // failing fast — and wait for an earlier abandoned operation to settle
      // late and hand its memory back.
      blockedWedgeRecovery = attemptWedgeRecovery;
      return;
    }
    // The provider never acknowledged the abort. Write this working set off
    // against the budget so the wallet can derive keys again in this service
    // worker instead of staying dead until a manual extension reload.
    slotAbandoned = true;
    abandonedWorkingSets += 1;
    queueWedged = false;
    isRunning = false;
    drainQueue();
  };
  const resetWatchdog = (): void => {
    if (timedOut || underlyingSettled) {
      return;
    }
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (timedOut || underlyingSettled) {
        return;
      }
      timedOut = true;
      queueWedged = true;
      clearTimeout(watchdog);
      abortController.abort();
      const timeoutError = inactivityTimeoutError();
      if (!callerSettled) {
        callerSettled = true;
        entry.reject(timeoutError);
      }
      // Do not start another memory-heavy working set yet. Fail waiters
      // immediately so unlock/import/switch cannot hang forever behind a
      // never-settling op, and re-check once the grace period is over.
      rejectQueuedWaiters(inactivityTimeoutError());
      recovery = setTimeout(
        attemptWedgeRecovery,
        SCRYPT_WEDGE_RECOVERY_DELAY_MS
      );
      unrefTimer(recovery);
    }, SCRYPT_INACTIVITY_TIMEOUT_MS);
    unrefTimer(watchdog);
  };
  const releaseAfterUnderlyingSettle = (): void => {
    if (underlyingSettled) {
      return;
    }
    underlyingSettled = true;
    clearTimeout(watchdog);
    if (recovery !== undefined) {
      clearTimeout(recovery);
    }
    if (slotAbandoned) {
      // The live slot belongs to a later operation now, so it must not be
      // touched here. Only the write-off is reversed: this settle is the
      // provider's acknowledgement that the working set is finally free.
      abandonedWorkingSets = Math.max(0, abandonedWorkingSets - 1);
      const blocked = blockedWedgeRecovery;
      blockedWedgeRecovery = undefined;
      blocked?.();
      return;
    }
    if (blockedWedgeRecovery === attemptWedgeRecovery) {
      blockedWedgeRecovery = undefined;
    }
    queueWedged = false;
    isRunning = false;
    drainQueue();
  };
  resetWatchdog();

  void (async () => {
    try {
      const value = await entry.run(abortController.signal, resetWatchdog);
      if (!callerSettled) {
        callerSettled = true;
        entry.resolve(value);
      }
    } catch (error) {
      if (!callerSettled) {
        callerSettled = true;
        entry.reject(error);
      }
    } finally {
      releaseAfterUnderlyingSettle();
    }
  })();
}

/**
 * Keep scrypt memory usage bounded to one operation while allowing user actions
 * to pass queued cache-repair work. After a bounded interactive burst, one
 * background job is allowed through to prevent starvation. A task that reports
 * no progress for the inactivity window rejects its caller and receives an
 * AbortSignal. The queue stays occupied until the underlying Promise actually
 * settles, which is the provider's acknowledgement that its working set is no
 * longer active, and while that slot is held every further caller is rejected
 * immediately instead of waiting indefinitely.
 *
 * If no settle arrives within the recovery delay, the working set is written
 * off (see MAX_ABANDONED_WORKING_SETS) and the slot is reopened, because the
 * keep-alive alarm keeps this service worker from ever recycling on its own.
 * Once the write-off budget is spent, the queue stays wedged until an
 * abandoned operation settles late or a new service worker starts.
 */
export function runScryptExclusive<T>(
  run: (signal: AbortSignal, reportProgress: () => void) => Promise<T>,
  priority: ScryptQueuePriority = "interactive"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (queueWedged) {
      reject(inactivityTimeoutError());
      return;
    }
    const entry: QueueEntry<T> = { run, resolve, reject };
    const queue =
      priority === "background" ? backgroundQueue : interactiveQueue;
    queue.push(entry as QueueEntry<unknown>);
    drainQueue();
  });
}
