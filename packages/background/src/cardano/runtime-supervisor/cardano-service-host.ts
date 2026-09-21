import { CardanoService } from "../service";
import { CardanoRuntimeHost, RuntimeCreateContext } from "./types";

export type CardanoServiceHostRestore = (
  ctx: RuntimeCreateContext
) => Promise<void>;

/**
 * Adapts CardanoService to the supervisor host surface.
 * `createAndAttach` is provided by KeyRing (keystore + password).
 */
export function createCardanoServiceHost(
  cardanoService: CardanoService,
  createAndAttach: CardanoServiceHostRestore
): CardanoRuntimeHost {
  return {
    getAttachedInstanceId: () => cardanoService.getAttachedRuntimeInstanceId(),
    getBoundChainId: () => cardanoService.getBoundChainId(),
    isReadyForChain: (chainId) => cardanoService.isReadyForChain(chainId),
    isInitialized: () => cardanoService.isInitialized(),
    invalidateAdvertisedReadiness: () =>
      cardanoService.invalidateAdvertisedReadiness(),
    disposeRuntimeIfInstance: (instanceId) =>
      cardanoService.disposeRuntimeIfInstance(instanceId),
    reset: () => cardanoService.reset(),
    createAndAttach,
  };
}
