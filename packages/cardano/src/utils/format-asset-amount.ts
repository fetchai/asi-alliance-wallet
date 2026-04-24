import { calculateAssetBalance } from "../wallet/util/asset-balance";

/**
 * Formats a base-unit asset amount with optional decimals (e.g. token amounts).
 * When decimals is 0 or omitted, returns the raw amount string.
 * Reuses lace-aligned calculateAssetBalance from wallet/util/asset-balance.
 */
export function formatAssetAmount(amount: string, decimals?: number): string {
  try {
    const d = decimals ?? 0;
    if (d === 0) return amount;
    const minimalAssetInfo = { tokenMetadata: { decimals: d } };
    return calculateAssetBalance(
      amount,
      minimalAssetInfo as Parameters<typeof calculateAssetBalance>[1]
    );
  } catch {
    return amount;
  }
}
