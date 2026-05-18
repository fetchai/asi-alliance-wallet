const mockCreate = jest.fn();
const mockDispose = jest.fn();
const mockDeriveAddress = jest.fn();
const mockFromBip39 = jest.fn();

jest.mock("./wallet-manager", () => ({
  CardanoWalletManager: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

jest.mock("@cardano-sdk/crypto", () => ({
  SodiumBip32Ed25519: {
    create: jest.fn(async () => ({})),
  },
}));

jest.mock("@cardano-sdk/key-management", () => ({
  InMemoryKeyAgent: {
    fromBip39MnemonicWords: (...args: unknown[]) => mockFromBip39(...args),
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

jest.mock("./adapters/env-adapter", () => ({
  logBlockfrostProviderStatus: jest.fn(),
}));

import { CardanoKeyRing, type KeyStore } from "./cardano-keyring";

const mnemonic = Array(23).fill("abandon").concat("about").join(" ");

const makeKeyStore = (): KeyStore => ({
  version: "1.2",
  type: "mnemonic",
  key: mnemonic,
  meta: {},
  curve: "secp256k1",
  crypto: {},
});

const makeManager = (runtimeStatus: "ready" | "provider_unavailable") => ({
  dispose: mockDispose,
  getRuntimeStatus: () => runtimeStatus,
  hasWallet: () => runtimeStatus === "ready",
});

describe("CardanoKeyRing blockfrost resolver", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFromBip39.mockResolvedValue({
      deriveAddress: mockDeriveAddress,
      chainId: { networkMagic: 2 },
    });
    mockDeriveAddress.mockResolvedValue({ address: "addr1test" });
    mockCreate.mockResolvedValue(makeManager("ready"));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("restore passes resolver result into CardanoWalletManager.create", async () => {
    const resolver = jest.fn(async () => ({
      baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      projectId: "custom-key",
    }));
    const keyRing = new CardanoKeyRing();

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod",
      {
        resolveBlockfrostConfig: resolver,
      }
    );

    expect(resolver).toHaveBeenCalledWith("preprod");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        network: "preprod",
        blockfrostConfig: {
          baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
          projectId: "custom-key",
        },
      })
    );
  });

  it("network switch rebuilds with resolver for the new network", async () => {
    const resolver = jest
      .fn()
      .mockResolvedValueOnce({
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: "preprod-key",
      })
      .mockResolvedValueOnce({
        baseUrl: "https://cardano-mainnet.blockfrost.io/api/v0",
        projectId: "mainnet-key",
      });
    const keyRing = new CardanoKeyRing();

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod",
      {
        resolveBlockfrostConfig: resolver,
      }
    );
    mockCreate.mockClear();
    mockDispose.mockClear();

    await keyRing.getKey("cardano-mainnet");

    expect(resolver).toHaveBeenLastCalledWith("mainnet");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        network: "mainnet",
        blockfrostConfig: {
          baseUrl: "https://cardano-mainnet.blockfrost.io/api/v0",
          projectId: "mainnet-key",
        },
      })
    );
  });

  it("without resolver passes blockfrostConfig undefined for legacy fallback", async () => {
    const keyRing = new CardanoKeyRing();

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod"
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        blockfrostConfig: undefined,
      })
    );
  });

  it("resolver returning null passes null and yields provider_unavailable manager", async () => {
    mockCreate.mockResolvedValue(makeManager("provider_unavailable"));
    const resolver = jest.fn(async () => null);
    const keyRing = new CardanoKeyRing();

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod",
      {
        resolveBlockfrostConfig: resolver,
      }
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        blockfrostConfig: null,
      })
    );
    expect(keyRing.getWalletManager()?.getRuntimeStatus()).toBe(
      "provider_unavailable"
    );
  });

  it("resolver throw leaves prior walletManager undisposed and sanitizes error", async () => {
    const resolver = jest.fn(async (network: string) => {
      if (network === "mainnet") {
        throw new Error("secret-project-id-should-not-leak");
      }
      return {
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
        projectId: "preprod-key",
      };
    });
    const keyRing = new CardanoKeyRing();

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod",
      {
        resolveBlockfrostConfig: resolver,
      }
    );
    const priorDisposeCount = mockDispose.mock.calls.length;
    const priorCreateCount = mockCreate.mock.calls.length;

    let thrownError: Error | undefined;
    try {
      await keyRing.getKey("cardano-mainnet");
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError?.message).toBe(
      "cardano_blockfrost_config_resolve_failed"
    );
    expect(thrownError?.message).not.toContain(
      "secret-project-id-should-not-leak"
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[CardanoKeyRing] Failed to resolve Blockfrost config"
    );
    expect(
      JSON.stringify(consoleErrorSpy.mock.calls).includes(
        "secret-project-id-should-not-leak"
      )
    ).toBe(false);
    expect(mockDispose.mock.calls.length).toBe(priorDisposeCount);
    expect(mockCreate.mock.calls.length).toBe(priorCreateCount);
    expect(keyRing.getWalletManager()?.getRuntimeStatus()).toBe("ready");
  });

  it("manager create failure rethrows sanitized error and preserves prior state", async () => {
    const resolver = jest.fn(async (network: string) => ({
      baseUrl: `https://${network}.blockfrost.io/api/v0`,
      projectId: `${network}-key`,
    }));
    const keyRing = new CardanoKeyRing();

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod",
      {
        resolveBlockfrostConfig: resolver,
      }
    );
    const priorDisposeCount = mockDispose.mock.calls.length;

    mockCreate.mockRejectedValueOnce(
      new Error("request failed with projectId=leaked-key")
    );

    await expect(keyRing.getKey("cardano-mainnet")).rejects.toThrow(
      "cardano_wallet_manager_create_failed"
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[CardanoKeyRing] Failed to create CardanoWalletManager"
    );
    const loggedPayload = consoleErrorSpy.mock.calls.find(
      (call) =>
        call[0] === "[CardanoKeyRing] Failed to create CardanoWalletManager"
    )?.[1];
    expect(loggedPayload).toBeUndefined();
    expect(mockDispose.mock.calls.length).toBe(priorDisposeCount);
    expect(keyRing.getWalletManager()?.getRuntimeStatus()).toBe("ready");
  });

  it("dispose failure after successful create does not block state update", async () => {
    mockDispose.mockImplementationOnce(() => {
      throw new Error("dispose failed");
    });
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const keyRing = new CardanoKeyRing();

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod"
    );
    await keyRing.getKey("cardano-mainnet");

    expect(keyRing.getWalletManager()?.getRuntimeStatus()).toBe("ready");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[CardanoKeyRing] Failed to dispose previous CardanoWalletManager"
    );

    consoleWarnSpy.mockRestore();
  });
});
