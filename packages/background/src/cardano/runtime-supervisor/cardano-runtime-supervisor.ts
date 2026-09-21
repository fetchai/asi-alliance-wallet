import {
  createCardanoRuntimeLease,
  isCardanoRuntimeInactiveError,
  type MutableCardanoRuntimeLease,
} from "@keplr-wallet/cardano";
import { StaleCardanoRuntimeError } from "../ensure-errors";
import {
  CapturedRuntimeOwnership,
  CardanoRuntimeSupervisorDeps,
  NetworkAuthoritySnapshot,
} from "./types";

type LeaseEntry = {
  id: string;
  lease: MutableCardanoRuntimeLease;
  state: "pending" | "attached";
  instanceId?: string;
};

/**
 * Observes committed authority snapshots and owns Cardano NetworkRuntime
 * create/join/dispose. Never blocks or rolls back an authority commit.
 *
 * Physical creates stay serialized on one tail even after a newer revision
 * supersedes an in-flight create — a superseded create may finish as a no-op
 * but must not start a second uncoordinated manager creation.
 */
export class CardanoRuntimeSupervisor {
  private runtimeGeneration = 0;
  private ownerRevision: number | null = null;
  private ownerChainId: string | null = null;
  /** Serializes physical create/attach across targets. */
  private createTail: Promise<void> = Promise.resolve();
  private inFlight: {
    chainId: string;
    revision: number;
    promise: Promise<void>;
  } | null = null;
  private leases = new Map<string, LeaseEntry>();
  private nextLeaseId = 0;

  constructor(private readonly deps: CardanoRuntimeSupervisorDeps) {}

  getRuntimeGeneration(): number {
    return this.runtimeGeneration;
  }

  getOwnerRevision(): number | null {
    return this.ownerRevision;
  }

  getOwnerChainId(): string | null {
    return this.ownerChainId;
  }

  /** Test/inspection helper: active pending+attached leases. */
  getActiveLeaseCount(): number {
    return this.leases.size;
  }

  /**
   * Adopt an already-committed authority snapshot (e.g. after hydrate) without
   * treating it as a network switch. Does not invalidate or dispose runtimes.
   */
  adoptCommittedSnapshot(snapshot: NetworkAuthoritySnapshot): void {
    this.ownerRevision = snapshot.revision;
    this.ownerChainId = snapshot.chainId;
  }

  /**
   * Wipe host runtime (lock / keystore change) without changing authority
   * ownership. Keeps createTail so in-flight physical creates stay serialized.
   */
  resetHostRuntime(): void {
    this.revokeAllLeases("host_reset");
    this.runtimeGeneration += 1;
    this.inFlight = null;
    this.deps.host.reset();
  }

  /**
   * Authority commit observer. Sync invalidate only — physical dispose is
   * scheduled and must not delay the caller.
   */
  onAuthorityCommitted(
    snapshot: NetworkAuthoritySnapshot,
    _previous: NetworkAuthoritySnapshot | undefined
  ): void {
    const captured = this.captureOwnership();

    this.ownerRevision = snapshot.revision;
    this.ownerChainId = snapshot.chainId;

    // Invalidate advertised readiness and revoke non-matching leases before
    // any await. Keep createTail intact so physical creates stay serialized.
    this.deps.host.invalidateAdvertisedReadiness();
    this.revokeLeasesNotMatching(snapshot, "authority_commit");
    this.runtimeGeneration += 1;
    const leaveGeneration = this.runtimeGeneration;

    if (!this.deps.isCardanoChain(snapshot.chainId)) {
      void this.settleLeave(captured, {
        force: true,
        leaveGeneration,
      });
      return;
    }

    if (this.shouldDetachWrongNetworkRuntime(captured, snapshot.chainId)) {
      void this.settleLeave(captured, {
        force: false,
        leaveGeneration,
      });
    }
  }

  /** True when the host advertises ready for this authority ownership. */
  isEligibleFor(chainId: string, revision: number): boolean {
    return (
      this.ownerRevision === revision &&
      this.ownerChainId === chainId &&
      this.deps.host.isReadyForChain(chainId)
    );
  }

  /**
   * Ensure NetworkRuntime for the given authority ownership.
   * Same chain+revision callers join one in-flight create. Different targets
   * wait on the shared create tail before claiming.
   */
  async ensureReady(chainId: string, revision: number): Promise<void> {
    if (!this.deps.isCardanoChain(chainId)) {
      throw new Error(`Not a Cardano chain: ${chainId}`);
    }

    for (;;) {
      this.assertOwner(chainId, revision);

      if (this.isEligibleFor(chainId, revision)) {
        return;
      }

      const inFlight = this.inFlight;
      if (inFlight) {
        if (inFlight.chainId === chainId && inFlight.revision === revision) {
          await inFlight.promise;
          this.assertOwner(chainId, revision);
          if (!this.isEligibleFor(chainId, revision)) {
            throw new Error("Cardano runtime not ready after joined ensure");
          }
          return;
        }

        try {
          await inFlight.promise;
        } catch {
          // Prior ensure failed or was superseded; this caller may claim next.
        }
        continue;
      }

      if (this.isEligibleFor(chainId, revision)) {
        return;
      }

      const promise = this.enqueueCreate(chainId, revision);
      this.inFlight = { chainId, revision, promise };
      try {
        await promise;
        this.assertOwner(chainId, revision);
        if (!this.isEligibleFor(chainId, revision)) {
          throw new Error("Cardano runtime not ready after ensure");
        }
        return;
      } finally {
        if (this.inFlight?.promise === promise) {
          this.inFlight = null;
        }
      }
    }
  }

  private enqueueCreate(chainId: string, revision: number): Promise<void> {
    const run = async (): Promise<void> => {
      const generationAtClaim = this.runtimeGeneration;
      const lease = createCardanoRuntimeLease({
        chainId,
        authorityRevision: revision,
        runtimeGeneration: generationAtClaim,
        authority: {
          getChainId: () => this.ownerChainId,
          getRevision: () => this.ownerRevision,
          getRuntimeGeneration: () => this.runtimeGeneration,
        },
      });
      const leaseId = this.registerLease(lease, "pending");

      const assertStillOwner = () => {
        if (this.runtimeGeneration !== generationAtClaim) {
          throw new StaleCardanoRuntimeError();
        }
        if (this.ownerRevision !== revision || this.ownerChainId !== chainId) {
          throw new StaleCardanoRuntimeError();
        }
      };

      try {
        assertStillOwner();
        lease.assertActive("supervisor.before_create");

        if (this.deps.host.isReadyForChain(chainId)) {
          this.revokeAndUnregisterLease(leaseId, "already_ready");
          return;
        }

        await this.deps.host.createAndAttach({
          chainId,
          authorityRevision: revision,
          runtimeGeneration: generationAtClaim,
          assertStillOwner,
          runtimeLease: lease,
        });

        assertStillOwner();
        lease.assertActive("supervisor.after_attach");
        this.markLeaseAttached(leaseId, this.deps.host.getAttachedInstanceId());
      } catch (error) {
        // Always revoke on failure so a leaked host consumer cannot keep an
        // active lease that future authority commits would no longer find.
        this.revokeAndUnregisterLease(leaseId, "create_failed");
        if (isCardanoRuntimeInactiveError(error)) {
          throw new StaleCardanoRuntimeError();
        }
        throw error;
      }
    };

    const scheduled = this.createTail.then(run, run);
    this.createTail = scheduled.then(
      () => undefined,
      () => undefined
    );
    return scheduled;
  }

  private registerLease(
    lease: MutableCardanoRuntimeLease,
    state: "pending" | "attached"
  ): string {
    this.nextLeaseId += 1;
    const id = `lease_${this.nextLeaseId}`;
    this.leases.set(id, { id, lease, state });
    return id;
  }

  private markLeaseAttached(
    leaseId: string,
    instanceId: string | undefined
  ): void {
    const entry = this.leases.get(leaseId);
    if (!entry) {
      return;
    }
    entry.state = "attached";
    entry.instanceId = instanceId;
  }

  private revokeAndUnregisterLease(leaseId: string, reason: string): void {
    const entry = this.leases.get(leaseId);
    if (!entry) {
      return;
    }
    entry.lease.revoke(reason);
    this.leases.delete(leaseId);
  }

  private revokeLeasesNotMatching(
    snapshot: NetworkAuthoritySnapshot,
    reason: string
  ): void {
    for (const [id, entry] of [...this.leases.entries()]) {
      if (
        entry.lease.chainId !== snapshot.chainId ||
        entry.lease.authorityRevision !== snapshot.revision
      ) {
        entry.lease.revoke(reason);
        this.leases.delete(id);
      }
    }
  }

  private revokeAllLeases(reason: string): void {
    for (const [id, entry] of [...this.leases.entries()]) {
      entry.lease.revoke(reason);
      this.leases.delete(id);
    }
  }

  private revokeLeaseForInstance(
    instanceId: string | undefined,
    reason: string
  ): void {
    if (instanceId == null) {
      return;
    }
    for (const [id, entry] of [...this.leases.entries()]) {
      if (entry.instanceId === instanceId) {
        entry.lease.revoke(reason);
        this.leases.delete(id);
      }
    }
  }

  private captureOwnership(): CapturedRuntimeOwnership {
    return {
      instanceId: this.deps.host.getAttachedInstanceId(),
      runtimeGeneration: this.runtimeGeneration,
      boundChainId: this.deps.host.getBoundChainId(),
      wasInitialized: this.deps.host.isInitialized(),
    };
  }

  /**
   * Detach prior Cardano runtime when switching to another Cardano chain.
   * Includes mid-restore (attached/initialized with boundChainId still unset).
   */
  private shouldDetachWrongNetworkRuntime(
    captured: CapturedRuntimeOwnership,
    targetChainId: string
  ): boolean {
    const hasRuntime = captured.wasInitialized || captured.instanceId != null;
    if (!hasRuntime) {
      return false;
    }
    return captured.boundChainId !== targetChainId;
  }

  private assertOwner(chainId: string, revision: number): void {
    if (this.ownerRevision !== revision || this.ownerChainId !== chainId) {
      throw new StaleCardanoRuntimeError();
    }
  }

  /**
   * Physical leave/dispose for a captured ownership snapshot.
   * If a newer authority commit advanced leaveGeneration, only exact-dispose
   * the captured instance — never wipe the newer owner's state.
   *
   * Mid-restore (initialized, no attached instanceId) cannot use
   * disposeRuntimeIfInstance(undefined); reset cancels that incomplete runtime
   * only while this leave still owns leaveGeneration.
   */
  private async settleLeave(
    captured: CapturedRuntimeOwnership,
    options: { force: boolean; leaveGeneration: number }
  ): Promise<void> {
    // Yield so authority commit returns before physical cleanup.
    await Promise.resolve();

    if (options.leaveGeneration !== this.runtimeGeneration) {
      // Stale leave: never reset — that could wipe a newer owner mid-create.
      this.revokeLeaseForInstance(captured.instanceId, "stale_leave_dispose");
      this.deps.host.disposeRuntimeIfInstance(captured.instanceId);
      return;
    }

    if (options.force) {
      this.revokeAllLeases("force_leave_reset");
      this.runtimeGeneration += 1;
      this.deps.host.reset();
      return;
    }

    if (captured.instanceId != null) {
      this.revokeLeaseForInstance(captured.instanceId, "wrong_network_dispose");
      this.deps.host.disposeRuntimeIfInstance(captured.instanceId);
      return;
    }

    if (captured.wasInitialized) {
      this.revokeAllLeases("mid_restore_reset");
      this.runtimeGeneration += 1;
      this.deps.host.reset();
    }
  }
}
