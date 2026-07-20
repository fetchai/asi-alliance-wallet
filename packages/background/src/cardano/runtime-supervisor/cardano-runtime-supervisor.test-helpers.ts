import { CardanoRuntimeSupervisor } from "./cardano-runtime-supervisor";
import {
  CardanoRuntimeHost,
  NetworkAuthoritySnapshot,
  RuntimeCreateContext,
} from "./types";

export class MemoryCardanoRuntimeHost implements CardanoRuntimeHost {
  attachedInstanceId: string | undefined;
  boundChainId: string | undefined;
  /**
   * Mirrors CardanoService.isInitialized(): keyRing exists even before a
   * wallet manager is attached (mid-restore).
   */
  initialized = false;
  ready = false;
  private nextInstance = 0;
  createCalls = 0;
  resetCalls = 0;
  disposedInstanceIds: Array<string | undefined> = [];
  createStarted: string[] = [];
  /** Optional gate held during createAndAttach for race tests. */
  createGate: Promise<void> | null = null;
  /** When set, createAndAttach throws after opening the gate. */
  createError: Error | null = null;

  getAttachedInstanceId(): string | undefined {
    return this.attachedInstanceId;
  }

  getBoundChainId(): string | undefined {
    return this.boundChainId;
  }

  isReadyForChain(chainId: string): boolean {
    return this.ready && this.boundChainId === chainId;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  invalidateAdvertisedReadiness(): void {
    this.ready = false;
  }

  disposeRuntimeIfInstance(instanceId: string | undefined): boolean {
    this.disposedInstanceIds.push(instanceId);
    if (instanceId == null || this.attachedInstanceId !== instanceId) {
      return false;
    }
    this.attachedInstanceId = undefined;
    this.boundChainId = undefined;
    this.ready = false;
    this.initialized = false;
    return true;
  }

  reset(): void {
    this.resetCalls += 1;
    this.attachedInstanceId = undefined;
    this.boundChainId = undefined;
    this.ready = false;
    this.initialized = false;
  }

  async createAndAttach(ctx: RuntimeCreateContext): Promise<void> {
    this.createCalls += 1;
    this.createStarted.push(ctx.chainId);
    // keyRing exists before manager attach (same as CardanoService restore).
    this.initialized = true;
    try {
      ctx.assertStillOwner();

      if (this.createGate) {
        await this.createGate;
      }

      ctx.assertStillOwner();

      if (this.createError) {
        throw this.createError;
      }

      this.nextInstance += 1;
      this.attachedInstanceId = `inst-${this.nextInstance}`;
      this.boundChainId = ctx.chainId;
      this.ready = true;
    } catch (error) {
      // Failed restore without an attached manager leaves no runtime behind.
      if (this.attachedInstanceId == null) {
        this.initialized = false;
        this.boundChainId = undefined;
        this.ready = false;
      }
      throw error;
    }
  }
}

const CARDANO_CHAINS = new Set(["cardano-mainnet", "cardano-preprod"]);

export function createTestSupervisor(host?: MemoryCardanoRuntimeHost): {
  supervisor: CardanoRuntimeSupervisor;
  host: MemoryCardanoRuntimeHost;
} {
  const runtimeHost = host ?? new MemoryCardanoRuntimeHost();
  const supervisor = new CardanoRuntimeSupervisor({
    host: runtimeHost,
    isCardanoChain: (chainId) => CARDANO_CHAINS.has(chainId),
  });
  return { supervisor, host: runtimeHost };
}

export function commit(
  supervisor: CardanoRuntimeSupervisor,
  chainId: string,
  revision: number,
  previous?: NetworkAuthoritySnapshot
): void {
  supervisor.onAuthorityCommitted(
    { chainId, revision },
    previous ??
      (supervisor.getOwnerChainId() != null
        ? {
            chainId: supervisor.getOwnerChainId() as string,
            revision: supervisor.getOwnerRevision() as number,
          }
        : undefined)
  );
}
