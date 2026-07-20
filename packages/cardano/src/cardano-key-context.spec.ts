jest.mock("@cardano-sdk/crypto", () => ({
  SodiumBip32Ed25519: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("@cardano-sdk/key-management", () => ({
  InMemoryKeyAgent: {
    fromBip39MnemonicWords: jest.fn(),
  },
}));

jest.mock("@cardano-sdk/core", () => ({
  Cardano: {
    ChainIds: {
      Mainnet: { networkId: 1 },
      Preprod: { networkId: 0 },
      Preview: { networkId: 0 },
      Sanchonet: { networkId: 0 },
    },
  },
}));

import { InMemoryKeyAgent } from "@cardano-sdk/key-management";
import { CardanoKeyContext } from "./cardano-key-context";
import * as walletManagerModule from "./wallet-manager";

const MNEMONIC_24 = Array.from({ length: 24 }, (_, i) => `word${i}`).join(" ");

describe("CardanoKeyContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (InMemoryKeyAgent.fromBip39MnemonicWords as jest.Mock).mockResolvedValue({
      deriveAddress: jest
        .fn()
        .mockResolvedValue({ address: "addr_test1_offline" }),
    });
  });

  it("derives address without creating CardanoWalletManager", async () => {
    const createSpy = jest
      .spyOn(walletManagerModule.CardanoWalletManager, "create")
      .mockImplementation(() => {
        throw new Error(
          "CardanoWalletManager.create must not run for KeyContext"
        );
      });

    try {
      const ctx = await CardanoKeyContext.create({
        mnemonicWords: MNEMONIC_24.trim().split(/\s+/),
        chainId: "cardano-preprod",
        accountIndex: 0,
      });

      const key = await ctx.getKey();

      expect(key.algo).toBe("cardano_address_only");
      expect(Buffer.from(key.address).toString("utf8")).toBe(
        "addr_test1_offline"
      );
      expect(createSpy).not.toHaveBeenCalled();
      expect(InMemoryKeyAgent.fromBip39MnemonicWords).toHaveBeenCalledTimes(1);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("rejects non-cardano / unknown chainId", async () => {
    await expect(
      CardanoKeyContext.create({
        mnemonicWords: MNEMONIC_24.trim().split(/\s+/),
        chainId: "cosmoshub-4",
      })
    ).rejects.toThrow(/network_context_invalid_chain/);
  });

  it("rejects non-24-word mnemonic", async () => {
    await expect(
      CardanoKeyContext.create({
        mnemonicWords: ["one", "two"],
        chainId: "cardano-mainnet",
      })
    ).rejects.toThrow("Cardano requires 24-word mnemonic");
  });
});
