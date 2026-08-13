/**
 * Splits Cardano assetId (policyId + assetName hex) into policyId and assetName.
 * policyId is 56 hex chars (28 bytes), assetName is the rest. Aligns with Wallet.Cardano.AssetId.getPolicyId/getAssetName.
 */
export function parseAssetId(assetId: string): {
  policyId: string;
  assetName: string;
} {
  return {
    policyId: assetId.slice(0, 56),
    assetName: assetId.slice(56),
  };
}
