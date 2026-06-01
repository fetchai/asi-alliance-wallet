export type CardanoNetwork = "mainnet" | "preview" | "preprod" | "sanchonet";

export function getCardanoNetworkFromChainId(chainId: string): CardanoNetwork {
  switch (chainId) {
    case "cardano-mainnet":
      return "mainnet";
    case "cardano-preview":
      return "preview";
    case "cardano-preprod":
      return "preprod";
    case "cardano-sanchonet":
      return "sanchonet";
    default:
      throw new Error(`network_context_invalid_chain: ${chainId}`);
  }
}

export async function getCardanoChainIdFromNetwork(network: CardanoNetwork) {
  const { Cardano } = await import("@cardano-sdk/core");

  switch (network) {
    case "mainnet":
      return Cardano.ChainIds.Mainnet;
    case "preprod":
      return Cardano.ChainIds.Preprod;
    case "sanchonet":
      return Cardano.ChainIds.Sanchonet;
    case "preview":
    default:
      return Cardano.ChainIds.Preview;
  }
}

export function isCardanoChainId(chainId: string): boolean {
  return chainId.startsWith("cardano-");
}
