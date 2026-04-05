import type { CardanoServiceState } from "./messages";

/**
 * Stable literals thrown by KeyRingService.ensureCardanoServiceReady and related Cardano init paths.
 * Keep in sync with throws in ../keyring/service.ts (single source for these messages).
 */
export const CARDANO_ENSURE_MESSAGE = {
  KEYRING_NOT_READY: "KeyRing not ready for Cardano initialization",
  NETWORK_CONTEXT_MISSING: "network_context_missing",
  MNEMONIC_24: "Cardano requires 24-word mnemonic",
} as const;

export function formatProviderUnavailableError(chainId?: string): string {
  return `provider_error: provider_unavailable${chainId ? `: ${chainId}` : ""}`;
}

export function formatWalletNotReadyError(chainId?: string): string {
  return `temporarily_unavailable: wallet_not_ready${
    chainId ? `: ${chainId}` : ""
  }`;
}

export function formatNetworkContextInvalidForCardano(chainId: string): string {
  return `network_context_invalid_for_cardano: ${chainId}`;
}

/**
 * Protocol-style errors: first matching prefix wins (startsWith).
 */
export function stateFromProtocolMessage(
  message: string
): CardanoServiceState | null {
  if (message.startsWith("syncing:")) return "syncing";
  if (message.startsWith("temporarily_unavailable:"))
    return "temporarily_unavailable";
  if (message.startsWith("provider_error:")) return "provider_error";
  return null;
}

/** Inner SDK/wallet try: unknown → temporarily_unavailable (existing handler semantics). */
export function stateFromErrorMessage(message: string): CardanoServiceState {
  return stateFromProtocolMessage(message) ?? "temporarily_unavailable";
}
