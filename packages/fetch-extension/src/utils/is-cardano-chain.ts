/** True when the chain has the Cardano feature (cardano-preview, cardano-preprod, cardano-mainnet, etc.). Must match background: chain.features?.includes("cardano"). */
export function isCardanoChain(
  chain: { features?: string[] } | null | undefined
): boolean {
  return chain?.features?.includes("cardano") ?? false;
}
