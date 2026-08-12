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
let isRunning = false;
let consecutiveInteractive = 0;

export class ScryptInactivityTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Scrypt operation made no progress for ${timeoutMs}ms`);
    this.name = "ScryptInactivityTimeoutError";
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
  let watchdog: ReturnType<typeof setTimeout>;
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
      clearTimeout(watchdog);
      abortController.abort();
      if (!callerSettled) {
        callerSettled = true;
        entry.reject(
          new ScryptInactivityTimeoutError(SCRYPT_INACTIVITY_TIMEOUT_MS)
        );
      }
    }, SCRYPT_INACTIVITY_TIMEOUT_MS);
  };
  const releaseAfterUnderlyingSettle = (): void => {
    if (underlyingSettled) {
      return;
    }
    underlyingSettled = true;
    clearTimeout(watchdog);
    isRunning = false;
    drainQueue();
  };
  resetWatchdog();

  Promise.resolve()
    .then(() => entry.run(abortController.signal, resetWatchdog))
    .then(
      (value) => {
        if (!callerSettled) {
          callerSettled = true;
          entry.resolve(value);
        }
        releaseAfterUnderlyingSettle();
      },
      (error) => {
        if (!callerSettled) {
          callerSettled = true;
          entry.reject(error);
        }
        releaseAfterUnderlyingSettle();
      }
    );
}

/**
 * Keep scrypt memory usage bounded to one operation while allowing user actions
 * to pass queued cache-repair work. After a bounded interactive burst, one
 * background job is allowed through to prevent starvation. A task that reports
 * no progress for the inactivity window rejects its caller and receives an
 * AbortSignal. The queue remains occupied until the underlying Promise actually
 * settles, which is the provider's acknowledgement that its working set is no
 * longer active.
 */
export function runScryptExclusive<T>(
  run: (signal: AbortSignal, reportProgress: () => void) => Promise<T>,
  priority: ScryptQueuePriority = "interactive"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const entry: QueueEntry<T> = { run, resolve, reject };
    const queue =
      priority === "background" ? backgroundQueue : interactiveQueue;
    queue.push(entry as QueueEntry<unknown>);
    drainQueue();
  });
}
