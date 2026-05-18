import {
  getCardanoNetworkFromChainId,
  parseCardanoUiError,
} from "@keplr-wallet/cardano";
import type { BlockfrostLimitPresentation } from "@keplr-wallet/background";

export type { BlockfrostLimitPresentation };

export { getCardanoNetworkFromChainId };

export function mapBlockfrostCredentialsErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");

  switch (message) {
    case "cardano_wallet_locked":
      return "Unlock your wallet to change Blockfrost settings.";
    case "blockfrost_credentials_unavailable":
      return "Blockfrost credentials storage is unavailable.";
    case "cardano_network_mismatch":
      return "Selected network does not match the current chain.";
    case "blockfrost_invalid_project_id":
    case "blockfrost_missing_project_id":
      return "Enter a valid Blockfrost project ID.";
    case "blockfrost_credentials_requires_confirmation":
      return "Could not verify this key online. You can save it anyway.";
    case "blockfrost_validation_invalid_key":
      return "Blockfrost rejected this project ID.";
    case "blockfrost_validation_network_mismatch":
      return "This project ID does not match the selected Cardano network.";
    case "blockfrost_validation_unreachable":
      return "Could not reach Blockfrost to verify this key.";
    default:
      if (message.startsWith("blockfrost_validation_")) {
        return "Could not save Blockfrost settings. Check the project ID and try again.";
      }
      return "Could not save Blockfrost settings. Please try again.";
  }
}

export function blockfrostLimitPresentationFromUiError(
  message: string
): BlockfrostLimitPresentation | undefined {
  const parsed = parseCardanoUiError(message);
  if (parsed.code === "blockfrost_builtin_limit") {
    return {
      activeKeySource: "builtin",
      showBuiltinLimitCta: true,
      showUserKeyLimitWarning: false,
    };
  }
  if (parsed.code === "blockfrost_user_limit") {
    return {
      activeKeySource: "custom",
      showBuiltinLimitCta: false,
      showUserKeyLimitWarning: true,
    };
  }
  return undefined;
}

export function getBlockfrostLimitBannerMessage(
  presentation: BlockfrostLimitPresentation
): string {
  if (presentation.showUserKeyLimitWarning) {
    return "Your Blockfrost API key has reached its usage limit. Try again later or use a different key.";
  }
  if (presentation.showBuiltinLimitCta) {
    return "The built-in Blockfrost API key has reached its usage limit. Add your own key to continue using Cardano features.";
  }
  return "";
}
