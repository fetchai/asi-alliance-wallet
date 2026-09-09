/**
 * Fake Blockfrost transport with monotonic sequence for tests.
 * Sequence advances only when a request reaches the raw transport.
 * Deferred answers only — no sleep / real network.
 */

export type FakeBlockfrostDeferred = {
  endpoint: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  promise: Promise<unknown>;
};

export type FakeBlockfrostTransport = {
  rawRequest: jest.Mock;
  /** Monotonic ids of successful raw entries (1-based order of entry). */
  sequence: number[];
  deferred: FakeBlockfrostDeferred[];
  client: {
    request: (endpoint: string, ...args: unknown[]) => Promise<unknown>;
  };
  /** Enqueue a deferred raw response for the next request (FIFO). */
  deferNext: () => FakeBlockfrostDeferred;
  flushAll: (value?: unknown) => void;
  providerCount: () => number;
};

export function createFakeBlockfrostTransport(): FakeBlockfrostTransport {
  const sequence: number[] = [];
  const deferred: FakeBlockfrostDeferred[] = [];
  let autoSeq = 0;

  const rawRequest = jest.fn((endpoint: string, ..._args: unknown[]) => {
    autoSeq += 1;
    sequence.push(autoSeq);

    if (deferred.length > 0) {
      const item = deferred.shift()!;
      item.endpoint = endpoint;
      return item.promise;
    }

    return Promise.resolve({ ok: true, endpoint });
  });

  return {
    rawRequest,
    sequence,
    deferred,
    client: {
      request: rawRequest as FakeBlockfrostTransport["client"]["request"],
    },
    deferNext: () => {
      let resolve!: (value: unknown) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<unknown>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const item: FakeBlockfrostDeferred = {
        endpoint: "",
        resolve,
        reject,
        promise,
      };
      deferred.push(item);
      return item;
    },
    flushAll: (value: unknown = { ok: true }) => {
      while (deferred.length > 0) {
        deferred.shift()!.resolve(value);
      }
    },
    providerCount: () => sequence.length,
  };
}
