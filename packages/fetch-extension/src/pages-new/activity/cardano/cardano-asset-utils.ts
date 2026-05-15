import type { AppCurrency } from "@keplr-wallet/types";
import { DenomHelper } from "@keplr-wallet/common";
import { CARDANO_NATIVE_TOKEN_TYPE } from "@keplr-wallet/stores";

/**
 * Resolves icon URL for a Cardano native asset by matching chain currencies
 * (denom format: cardanonative:{assetId}:...). Single source of truth for
 * asset icon resolution, aligned with lace getTokenLogoUrl/getTokenDisplayMetadata pattern.
 */
export function getCardanoAssetIconUrl(
  currencies: AppCurrency[],
  assetId: string
): string | undefined {
  try {
    const found = currencies.find((c) => {
      const denom = c?.coinMinimalDenom;
      if (!denom || typeof denom !== "string") return false;
      const h = new DenomHelper(denom);
      return (
        h.type === CARDANO_NATIVE_TOKEN_TYPE && h.contractAddress === assetId
      );
    });
    return found?.coinImageUrl;
  } catch {
    return undefined;
  }
}
