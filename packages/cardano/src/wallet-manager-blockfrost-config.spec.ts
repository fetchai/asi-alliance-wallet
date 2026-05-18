jest.mock("@cardano-sdk/crypto", () => ({
  SodiumBip32Ed25519: {
    create: jest.fn(async () => ({})),
  },
}));

jest.mock("@cardano-sdk/key-management", () => ({
  InMemoryKeyAgent: {
    fromBip39MnemonicWords: jest.fn(async () => ({
      chainId: { networkMagic: 1 },
    })),
  },
}));

jest.mock("@cardano-sdk/core", () => ({
  Cardano: {
    ChainIds: {
      Mainnet: { networkMagic: 1 },
      Preprod: { networkMagic: 2 },
      Preview: { networkMagic: 3 },
      Sanchonet: { networkMagic: 4 },
    },
  },
}));

import { CardanoWalletManager } from "./wallet-manager";

const mnemonicWords = [
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "about",
];

describe("CardanoWalletManager blockfrostConfig injection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["BLOCKFROST_PROJECT_ID_PREPROD"];
    delete process.env["BLOCKFROST_API_KEY"];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns provider_unavailable without throw when blockfrostConfig is null", async () => {
    const manager = await CardanoWalletManager.create({
      mnemonicWords,
      network: "preprod",
      blockfrostConfig: null,
    });

    expect(manager.getRuntimeStatus()).toBe("provider_unavailable");
    expect(manager.hasWallet()).toBe(false);
  });

  it("uses injected blockfrostConfig when provided", async () => {
    const createFullWalletSpy = jest
      .spyOn(CardanoWalletManager as any, "createFullWallet")
      .mockResolvedValue({
        wallet: { id: "wallet" },
        providers: { chainHistoryProvider: {} },
      });

    const manager = await CardanoWalletManager.create({
      mnemonicWords,
      network: "preprod",
      blockfrostConfig: {
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: "custom-project-id",
      },
    });

    expect(createFullWalletSpy).toHaveBeenCalledWith(
      {
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: "custom-project-id",
      },
      expect.anything(),
      expect.any(Boolean),
      "preprod"
    );
    expect(manager.getRuntimeStatus()).toBe("ready");
    expect(manager.hasWallet()).toBe(true);

    createFullWalletSpy.mockRestore();
  });

  it("returns provider_unavailable for whitespace-only injected projectId", async () => {
    const createFullWalletSpy = jest.spyOn(
      CardanoWalletManager as any,
      "createFullWallet"
    );

    const manager = await CardanoWalletManager.create({
      mnemonicWords,
      network: "preprod",
      blockfrostConfig: {
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: "   ",
      },
    });

    expect(createFullWalletSpy).not.toHaveBeenCalled();
    expect(manager.getRuntimeStatus()).toBe("provider_unavailable");
    expect(manager.hasWallet()).toBe(false);

    createFullWalletSpy.mockRestore();
  });

  it("uses built-in env config when blockfrostConfig is undefined", async () => {
    process.env["BLOCKFROST_PROJECT_ID_PREPROD"] = "builtin-preprod-key";
    const createFullWalletSpy = jest
      .spyOn(CardanoWalletManager as any, "createFullWallet")
      .mockResolvedValue({
        wallet: { id: "wallet" },
        providers: { chainHistoryProvider: {} },
      });

    await CardanoWalletManager.create({
      mnemonicWords,
      network: "preprod",
    });

    expect(createFullWalletSpy).toHaveBeenCalledWith(
      {
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: "builtin-preprod-key",
      },
      expect.anything(),
      expect.any(Boolean),
      "preprod"
    );

    createFullWalletSpy.mockRestore();
  });
});
