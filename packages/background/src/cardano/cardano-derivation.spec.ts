import {
  CardanoKeyRing,
  CardanoWalletManager,
  getBlockfrostConfigs,
} from "@keplr-wallet/cardano";

const keyAgentFactory = jest.fn();

jest.mock("@cardano-sdk/tx-construction", () => ({
  minAdaRequired: jest.fn(),
}));

jest.mock("@cardano-sdk/crypto", () => ({
  SodiumBip32Ed25519: { create: jest.fn().mockResolvedValue({}) },
}));

jest.mock("@cardano-sdk/key-management", () => ({
  InMemoryKeyAgent: {
    fromBip39MnemonicWords: (...args: any[]) => keyAgentFactory(...args),
  },
}));

describe("Cardano derivation regressions", () => {
  const mnemonic =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

  const keyStore = {
    version: "1.2" as const,
    type: "mnemonic" as const,
    key: mnemonic,
    meta: {},
    bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
    curve: "secp256k1" as any,
    crypto: {},
  };

  beforeEach(() => {
    keyAgentFactory.mockReset();
    keyAgentFactory.mockImplementation(async (args: any) => ({
      chainId: args.chainId,
      deriveAddress: jest
        .fn()
        .mockResolvedValue({ address: "addr_test1xyz", rewardAccount: "stake_test1xyz" }),
    }));
  });

  it("keeps passphrase consistent between keyring agent and wallet manager", async () => {
    const createSpy = jest
      .spyOn(CardanoWalletManager, "create")
      .mockResolvedValue({ hasWallet: () => true } as any);

    const ring = new CardanoKeyRing();
    await ring.restore(keyStore as any, "wallet-password", undefined, "cardano-mainnet");

    const keyAgentArgs = keyAgentFactory.mock.calls[0][0];
    expect(await keyAgentArgs.getPassphrase()).toEqual(new Uint8Array());
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ passphrase: new Uint8Array() })
    );
  });

  it("keeps passphrase stable when switching network", async () => {
    jest
      .spyOn(CardanoWalletManager, "create")
      .mockResolvedValue({ hasWallet: () => true, dispose: jest.fn() } as any);

    const ring = new CardanoKeyRing();
    await ring.restore(keyStore as any, "wallet-password", undefined, "cardano-mainnet");
    await ring.getKey("cardano-preprod");

    expect(keyAgentFactory).toHaveBeenCalledTimes(2);
    const initialPassphrase = await keyAgentFactory.mock.calls[0][0].getPassphrase();
    const switchedPassphrase = await keyAgentFactory.mock.calls[1][0].getPassphrase();
    expect(initialPassphrase).toEqual(switchedPassphrase);
    expect(switchedPassphrase).toEqual(new Uint8Array());
  });
});

describe("Cardano env adapter regressions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["BLOCKFROST_PROJECT_ID_PREPROD"];
    delete process.env["BLOCKFROST_API_KEY"];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not use shipped preprod Blockfrost project id fallback", () => {
    const configs = getBlockfrostConfigs();
    expect(configs.preprod.projectId).toBe("");
  });
});
