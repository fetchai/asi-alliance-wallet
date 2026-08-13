import type { CardanoNetwork } from "./network";
import type { ChainName } from "../wallet/lib/stake-pool-service";

const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${String(value)}`);
};

/**
 * Single source of truth for Blockfrost telemetry / provider chainName labels.
 */
export function getBlockfrostChainNameFromNetwork(
  network: CardanoNetwork
): ChainName {
  switch (network) {
    case "mainnet":
      return "Mainnet";
    case "preprod":
      return "Preprod";
    case "sanchonet":
      return "Sanchonet";
    case "preview":
      return "Preview";
    default:
      return assertNever(network);
  }
}

export async function getBlockfrostChainNameFromChainId(chainId: {
  networkMagic: number;
}): Promise<ChainName | undefined> {
  const { Cardano } = await import("@cardano-sdk/core");

  if (chainId.networkMagic === Cardano.NetworkMagics.Mainnet) {
    return "Mainnet";
  }
  if (chainId.networkMagic === Cardano.NetworkMagics.Preview) {
    return "Preview";
  }
  if (chainId.networkMagic === Cardano.NetworkMagics.Preprod) {
    return "Preprod";
  }
  if (chainId.networkMagic === Cardano.NetworkMagics.Sanchonet) {
    return "Sanchonet";
  }

  return undefined;
}

export function getCardanoNetworkFromBlockfrostChainName(
  chainName: ChainName
): CardanoNetwork {
  switch (chainName) {
    case "Mainnet":
      return "mainnet";
    case "Preprod":
      return "preprod";
    case "Sanchonet":
      return "sanchonet";
    case "Preview":
      return "preview";
    default:
      return assertNever(chainName);
  }
}
