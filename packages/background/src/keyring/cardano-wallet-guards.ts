/** True if the key store is a 24-word mnemonic (Cardano-capable). */
export function walletSupportsCardano(
  ks: { type?: string; meta?: Record<string, unknown> } | null | undefined
): boolean {
  return (
    ks?.type === "mnemonic" && String(ks.meta?.["mnemonicLength"]) === "24"
  );
}

/**
 Keystore must leave Cardano networks: known non–24-word mnemonic, or non-mnemonic types
 that do not support Cardano via this wallet. For mnemonic without `mnemonicLength` in meta,
 returns false (indeterminate) so UI/alignment does not force fallback until post-unlock
 migration runs (see `calculateMnemonicLengthInBackground`), matching `getKeysForCardano`.
 */
export function walletShouldLeaveCardanoChain(
  ks: { type?: string; meta?: Record<string, unknown> } | null | undefined
): boolean {
  if (walletSupportsCardano(ks)) {
    return false;
  }
  if (ks?.type === "mnemonic") {
    const len = ks.meta?.["mnemonicLength"];
    if (len == null || len === "") {
      return false;
    }
    return String(len) !== "24";
  }
  return true;
}
