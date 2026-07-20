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

const makeManager = (
  runtimeStatus: "ready" | "provider_unavailable",
  runtimeInstanceId = "rt_test"
) => {
  let attached = false;
  let disposed = false;
  const manager = {
    dispose: jest.fn(() => {
      disposed = true;
      attached = false;
      mockDispose();
    }),
    getRuntimeStatus: () => runtimeStatus,
    hasWallet: () => runtimeStatus === "ready",
    getRuntimeInstanceId: () => runtimeInstanceId,
    markAttached: jest.fn(() => {
      attached = true;
    }),
    markDetached: jest.fn(() => {
      attached = false;
    }),
    isAttached: () => attached,
    isDisposed: () => disposed,
  };
  return manager;
};

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

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-mainnet",
      {
        resolveBlockfrostConfig: resolver,
      }
    );

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

  it("getKey for another Cardano network uses KeyContext and does not create WalletManager", async () => {
    const keyRing = new CardanoKeyRing();
    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod"
    );
    mockCreate.mockClear();

    const key = await keyRing.getKey("cardano-mainnet");

    expect(Buffer.from(key.address).toString("utf8")).toBe("addr1test");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("Cardano→Cardano rebuild keeps runtimeGeneration and refreshes ownerSwitchGeneration", async () => {
    let switchGeneration = 10;
    const getOwnerSwitchGeneration = jest.fn(() => switchGeneration);
    const getSelectedChainId = jest.fn(() => "cardano-mainnet");
    const resolver = jest.fn(async (network: string) => ({
      baseUrl: `https://cardano-${network}.blockfrost.io/api/v0`,
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
        runtimeGeneration: 3,
        ownerSwitchGeneration: switchGeneration,
        getOwnerSwitchGeneration,
        getSelectedChainId,
        selectedChainIdAtCreate: "cardano-preprod",
        createdBy: "restore",
      }
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeGeneration: 3,
        ownerSwitchGeneration: 10,
        chainId: "cardano-preprod",
        createdBy: "restore",
      })
    );

    mockCreate.mockClear();
    switchGeneration = 11;
    getSelectedChainId.mockReturnValue("cardano-mainnet");

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-mainnet",
      {
        resolveBlockfrostConfig: resolver,
        runtimeGeneration: 3,
        getOwnerSwitchGeneration,
        getSelectedChainId,
        selectedChainIdAtCreate: "cardano-mainnet",
        createdBy: "restore",
      }
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        network: "mainnet",
        chainId: "cardano-mainnet",
        runtimeGeneration: 3,
        ownerSwitchGeneration: 11,
        selectedChainIdAtCreate: "cardano-mainnet",
        createdBy: "restore",
        getSelectedChainId,
      })
    );
    expect(getOwnerSwitchGeneration).toHaveBeenCalled();
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
      await keyRing.restore(
        makeKeyStore(),
        "password",
        undefined,
        "cardano-mainnet",
        {
          resolveBlockfrostConfig: resolver,
        }
      );
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

    await expect(
      keyRing.restore(
        makeKeyStore(),
        "password",
        undefined,
        "cardano-mainnet",
        {
          resolveBlockfrostConfig: resolver,
        }
      )
    ).rejects.toThrow("cardano_wallet_manager_create_failed");

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
    // Distinct manager instances — production create never reuses the prior object.
    mockCreate
      .mockResolvedValueOnce(makeManager("ready", "rt_prior"))
      .mockResolvedValueOnce(makeManager("ready", "rt_next"));
    const keyRing = new CardanoKeyRing();

    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-preprod"
    );
    await keyRing.restore(
      makeKeyStore(),
      "password",
      undefined,
      "cardano-mainnet"
    );

    expect(keyRing.getWalletManager()?.getRuntimeStatus()).toBe("ready");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[CardanoKeyRing] Failed to dispose previous CardanoWalletManager"
    );

    consoleWarnSpy.mockRestore();
  });

  describe("P1 network-runtime ownership", () => {
    it("single-flight join contract: create===1 and attached===1 (mirrors KeyRingService)", async () => {
      let releaseCreate: (() => void) | undefined;
      let createCalls = 0;
      const managers: ReturnType<typeof makeManager>[] = [];

      mockCreate.mockImplementation(async () => {
        createCalls += 1;
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        const manager = makeManager("ready", `rt_${createCalls}`);
        managers.push(manager);
        return manager;
      });

      const keyRing = new CardanoKeyRing();
      // Same contract as KeyRingService NetworkRuntime in-flight join.
      let inFlight: Promise<void> | null = null;
      const ensure = (): Promise<void> => {
        if (inFlight) {
          return inFlight;
        }
        inFlight = keyRing
          .restore(makeKeyStore(), "password", undefined, "cardano-preprod")
          .finally(() => {
            if (inFlight) {
              inFlight = null;
            }
          });
        return inFlight;
      };

      const first = ensure();
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);

      const second = ensure();
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);

      releaseCreate?.();
      await Promise.all([first, second]);

      expect(createCalls).toBe(1);
      expect(managers.filter((m) => m.isAttached())).toHaveLength(1);
      expect(managers.filter((m) => !m.isDisposed())).toHaveLength(1);
    });

    it("rebuild mutex prevents overlapping CardanoWalletManager.create", async () => {
      let releaseCreate: (() => void) | undefined;
      let createCalls = 0;

      mockCreate.mockImplementation(async () => {
        createCalls += 1;
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        return makeManager("ready", `rt_${createCalls}`);
      });

      const keyRing = new CardanoKeyRing();
      const first = keyRing.restore(
        makeKeyStore(),
        "password",
        undefined,
        "cardano-preprod"
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);

      const second = (keyRing as any).rebuildAgentsForNetwork("preprod", {
        chainId: "cardano-preprod",
      });
      await new Promise((resolve) => setImmediate(resolve));
      // Second must wait on mutex — no overlapping create.
      expect(createCalls).toBe(1);

      releaseCreate?.();
      await first;
      await new Promise((resolve) => setImmediate(resolve));
      releaseCreate?.();
      await second;
    });

    it("stale candidate after create is never attached and always disposed", async () => {
      let releaseCreate: (() => void) | undefined;
      mockCreate.mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        return makeManager("ready", "rt_stale");
      });

      const keyRing = new CardanoKeyRing();
      const restorePromise = keyRing.restore(
        makeKeyStore(),
        "password",
        undefined,
        "cardano-preprod"
      );
      await new Promise((resolve) => setImmediate(resolve));

      keyRing.invalidatePendingRebuilds();
      releaseCreate?.();

      await expect(restorePromise).rejects.toThrow(
        "cardano_wallet_manager_stale_create"
      );

      const created = mockCreate.mock.results[0]?.value;
      const manager = created ? await created : undefined;
      expect(manager?.isAttached()).toBe(false);
      expect(mockDispose).toHaveBeenCalled();
      expect(keyRing.getWalletManager()).toBeUndefined();
    });

    it("soft-detach of A during create B disposes A once and attaches B", async () => {
      let releaseCreate: (() => void) | undefined;
      const prior = makeManager("ready", "rt_A");
      const next = makeManager("ready", "rt_B");
      mockCreate
        .mockResolvedValueOnce(prior)
        .mockImplementationOnce(async () => {
          await new Promise<void>((resolve) => {
            releaseCreate = resolve;
          });
          return next;
        });

      const keyRing = new CardanoKeyRing();
      await keyRing.restore(
        makeKeyStore(),
        "password",
        undefined,
        "cardano-preprod"
      );
      expect(keyRing.getWalletManager()?.getRuntimeInstanceId()).toBe("rt_A");

      const rebuildPromise = (keyRing as any).rebuildAgentsForNetwork(
        "mainnet",
        { chainId: "cardano-mainnet" }
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(keyRing.isRebuildInFlight()).toBe(true);

      // Soft-detach A while B is mid-create (stale exact-dispose path).
      expect(keyRing.detachWalletManagerIfInstance("rt_A")).toBe(true);
      expect(prior.dispose).toHaveBeenCalledTimes(1);
      expect(keyRing.getWalletManager()).toBeUndefined();

      releaseCreate?.();
      await rebuildPromise;

      expect(keyRing.getWalletManager()?.getRuntimeInstanceId()).toBe("rt_B");
      // Soft-detach already disposed A — rebuild must not dispose A a second time.
      expect(prior.dispose).toHaveBeenCalledTimes(1);
      expect(next.isAttached()).toBe(true);
    });
  });
});
