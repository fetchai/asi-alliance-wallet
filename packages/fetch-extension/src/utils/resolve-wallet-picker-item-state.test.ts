import {
  resolveWalletPickerItemState,
  walletPickerRowIsClickable,
} from "./resolve-wallet-picker-item-state";

describe("resolveWalletPickerItemState", () => {
  const base = {
    isCardanoNetwork: false,
    isCardanoSupportedWallet: false,
    walletBoundAddress: "",
    isLoadingAddresses: false,
  };

  it("returns address from wallet-bound data only (same for selected semantics — no global store)", () => {
    const addr =
      "fetch1abcdefghijklmnopqrstuvwxyz1234567890abcdefghijkl";
    const a = resolveWalletPickerItemState({
      ...base,
      walletBoundAddress: addr,
    });
    const b = resolveWalletPickerItemState({
      ...base,
      walletBoundAddress: addr,
    });
    expect(a).toEqual({ kind: "address", address: addr });
    expect(b).toEqual(a);
  });

  it("EVM: returns hex address as stored wallet-bound (display format asserted by consumers)", () => {
    const hex = "0xabcdef0123456789abcdef0123456789abcdef01";
    const r = resolveWalletPickerItemState({
      ...base,
      walletBoundAddress: hex,
    });
    expect(r).toEqual({ kind: "address", address: hex });
    if (r.kind === "address") {
      expect(r.address.startsWith("0x")).toBe(true);
    }
  });

  it("Cardano unsupported wallet: unsupported even with no unrelated global data in inputs", () => {
    const r = resolveWalletPickerItemState({
      isCardanoNetwork: true,
      isCardanoSupportedWallet: false,
      walletBoundAddress: "",
      isLoadingAddresses: false,
    });
    expect(r).toEqual({
      kind: "unsupported",
      reason: "cardano_unsupported",
    });
  });

  it("Cardano supported: loading when address not yet bound and sync in flight", () => {
    const r = resolveWalletPickerItemState({
      isCardanoNetwork: true,
      isCardanoSupportedWallet: true,
      walletBoundAddress: "",
      isLoadingAddresses: true,
    });
    expect(r).toEqual({ kind: "loading", reason: "address_not_loaded" });
  });

  it("Cardano supported: empty when address not bound and not loading (not unsupported)", () => {
    const r = resolveWalletPickerItemState({
      isCardanoNetwork: true,
      isCardanoSupportedWallet: true,
      walletBoundAddress: "",
      isLoadingAddresses: false,
    });
    expect(r).toEqual({ kind: "empty", reason: "address_not_loaded" });
  });

  it("non-Cardano: empty when not loading and no address", () => {
    const r = resolveWalletPickerItemState({
      ...base,
      walletBoundAddress: "",
      isLoadingAddresses: false,
    });
    expect(r).toEqual({ kind: "empty", reason: "address_not_loaded" });
  });
});

describe("walletPickerRowIsClickable", () => {
  it("selected row is never clickable", () => {
    expect(
      walletPickerRowIsClickable({
        isRowSelected: true,
        isCardanoNetwork: false,
        isCardanoSupportedWallet: false,
        item: { kind: "address", address: "fetch1abc" },
      })
    ).toBe(false);
  });

  it("non-Cardano: clickable for non-selected even when loading", () => {
    expect(
      walletPickerRowIsClickable({
        isRowSelected: false,
        isCardanoNetwork: false,
        isCardanoSupportedWallet: false,
        item: { kind: "loading", reason: "address_not_loaded" },
      })
    ).toBe(true);
  });

  it("Cardano: requires supported wallet and bound address", () => {
    expect(
      walletPickerRowIsClickable({
        isRowSelected: false,
        isCardanoNetwork: true,
        isCardanoSupportedWallet: true,
        item: { kind: "loading", reason: "address_not_loaded" },
      })
    ).toBe(false);
    expect(
      walletPickerRowIsClickable({
        isRowSelected: false,
        isCardanoNetwork: true,
        isCardanoSupportedWallet: true,
        item: { kind: "address", address: "addr" },
      })
    ).toBe(true);
    expect(
      walletPickerRowIsClickable({
        isRowSelected: false,
        isCardanoNetwork: true,
        isCardanoSupportedWallet: false,
        item: { kind: "unsupported", reason: "cardano_unsupported" },
      })
    ).toBe(false);
  });

  it("Cardano supported: empty row is not clickable until address is bound", () => {
    expect(
      walletPickerRowIsClickable({
        isRowSelected: false,
        isCardanoNetwork: true,
        isCardanoSupportedWallet: true,
        item: { kind: "empty", reason: "address_not_loaded" },
      })
    ).toBe(false);
  });
});
