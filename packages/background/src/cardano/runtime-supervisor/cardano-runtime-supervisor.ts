import { StaleCardanoRuntimeError } from "../ensure-errors";
import {
  CapturedRuntimeOwnership,
  CardanoRuntimeSupervisorDeps,
  NetworkAuthoritySnapshot,
} from "./types";

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

    // Invalidate advertised readiness and in-flight create ownership before
    // any await. Keep createTail intact so physical creates stay serialized.
    this.runtimeGeneration += 1;
    const leaveGeneration = this.runtimeGeneration;
    this.deps.host.invalidateAdvertisedReadiness();

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
      const assertStillOwner = () => {
        if (this.runtimeGeneration !== generationAtClaim) {
          throw new StaleCardanoRuntimeError();
        }
        if (this.ownerRevision !== revision || this.ownerChainId !== chainId) {
          throw new StaleCardanoRuntimeError();
        }
      };

      assertStillOwner();

      if (this.deps.host.isReadyForChain(chainId)) {
        return;
      }

      await this.deps.host.createAndAttach({
        chainId,
        authorityRevision: revision,
        runtimeGeneration: generationAtClaim,
        assertStillOwner,
      });

      assertStillOwner();
    };

    const scheduled = this.createTail.then(run, run);
    this.createTail = scheduled.then(
      () => undefined,
      () => undefined
    );
    return scheduled;
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
      this.deps.host.disposeRuntimeIfInstance(captured.instanceId);
      return;
    }

    if (options.force) {
      this.runtimeGeneration += 1;
      this.deps.host.reset();
      return;
    }

    if (captured.instanceId != null) {
      this.deps.host.disposeRuntimeIfInstance(captured.instanceId);
      return;
    }

    if (captured.wasInitialized) {
      this.runtimeGeneration += 1;
      this.deps.host.reset();
    }
  }
}
