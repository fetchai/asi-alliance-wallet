/**
 * Wallet picker intentionally resolves display address from wallet-bound cache/data,
 * not from global selected account state, to avoid stale transient renders during async wallet switching.
 *
 * The `selected` flag must not be passed in or influence kind/reason — use it only in the UI layer
 * for checkmarks/accents and for "already selected → row not clickable".
 */

export type WalletPickerItemReason =
  | "cardano_unsupported"
  | "address_not_loaded";

export type WalletPickerItemState =
  | { kind: "address"; address: string }
  | { kind: "unsupported"; reason: WalletPickerItemReason }
  | { kind: "loading"; reason: WalletPickerItemReason }
  | { kind: "empty"; reason: WalletPickerItemReason };

export function resolveWalletPickerItemState(input: {
  isCardanoNetwork: boolean;
  isCardanoSupportedWallet: boolean;
  walletBoundAddress: string;
  isLoadingAddresses: boolean;
}): WalletPickerItemState {
  const {
    isCardanoNetwork,
    isCardanoSupportedWallet,
    walletBoundAddress,
    isLoadingAddresses,
  } = input;

  if (isCardanoNetwork && !isCardanoSupportedWallet) {
    return { kind: "unsupported", reason: "cardano_unsupported" };
  }

  if (walletBoundAddress) {
    return { kind: "address", address: walletBoundAddress };
  }

  if (isLoadingAddresses) {
    return { kind: "loading", reason: "address_not_loaded" };
  }

  return { kind: "empty", reason: "address_not_loaded" };
}

/**
 * Row clickability is derived from resolver output plus Cardano rules; avoid a separate isClickable flag on the item state.
 */
export function walletPickerRowIsClickable(input: {
  isRowSelected: boolean;
  isCardanoNetwork: boolean;
  isCardanoSupportedWallet: boolean;
  item: WalletPickerItemState;
}): boolean {
  if (input.isRowSelected) {
    return false;
  }
  if (input.item.kind === "unsupported") {
    return false;
  }
  if (input.isCardanoNetwork) {
    return input.isCardanoSupportedWallet && input.item.kind === "address";
  }
  return true;
}
