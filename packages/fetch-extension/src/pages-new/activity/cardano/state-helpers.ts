import type {
  BlockfrostLimitPresentation,
  CardanoServiceState,
} from "@keplr-wallet/background";
import { getBlockfrostLimitBannerMessage } from "../../../utils/cardano-blockfrost";

export const BLOCKFROST_RATE_LIMIT_FALLBACK =
  "Blockfrost API key usage limit has been reached. Please try again later.";

export const isTransientState = (
  state: CardanoServiceState | undefined
): boolean => state === "syncing" || state === "temporarily_unavailable";

export const getStateErrorMessage = (
  state: CardanoServiceState | undefined,
  error: string | undefined,
  presentation?: BlockfrostLimitPresentation
): string => {
  if (state === "blockfrost_rate_limited") {
    const msg = presentation
      ? getBlockfrostLimitBannerMessage(presentation)
      : "";
    return msg || BLOCKFROST_RATE_LIMIT_FALLBACK;
  }
  if (state === "provider_error") {
    return error || "Cardano provider unavailable";
  }
  return error || "Transaction history unavailable";
};
