import {
  walletShouldLeaveCardanoChain,
  walletSupportsCardano,
} from "./cardano-wallet-guards";

describe("walletShouldLeaveCardanoChain (mnemonic without mnemonicLength)", () => {
  it("returns false when mnemonicLength is absent so legacy wallets are not forced off Cardano pre-migration", () => {
    const ks = {
      type: "mnemonic",
      meta: { name: "legacy" },
    };
    expect(walletSupportsCardano(ks)).toBe(false);
    expect(walletShouldLeaveCardanoChain(ks)).toBe(false);
  });
});
