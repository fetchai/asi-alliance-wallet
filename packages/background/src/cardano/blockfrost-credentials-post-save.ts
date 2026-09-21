import {
  getBlockfrostChainNameFromNetwork,
  resetBlockfrostRateLimitTelemetry,
  type CardanoNetwork,
} from "@keplr-wallet/cardano";
import type { KeyRingService } from "../keyring/service";

export async function afterBlockfrostCredentialsChanged(params: {
  chainId: string;
  network: CardanoNetwork;
  keyRingService: KeyRingService;
}): Promise<void> {
  try {
    const chainName = getBlockfrostChainNameFromNetwork(params.network);
    resetBlockfrostRateLimitTelemetry(chainName);

    const selectedChainId =
      await params.keyRingService.chainsService.getSelectedChain();
    if (
      selectedChainId === params.chainId &&
      (await params.keyRingService.isRegisteredCardanoChain(params.chainId))
    ) {
      await params.keyRingService.reinitializeCardanoService(params.chainId);
    }
  } catch {
    console.warn(
      "[Cardano] Failed to refresh runtime after Blockfrost credentials change"
    );
  }
}
