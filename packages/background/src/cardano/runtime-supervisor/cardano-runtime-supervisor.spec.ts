import { StaleCardanoRuntimeError } from "../ensure-errors";
import {
  commit,
  createTestSupervisor,
  MemoryCardanoRuntimeHost,
} from "./cardano-runtime-supervisor.test-helpers";

describe("CardanoRuntimeSupervisor", () => {
  describe("adoptCommittedSnapshot", () => {
    it("sets ownership without invalidating or disposing", async () => {
      const { supervisor, host } = createTestSupervisor();
      host.ready = true;
      host.boundChainId = "cardano-mainnet";
      host.initialized = true;
      host.attachedInstanceId = "inst-1";

      supervisor.adoptCommittedSnapshot({
        chainId: "cardano-mainnet",
        revision: 4,
      });

      expect(supervisor.getOwnerChainId()).toBe("cardano-mainnet");
      expect(supervisor.getOwnerRevision()).toBe(4);
      expect(supervisor.getRuntimeGeneration()).toBe(0);
      expect(host.ready).toBe(true);
      expect(host.resetCalls).toBe(0);

      await supervisor.ensureReady("cardano-mainnet", 4);
      // Already ready for owner — no create.
      expect(host.createCalls).toBe(0);
    });
  });

  describe("onAuthorityCommitted", () => {
    it("synchronously invalidates readiness without awaiting dispose", () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      void supervisor.ensureReady("cardano-mainnet", 1);

      // Drive microtasks until create completes.
      return Promise.resolve()
        .then(() => Promise.resolve())
        .then(async () => {
          await supervisor.ensureReady("cardano-mainnet", 1);
          expect(host.isReadyForChain("cardano-mainnet")).toBe(true);
          expect(host.attachedInstanceId).toBe("inst-1");

          let settleDone = false;
          const originalReset = host.reset.bind(host);
          host.reset = () => {
            settleDone = true;
            originalReset();
          };

          commit(supervisor, "fetchhub-4", 2);
          // Sync: readiness cleared immediately; physical reset not yet.
          expect(host.isReadyForChain("cardano-mainnet")).toBe(false);
          expect(settleDone).toBe(false);
          expect(supervisor.isEligibleFor("cardano-mainnet", 1)).toBe(false);

          await Promise.resolve();
          expect(settleDone).toBe(true);
          expect(host.resetCalls).toBe(1);
        });
    });

    it("rejects ensure for a superseded revision after non-Cardano commit", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      await supervisor.ensureReady("cardano-mainnet", 1);
      expect(host.createCalls).toBe(1);

      commit(supervisor, "fetchhub-4", 2);
      await expect(
        supervisor.ensureReady("cardano-mainnet", 1)
      ).rejects.toBeInstanceOf(StaleCardanoRuntimeError);
    });

    it("detaches mid-restore runtime with undefined boundChainId when Cardano switch create fails", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);

      // Mid-restore: manager already attached, boundChainId not set yet.
      host.attachedInstanceId = "inst-mid";
      host.initialized = true;
      host.boundChainId = undefined;
      host.ready = false;

      commit(supervisor, "cardano-preprod", 2);
      host.createError = new Error("create failed");

      await expect(
        supervisor.ensureReady("cardano-preprod", 2)
      ).rejects.toThrow("create failed");

      await Promise.resolve();
      expect(host.disposedInstanceIds).toContain("inst-mid");
      expect(host.attachedInstanceId).toBeUndefined();
      expect(host.isReadyForChain("cardano-mainnet")).toBe(false);
      expect(host.isReadyForChain("cardano-preprod")).toBe(false);
    });

    it("resets initialized-without-instance mid-restore when Cardano switch create fails", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);

      // Real CardanoService: keyRing exists, wallet manager not attached yet.
      host.initialized = true;
      host.attachedInstanceId = undefined;
      host.boundChainId = undefined;
      host.ready = false;

      commit(supervisor, "cardano-preprod", 2);
      host.createError = new Error("create failed");

      await expect(
        supervisor.ensureReady("cardano-preprod", 2)
      ).rejects.toThrow("create failed");

      await Promise.resolve();
      expect(host.resetCalls).toBe(1);
      expect(host.isInitialized()).toBe(false);
      expect(host.attachedInstanceId).toBeUndefined();
    });

    it("stale initialized-without-instance leave does not reset a newer owner", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);

      host.initialized = true;
      host.attachedInstanceId = undefined;
      host.boundChainId = undefined;
      host.ready = false;

      // Schedules leave for mid-restore (initialized, no instanceId).
      commit(supervisor, "cardano-preprod", 2);

      // Newer owner is already attached before the leave microtask runs.
      // Next commit targets this chain, so it must not schedule its own cleanup —
      // otherwise a buggy stale reset() could be masked by a legitimate second reset.
      host.attachedInstanceId = "inst-newer";
      host.boundChainId = "cardano-mainnet";
      host.initialized = true;
      host.ready = true;

      commit(supervisor, "cardano-mainnet", 3);
      host.ready = true;
      expect(host.resetCalls).toBe(0);

      await Promise.resolve();
      await Promise.resolve();

      // Stale leave: dispose(undefined) only — never reset.
      expect(host.resetCalls).toBe(0);
      expect(host.attachedInstanceId).toBe("inst-newer");
      expect(host.isInitialized()).toBe(true);
      expect(host.boundChainId).toBe("cardano-mainnet");
      expect(supervisor.isEligibleFor("cardano-mainnet", 3)).toBe(true);
    });
  });

  describe("ensureReady join and serialization", () => {
    it("joins concurrent ensures for the same chain and revision into one create", async () => {
      const { supervisor, host } = createTestSupervisor();
      let release!: () => void;
      host.createGate = new Promise<void>((resolve) => {
        release = resolve;
      });

      commit(supervisor, "cardano-mainnet", 1);

      const a = supervisor.ensureReady("cardano-mainnet", 1);
      const b = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();
      expect(host.createCalls).toBe(1);

      release();
      await Promise.all([a, b]);
      expect(host.createCalls).toBe(1);
      expect(host.attachedInstanceId).toBe("inst-1");
      expect(supervisor.isEligibleFor("cardano-mainnet", 1)).toBe(true);
    });

    it("keeps create-tail serialization when an in-flight create is superseded", async () => {
      const { supervisor, host } = createTestSupervisor();
      let releaseA!: () => void;
      host.createGate = new Promise<void>((resolve) => {
        releaseA = resolve;
      });

      commit(supervisor, "cardano-mainnet", 1);
      const ensureA = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();
      expect(host.createStarted).toEqual(["cardano-mainnet"]);

      // Supersede while A is mid-create.
      commit(supervisor, "cardano-preprod", 2);
      host.createGate = null;
      const ensureB = supervisor.ensureReady("cardano-preprod", 2);

      releaseA();
      await expect(ensureA).rejects.toBeInstanceOf(StaleCardanoRuntimeError);
      await ensureB;

      // Second create only after the first create slot finished.
      expect(host.createStarted).toEqual([
        "cardano-mainnet",
        "cardano-preprod",
      ]);
      expect(host.createCalls).toBe(2);
      expect(host.attachedInstanceId).toBe("inst-1");
      expect(host.boundChainId).toBe("cardano-preprod");
      expect(supervisor.isEligibleFor("cardano-preprod", 2)).toBe(true);
      expect(supervisor.isEligibleFor("cardano-mainnet", 1)).toBe(false);
    });

    it("does not start a second create while a superseded create still occupies the tail", async () => {
      const host = new MemoryCardanoRuntimeHost();
      const { supervisor } = createTestSupervisor(host);
      let releaseA!: () => void;
      let aEntered = false;
      host.createGate = new Promise<void>((resolve) => {
        releaseA = resolve;
      });

      const originalCreate = host.createAndAttach.bind(host);
      host.createAndAttach = async (ctx) => {
        if (!aEntered) {
          aEntered = true;
        } else {
          // B must not run until A has left createGate.
          expect(host.createStarted.length).toBe(1);
        }
        return originalCreate(ctx);
      };

      commit(supervisor, "cardano-mainnet", 1);
      const ensureA = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();

      commit(supervisor, "cardano-preprod", 2);
      const ensureB = supervisor.ensureReady("cardano-preprod", 2);
      await Promise.resolve();
      await Promise.resolve();

      // A still holding the create slot — B must not have started create.
      expect(host.createCalls).toBe(1);

      releaseA();
      await expect(ensureA).rejects.toBeInstanceOf(StaleCardanoRuntimeError);
      await ensureB;
      expect(host.createCalls).toBe(2);
    });

    it("resetHostRuntime during in-flight create keeps create-tail serialization", async () => {
      const { supervisor, host } = createTestSupervisor();
      let releaseA!: () => void;
      host.createGate = new Promise<void>((resolve) => {
        releaseA = resolve;
      });

      commit(supervisor, "cardano-mainnet", 1);
      const ensureA = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();
      expect(host.createCalls).toBe(1);

      // Lock / reinitialize clears advertised in-flight, but not createTail.
      supervisor.resetHostRuntime();
      expect(host.resetCalls).toBe(1);

      host.createGate = null;
      const ensureB = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();
      await Promise.resolve();

      // A still occupies the physical create slot — B must not start yet.
      expect(host.createCalls).toBe(1);

      releaseA();
      await expect(ensureA).rejects.toBeInstanceOf(StaleCardanoRuntimeError);
      await ensureB;

      expect(host.createCalls).toBe(2);
      expect(host.createStarted).toEqual([
        "cardano-mainnet",
        "cardano-mainnet",
      ]);
      expect(supervisor.isEligibleFor("cardano-mainnet", 1)).toBe(true);
    });
  });

  describe("stale dispose", () => {
    it("late dispose of an old instance does not detach a newer runtime", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      await supervisor.ensureReady("cardano-mainnet", 1);
      expect(host.attachedInstanceId).toBe("inst-1");

      // Move to non-Cardano (schedules force reset), then immediately to new Cardano.
      commit(supervisor, "fetchhub-4", 2);
      commit(supervisor, "cardano-preprod", 3);
      await supervisor.ensureReady("cardano-preprod", 3);
      const newerId = host.attachedInstanceId;
      expect(newerId).toBeTruthy();
      expect(host.boundChainId).toBe("cardano-preprod");

      // Flush any remaining leave microtasks.
      await Promise.resolve();
      await Promise.resolve();

      expect(host.attachedInstanceId).toBe(newerId);
      expect(host.boundChainId).toBe("cardano-preprod");
      expect(host.isReadyForChain("cardano-preprod")).toBe(true);
      expect(supervisor.isEligibleFor("cardano-preprod", 3)).toBe(true);
    });

    it("exact-disposes only the captured instance when leave is stale", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      await supervisor.ensureReady("cardano-mainnet", 1);

      commit(supervisor, "cardano-preprod", 2);
      // Before leave microtask: swap attached id to simulate newer attach.
      host.attachedInstanceId = "inst-newer";
      host.boundChainId = "cardano-preprod";
      host.ready = true;

      await Promise.resolve();
      expect(host.disposedInstanceIds).toContain("inst-1");
      expect(host.attachedInstanceId).toBe("inst-newer");
    });
  });

  describe("eligibility", () => {
    it("isEligibleFor requires matching owner revision and host readiness", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      expect(supervisor.isEligibleFor("cardano-mainnet", 1)).toBe(false);

      await supervisor.ensureReady("cardano-mainnet", 1);
      expect(supervisor.isEligibleFor("cardano-mainnet", 1)).toBe(true);
      expect(supervisor.isEligibleFor("cardano-mainnet", 2)).toBe(false);

      host.invalidateAdvertisedReadiness();
      expect(supervisor.isEligibleFor("cardano-mainnet", 1)).toBe(false);
    });
  });

  describe("runtime leases", () => {
    it("revokes pending lease on Cardano → non-Cardano during create", async () => {
      const { supervisor, host } = createTestSupervisor();
      let release!: () => void;
      host.createGate = new Promise<void>((resolve) => {
        release = resolve;
      });

      commit(supervisor, "cardano-mainnet", 1);
      const ensure = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();
      expect(host.createCalls).toBe(1);
      expect(supervisor.getActiveLeaseCount()).toBe(1);

      const pendingLease = host.lastRuntimeLease!;
      commit(supervisor, "fetchhub-4", 2);
      expect(pendingLease.signal.aborted).toBe(true);
      expect(() => pendingLease.assertActive("test")).toThrow(
        /Cardano runtime inactive/
      );
      expect(supervisor.getActiveLeaseCount()).toBe(0);

      release();
      await expect(ensure).rejects.toBeInstanceOf(StaleCardanoRuntimeError);
    });

    it("revokes pending lease on Cardano A → Cardano B during create", async () => {
      const { supervisor, host } = createTestSupervisor();
      let release!: () => void;
      host.createGate = new Promise<void>((resolve) => {
        release = resolve;
      });

      commit(supervisor, "cardano-mainnet", 1);
      const ensureA = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();
      const leaseA = host.lastRuntimeLease!;

      commit(supervisor, "cardano-preprod", 2);
      expect(leaseA.signal.aborted).toBe(true);

      release();
      await expect(ensureA).rejects.toBeInstanceOf(StaleCardanoRuntimeError);

      host.createGate = null;
      await supervisor.ensureReady("cardano-preprod", 2);
      expect(host.lastRuntimeLease!.chainId).toBe("cardano-preprod");
      expect(() => host.lastRuntimeLease!.assertActive("ok")).not.toThrow();
    });

    it("revokes old lease on Cardano A → non-Cardano → Cardano A", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      await supervisor.ensureReady("cardano-mainnet", 1);
      const firstLease = host.lastRuntimeLease!;
      const firstGeneration = firstLease.runtimeGeneration;

      commit(supervisor, "fetchhub-4", 2);
      expect(firstLease.signal.aborted).toBe(true);
      await Promise.resolve();

      commit(supervisor, "cardano-mainnet", 3);
      await supervisor.ensureReady("cardano-mainnet", 3);
      const secondLease = host.lastRuntimeLease!;
      expect(secondLease.chainId).toBe("cardano-mainnet");
      expect(secondLease.runtimeGeneration).not.toBe(firstGeneration);
      expect(() => secondLease.assertActive("ok")).not.toThrow();
      expect(() => firstLease.assertActive("old")).toThrow();
    });

    it("resetHostRuntime revokes pending leases", async () => {
      const { supervisor, host } = createTestSupervisor();
      let release!: () => void;
      host.createGate = new Promise<void>((resolve) => {
        release = resolve;
      });

      commit(supervisor, "cardano-mainnet", 1);
      const ensure = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();
      const pendingLease = host.lastRuntimeLease!;

      supervisor.resetHostRuntime();
      expect(pendingLease.signal.aborted).toBe(true);
      expect(supervisor.getActiveLeaseCount()).toBe(0);

      release();
      await expect(ensure).rejects.toBeInstanceOf(StaleCardanoRuntimeError);
    });

    it("failed physical create revokes the pending lease", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      host.createError = new Error("create failed");

      await expect(
        supervisor.ensureReady("cardano-mainnet", 1)
      ).rejects.toThrow("create failed");

      expect(supervisor.getActiveLeaseCount()).toBe(0);
      expect(host.lastRuntimeLease!.signal.aborted).toBe(true);
    });

    it("maps CardanoRuntimeInactiveError to StaleCardanoRuntimeError for retry", async () => {
      const { supervisor, host } = createTestSupervisor();
      let release!: () => void;
      host.createGate = new Promise<void>((resolve) => {
        release = resolve;
      });

      commit(supervisor, "cardano-mainnet", 1);
      const ensure = supervisor.ensureReady("cardano-mainnet", 1);
      await Promise.resolve();

      // Revoke only the lease (simulates inactive without assertStillOwner first).
      host.lastRuntimeLease!.revoke("authority_commit");
      release();

      await expect(ensure).rejects.toBeInstanceOf(StaleCardanoRuntimeError);
    });

    it("stale dispose of old instance does not abort newer lease", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      await supervisor.ensureReady("cardano-mainnet", 1);
      const oldLease = host.lastRuntimeLease!;

      commit(supervisor, "cardano-preprod", 2);
      expect(oldLease.signal.aborted).toBe(true);

      // Newer owner attaches before stale leave runs.
      host.attachedInstanceId = "inst-newer";
      host.boundChainId = "cardano-preprod";
      host.ready = true;
      host.initialized = true;

      // Simulate ensure for new ownership creating a fresh lease.
      host.createGate = null;
      // Force not-ready so ensure creates.
      host.ready = false;
      await supervisor.ensureReady("cardano-preprod", 2);
      const newLease = host.lastRuntimeLease!;

      await Promise.resolve();
      expect(() => newLease.assertActive("new")).not.toThrow();
      expect(newLease.signal.aborted).toBe(false);
    });

    it("two sequential ensureReady for same chain use different generations after reset", async () => {
      const { supervisor, host } = createTestSupervisor();
      commit(supervisor, "cardano-mainnet", 1);
      await supervisor.ensureReady("cardano-mainnet", 1);
      const gen1 = host.lastRuntimeLease!.runtimeGeneration;

      supervisor.resetHostRuntime();
      host.ready = false;
      await supervisor.ensureReady("cardano-mainnet", 1);
      const gen2 = host.lastRuntimeLease!.runtimeGeneration;
      expect(gen2).toBeGreaterThan(gen1);
    });
  });
});
