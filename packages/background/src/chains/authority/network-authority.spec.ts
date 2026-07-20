import { MemoryKVStore } from "@keplr-wallet/common";
import { PREFERRED_DEFAULT_CHAIN_ID } from "../default-chain";
import { NetworkAuthority } from "./network-authority";
import {
  createTestNetworkAuthority,
  MemoryAuthorityRegistry,
  peekStoredSnapshot,
} from "./network-authority.test-helpers";
import { NetworkAuthoritySnapshot } from "./types";

describe("NetworkAuthority", () => {
  describe("hydrate", () => {
    it("seeds revision 1 from legacy last-view when no durable snapshot", async () => {
      const { authority, kvStore, publisher } = createTestNetworkAuthority({
        legacyLastView: "dorado-1",
      });

      await authority.hydrate();

      await expect(authority.getSnapshot()).resolves.toEqual({
        chainId: "dorado-1",
        revision: 1,
      });
      await expect(peekStoredSnapshot(kvStore)).resolves.toEqual({
        chainId: "dorado-1",
        revision: 1,
      });
      expect(publisher.publishInternalSurfacesSync).not.toHaveBeenCalled();
      expect(publisher.publishWebpageNetworkChanged).not.toHaveBeenCalled();
    });

    it("uses fallback at revision 1 when legacy is missing or unknown", async () => {
      const { authority } = createTestNetworkAuthority({
        legacyLastView: "asi-devnet-1",
      });

      await authority.hydrate();

      await expect(authority.getSnapshot()).resolves.toEqual({
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        revision: 1,
      });
    });

    it("restores valid durable snapshot without bumping revision or publishing", async () => {
      const kvStore = new MemoryKVStore("test-authority-restore");
      await kvStore.set(NetworkAuthority.SNAPSHOT_KV_KEY, {
        chainId: "dorado-1",
        revision: 7,
      });
      const { authority, publisher } = createTestNetworkAuthority({ kvStore });

      await authority.hydrate();

      await expect(authority.getSnapshot()).resolves.toEqual({
        chainId: "dorado-1",
        revision: 7,
      });
      expect(publisher.publishInternalSurfacesSync).not.toHaveBeenCalled();
    });

    it("repairs missing durable chain at stored.revision + 1 before ready", async () => {
      const kvStore = new MemoryKVStore("test-authority-repair");
      await kvStore.set(NetworkAuthority.SNAPSHOT_KV_KEY, {
        chainId: "asi-devnet-1",
        revision: 5,
      });
      const { authority, publisher } = createTestNetworkAuthority({ kvStore });

      await authority.hydrate();

      await expect(authority.getSnapshot()).resolves.toEqual({
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        revision: 6,
      });
      expect(publisher.publishInternalSurfacesSync).toHaveBeenCalledWith({
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        revision: 6,
      });
    });

    it("repairs canonical chainId mismatch with a new durable revision", async () => {
      const kvStore = new MemoryKVStore("test-authority-canonical");
      await kvStore.set(NetworkAuthority.SNAPSHOT_KV_KEY, {
        chainId: "dorado-1",
        revision: 7,
      });
      const registry = new MemoryAuthorityRegistry();
      registry.rewriteCanonicalId("dorado-1", "dorado-2");
      const { authority, publisher } = createTestNetworkAuthority({
        kvStore,
        registry,
      });

      await authority.hydrate();

      const expected = { chainId: "dorado-2", revision: 8 };
      await expect(authority.getSnapshot()).resolves.toEqual(expected);
      await expect(peekStoredSnapshot(kvStore)).resolves.toEqual(expected);
      expect(publisher.publishInternalSurfacesSync).toHaveBeenCalledWith(
        expected
      );
    });

    it("fail-closed on corrupted durable snapshot without legacy migration", async () => {
      const kvStore = new MemoryKVStore("test-authority-corrupt");
      await kvStore.set(NetworkAuthority.SNAPSHOT_KV_KEY, {
        chainId: "dorado-1",
        revision: 1.5,
      });
      const { authority } = createTestNetworkAuthority({
        kvStore,
        legacyLastView: "dorado-1",
      });

      await expect(authority.hydrate()).rejects.toThrow(/invalid revision/);
      expect(authority.isHydrated()).toBe(false);
      await expect(peekStoredSnapshot(kvStore)).resolves.toEqual({
        chainId: "dorado-1",
        revision: 1.5,
      });
    });

    it("fail-closed: rejecting KV get does not mark hydrated", async () => {
      const kvStore = new MemoryKVStore("test-authority-get-fail");
      kvStore.get = async () => {
        throw new Error("kv get failed");
      };

      const { authority } = createTestNetworkAuthority({ kvStore });

      await expect(authority.hydrate()).rejects.toThrow(/hydration failed/);
      expect(authority.isHydrated()).toBe(false);
      await expect(authority.getSnapshot()).rejects.toThrow();
    });

    it("retries hydrate after a failed attempt", async () => {
      const kvStore = new MemoryKVStore("test-authority-retry");
      let failOnce = true;
      const originalGet = kvStore.get.bind(kvStore);
      kvStore.get = async (key) => {
        if (failOnce) {
          failOnce = false;
          throw new Error("transient");
        }
        return originalGet(key);
      };

      const { authority } = createTestNetworkAuthority({ kvStore });
      await expect(authority.hydrate()).rejects.toThrow(/hydration failed/);
      await expect(authority.hydrate()).resolves.toBeUndefined();
      expect(authority.isHydrated()).toBe(true);
    });
  });

  describe("pure queries", () => {
    it("getSnapshot / getSelectedChainId perform no KV write or publication", async () => {
      const { authority, kvStore, publisher } = createTestNetworkAuthority();
      await authority.hydrate();
      publisher.publishInternalSurfacesSync.mockClear();
      publisher.publishWebpageNetworkChanged.mockClear();

      const setSpy = jest.spyOn(kvStore, "set");

      await expect(authority.getSelectedChainId()).resolves.toBe(
        PREFERRED_DEFAULT_CHAIN_ID
      );
      await expect(authority.getSnapshot()).resolves.toEqual({
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        revision: 1,
      });

      expect(setSpy).not.toHaveBeenCalled();
      expect(publisher.publishInternalSurfacesSync).not.toHaveBeenCalled();
      expect(publisher.publishWebpageNetworkChanged).not.toHaveBeenCalled();
      setSpy.mockRestore();
    });
  });

  describe("select", () => {
    it("rejects unknown target without persistence, revision, or events", async () => {
      const { authority, kvStore, publisher } = createTestNetworkAuthority();
      await authority.hydrate();
      const before = await peekStoredSnapshot(kvStore);
      publisher.publishInternalSurfacesSync.mockClear();
      publisher.publishWebpageNetworkChanged.mockClear();

      await expect(authority.select("asi-devnet-1")).rejects.toThrow(
        /There is no chain info/
      );

      await expect(peekStoredSnapshot(kvStore)).resolves.toEqual(before);
      await expect(authority.getSnapshot()).resolves.toEqual(before);
      expect(publisher.publishInternalSurfacesSync).not.toHaveBeenCalled();
      expect(publisher.publishWebpageNetworkChanged).not.toHaveBeenCalled();
    });

    it("returns current snapshot when selecting already committed chain", async () => {
      const { authority, publisher } = createTestNetworkAuthority();
      await authority.hydrate();
      publisher.publishInternalSurfacesSync.mockClear();

      const result = await authority.select(PREFERRED_DEFAULT_CHAIN_ID);

      expect(result).toEqual({
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        revision: 1,
      });
      expect(publisher.publishInternalSurfacesSync).not.toHaveBeenCalled();
    });

    it("persists before memory commit; bumps revision once; notifies observers", async () => {
      const observed: NetworkAuthoritySnapshot[] = [];
      const { authority, kvStore, publisher } = createTestNetworkAuthority({
        observers: [(snapshot) => observed.push(snapshot)],
      });
      await authority.hydrate();
      publisher.publishInternalSurfacesSync.mockClear();
      publisher.publishWebpageNetworkChanged.mockClear();

      const result = await authority.select("dorado-1");

      expect(result).toEqual({ chainId: "dorado-1", revision: 2 });
      await expect(authority.getSnapshot()).resolves.toEqual(result);
      await expect(peekStoredSnapshot(kvStore)).resolves.toEqual(result);
      expect(observed).toEqual([result]);
      expect(publisher.publishInternalSurfacesSync).toHaveBeenCalledWith(
        result
      );
      expect(publisher.publishWebpageNetworkChanged).toHaveBeenCalledWith(1);
    });

    it("fail-closed on persist failure: no memory commit or publication", async () => {
      const { authority, kvStore, publisher } = createTestNetworkAuthority();
      await authority.hydrate();
      const before = await authority.getSnapshot();
      publisher.publishInternalSurfacesSync.mockClear();

      kvStore.set = async () => {
        throw new Error("kv set failed");
      };

      await expect(authority.select("dorado-1")).rejects.toThrow(
        /kv set failed/
      );
      await expect(authority.getSnapshot()).resolves.toEqual(before);
      expect(publisher.publishInternalSurfacesSync).not.toHaveBeenCalled();
    });

    it("commits overlapping selects in FIFO enqueue order", async () => {
      const { authority } = createTestNetworkAuthority();
      await authority.hydrate();

      const first = authority.select("dorado-1");
      const second = authority.select(PREFERRED_DEFAULT_CHAIN_ID);

      await expect(first).resolves.toEqual({
        chainId: "dorado-1",
        revision: 2,
      });
      await expect(second).resolves.toEqual({
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        revision: 3,
      });
      await expect(authority.getSnapshot()).resolves.toEqual({
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        revision: 3,
      });
    });

    it("continues FIFO after a rejected command", async () => {
      const { authority } = createTestNetworkAuthority();
      await authority.hydrate();

      const rejected = authority.select("asi-devnet-1");
      const next = authority.select("dorado-1");

      await expect(rejected).rejects.toThrow(/There is no chain info/);
      await expect(next).resolves.toEqual({
        chainId: "dorado-1",
        revision: 2,
      });
    });

    it("observer throw does not reject ack and still publishes", async () => {
      const second: NetworkAuthoritySnapshot[] = [];
      const { authority, publisher } = createTestNetworkAuthority({
        observers: [
          () => {
            throw new Error("observer failed");
          },
          (snapshot) => second.push(snapshot),
        ],
      });
      await authority.hydrate();
      publisher.publishInternalSurfacesSync.mockClear();
      publisher.publishWebpageNetworkChanged.mockClear();

      const warn = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      await expect(authority.select("dorado-1")).resolves.toEqual({
        chainId: "dorado-1",
        revision: 2,
      });
      expect(second).toEqual([{ chainId: "dorado-1", revision: 2 }]);
      expect(publisher.publishInternalSurfacesSync).toHaveBeenCalled();
      expect(publisher.publishWebpageNetworkChanged).toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("publication failure does not roll back committed snapshot", async () => {
      const { authority, publisher } = createTestNetworkAuthority({
        publisher: {
          publishInternalSurfacesSync: () => {
            throw new Error("broadcast failed");
          },
          publishWebpageNetworkChanged: () => {
            throw new Error("webpage failed");
          },
        },
      });
      await authority.hydrate();

      const warn = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      await expect(authority.select("dorado-1")).resolves.toEqual({
        chainId: "dorado-1",
        revision: 2,
      });
      await expect(authority.getSnapshot()).resolves.toEqual({
        chainId: "dorado-1",
        revision: 2,
      });
      expect(publisher.publishInternalSurfacesSync).toHaveBeenCalled();
      expect(publisher.publishWebpageNetworkChanged).toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("commitRemoveChain", () => {
    it("rejects removing the committed selected chain without mutation", async () => {
      const registry = new MemoryAuthorityRegistry();
      await registry.commitAddChain({
        chainId: "custom-1",
        chainName: "Custom",
        features: ["cosmos"],
      } as any);
      const { authority } = createTestNetworkAuthority({ registry });
      await authority.hydrate();
      await authority.select("custom-1");

      await expect(authority.commitRemoveChain("custom-1")).rejects.toThrow(
        /currently selected/
      );
      await expect(registry.findCanonicalChainId("custom-1")).resolves.toBe(
        "custom-1"
      );
      await expect(authority.getSelectedChainId()).resolves.toBe("custom-1");
    });

    it("removes a non-selected chain", async () => {
      const registry = new MemoryAuthorityRegistry();
      await registry.commitAddChain({
        chainId: "custom-1",
        chainName: "Custom",
        features: ["cosmos"],
      } as any);
      const { authority } = createTestNetworkAuthority({ registry });
      await authority.hydrate();

      await authority.commitRemoveChain("custom-1");
      await expect(registry.findCanonicalChainId("custom-1")).resolves.toBe(
        undefined
      );
    });

    it("remove then select of same chain cannot both succeed from stale race", async () => {
      const registry = new MemoryAuthorityRegistry();
      await registry.commitAddChain({
        chainId: "custom-1",
        chainName: "Custom",
        features: ["cosmos"],
      } as any);
      const { authority } = createTestNetworkAuthority({ registry });
      await authority.hydrate();

      const remove = authority.commitRemoveChain("custom-1");
      const select = authority.select("custom-1");

      await expect(remove).resolves.toBeUndefined();
      await expect(select).rejects.toThrow(/There is no chain info/);
      await expect(authority.getSelectedChainId()).resolves.toBe(
        PREFERRED_DEFAULT_CHAIN_ID
      );
    });
  });

  describe("commitAddChain", () => {
    it("registers then allows select (ordered, not cross-key atomic)", async () => {
      const { authority, registry } = createTestNetworkAuthority();
      await authority.hydrate();

      await authority.commitAddChain({
        chainId: "custom-1",
        chainName: "Custom",
        features: ["cosmos"],
      } as any);
      await expect(registry.findCanonicalChainId("custom-1")).resolves.toBe(
        "custom-1"
      );

      await expect(authority.select("custom-1")).resolves.toEqual({
        chainId: "custom-1",
        revision: 2,
      });
    });
  });

  describe("model sequences", () => {
    type Op =
      | { type: "select"; chainId: string }
      | { type: "remove"; chainId: string }
      | { type: "add"; chainId: string }
      | { type: "query" };

    type ModelState = {
      chains: Set<string>;
      snapshot: NetworkAuthoritySnapshot;
    };

    const EMBEDDED = new Set([PREFERRED_DEFAULT_CHAIN_ID, "dorado-1"]);

    function initialModel(): ModelState {
      return {
        chains: new Set(EMBEDDED),
        snapshot: { chainId: PREFERRED_DEFAULT_CHAIN_ID, revision: 1 },
      };
    }

    function expectOp(
      state: ModelState,
      op: Op
    ): { ok: true; state: ModelState } | { ok: false; error: RegExp } {
      if (op.type === "query") {
        return { ok: true, state };
      }

      if (op.type === "add") {
        if (state.chains.has(op.chainId)) {
          return { ok: false, error: /already registered/ };
        }
        const next = new Set(state.chains);
        next.add(op.chainId);
        return {
          ok: true,
          state: { chains: next, snapshot: state.snapshot },
        };
      }

      if (op.type === "remove") {
        if (!state.chains.has(op.chainId)) {
          return { ok: false, error: /not registered/ };
        }
        if (state.snapshot.chainId === op.chainId) {
          return { ok: false, error: /currently selected/ };
        }
        const next = new Set(state.chains);
        next.delete(op.chainId);
        return {
          ok: true,
          state: { chains: next, snapshot: state.snapshot },
        };
      }

      // select
      if (!state.chains.has(op.chainId)) {
        return { ok: false, error: /There is no chain info/ };
      }
      if (state.snapshot.chainId === op.chainId) {
        return { ok: true, state };
      }
      return {
        ok: true,
        state: {
          chains: state.chains,
          snapshot: {
            chainId: op.chainId,
            revision: state.snapshot.revision + 1,
          },
        },
      };
    }

    function* exhaustiveSequences(ops: Op[], length: number): Generator<Op[]> {
      if (length === 0) {
        yield [];
        return;
      }
      for (const op of ops) {
        for (const rest of exhaustiveSequences(ops, length - 1)) {
          yield [op, ...rest];
        }
      }
    }

    const ops: Op[] = [
      { type: "query" },
      { type: "select", chainId: PREFERRED_DEFAULT_CHAIN_ID },
      { type: "select", chainId: "dorado-1" },
      { type: "select", chainId: "custom-1" },
      { type: "select", chainId: "asi-devnet-1" },
      { type: "add", chainId: "custom-1" },
      { type: "remove", chainId: "custom-1" },
      { type: "remove", chainId: "dorado-1" },
    ];

    it("matches reference model for exhaustive length-3 command sequences", async () => {
      let covered = 0;

      for (const sequence of exhaustiveSequences(ops, 3)) {
        const registry = new MemoryAuthorityRegistry();
        const { authority, kvStore, publisher } = createTestNetworkAuthority({
          registry,
        });
        await authority.hydrate();

        let model = initialModel();
        const revisionToChain = new Map<number, string>([
          [model.snapshot.revision, model.snapshot.chainId],
        ]);

        for (const op of sequence) {
          const expected = expectOp(model, op);

          if (op.type === "query") {
            publisher.publishInternalSurfacesSync.mockClear();
            const setSpy = jest.spyOn(kvStore, "set");
            const snap = await authority.getSnapshot();
            expect(setSpy).not.toHaveBeenCalled();
            expect(
              publisher.publishInternalSurfacesSync
            ).not.toHaveBeenCalled();
            setSpy.mockRestore();
            expect(snap).toEqual(model.snapshot);
            expect(model.chains.has(snap.chainId)).toBe(true);
            expect(revisionToChain.get(snap.revision)).toBe(snap.chainId);
            continue;
          }

          if (op.type === "add") {
            const run = authority.commitAddChain({
              chainId: op.chainId,
              chainName: op.chainId,
              features: ["cosmos"],
            } as any);
            if (expected.ok) {
              await expect(run).resolves.toBeUndefined();
              model = expected.state;
            } else {
              await expect(run).rejects.toThrow(expected.error);
            }
            continue;
          }

          if (op.type === "remove") {
            const run = authority.commitRemoveChain(op.chainId);
            if (expected.ok) {
              await expect(run).resolves.toBeUndefined();
              model = expected.state;
            } else {
              await expect(run).rejects.toThrow(expected.error);
            }
            continue;
          }

          const run = authority.select(op.chainId);
          if (expected.ok) {
            await expect(run).resolves.toEqual(expected.state.snapshot);
            model = expected.state;
            revisionToChain.set(
              model.snapshot.revision,
              model.snapshot.chainId
            );
          } else {
            await expect(run).rejects.toThrow(expected.error);
          }

          const snap = await authority.getSnapshot();
          expect(snap).toEqual(model.snapshot);
          expect(model.chains.has(snap.chainId)).toBe(true);
          expect(revisionToChain.get(snap.revision)).toBe(snap.chainId);
        }

        covered += 1;
      }

      // 8^3 exhaustive sequences
      expect(covered).toBe(8 ** 3);
    });
  });
});
