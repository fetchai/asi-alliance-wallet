/**
 * Truth-source for the current native FET bridge UI (matches hardcoded bridge
 * contracts in the query layer: Ethereum mainnet and Fetchhub).
 */
export type NativeFetBridgeMode = "ethereum" | "fetchhub" | "none";

export function getNativeBridgeModeByChainId(
  chainId: string
): NativeFetBridgeMode {
  if (chainId === "1") {
    return "ethereum";
  }
  if (chainId === "fetchhub-4") {
    return "fetchhub";
  }
  return "none";
}
