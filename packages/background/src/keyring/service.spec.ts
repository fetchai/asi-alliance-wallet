import { KeyRingService } from "./service";
import { KeyRingStatus } from "./keyring";
import { MemoryKVStore } from "@keplr-wallet/common";
import type { CardanoService } from "../cardano/service";
import { ChainInfo } from "@keplr-wallet/types";
import { PREFERRED_DEFAULT_CHAIN_ID } from "../chains/default-chain";
import {
  createWiredTestChainsService,
  TEST_EMBED_CHAINS,
} from "../chains/chains-service.test-helpers";

describe("KeyRingService", () => {
  let service: KeyRingService;
  let mockEnv: any;
  let mockCardanoService: CardanoService;

  beforeEach(() => {
    mockCardanoService = {
      reset: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(false),
      isReady: jest.fn().mockReturnValue(false),
      isKeyAgentReady: jest.fn().mockReturnValue(false),
      getAttachedRuntimeInstanceId: jest.fn().mockReturnValue(undefined),
      disposeRuntimeIfInstance: jest.fn(),
      getRuntimeState: jest.fn().mockReturnValue("not_initialized"),
    } as any as CardanoService;
    service = new KeyRingService(
      new MemoryKVStore("test"),
      [],
      {} as any,
      mockCardanoService
    );

    // Mock keyRing property
    service["keyRing"] = {
      status: KeyRingStatus.NOTLOADED,
      restore: jest.fn(),
    } as any;

    mockEnv = {};
  });

  function attachMockSupervisor(
    svc: KeyRingService,
    overrides: {
      ensureReady?: jest.Mock;
      resetHostRuntime?: jest.Mock;
    } = {}
  ) {
    const ensureReady =
      overrides.ensureReady ?? jest.fn().mockResolvedValue(undefined);
    const resetHostRuntime = overrides.resetHostRuntime ?? jest.fn();
    svc["cardanoRuntimeSupervisor"] = {
      ensureReady,
      resetHostRuntime,
      getRuntimeGeneration: jest.fn().mockReturnValue(1),
      getOwnerChainId: jest.fn(),
      getOwnerRevision: jest.fn(),
      onAuthorityCommitted: jest.fn(),
      adoptCommittedSnapshot: jest.fn(),
    } as any;
    return { ensureReady, resetHostRuntime };
  }

  describe("checkReadiness", () => {
    it("should return EMPTY status when keyring is empty", async () => {
      // Mock keyring status
      service["keyRing"] = {
        status: KeyRingStatus.EMPTY,
        restore: jest.fn(),
      } as any;

      const result = await service.checkReadiness(mockEnv);
      expect(result).toBe(KeyRingStatus.EMPTY);
    });

    it("should restore keyring when status is NOTLOADED", async () => {
      // Mock keyring status and restore method
      let status = KeyRingStatus.NOTLOADED;
      const mockRestore = jest.fn().mockImplementation(() => {
        status = KeyRingStatus.EMPTY;
      });

      service["keyRing"] = {
        get status() {
          return status;
        },
        restore: mockRestore,
      } as any;

      const result = await service.checkReadiness(mockEnv);
      expect(mockRestore).toHaveBeenCalled();
      expect(result).toBe(KeyRingStatus.EMPTY);
    });

    it("should request unlock when status is LOCKED", async () => {
      // Mock keyring status and interaction service
      service["keyRing"] = {
        status: KeyRingStatus.LOCKED,
        restore: jest.fn(),
      } as any;

      const mockWaitApprove = jest.fn();
      service["interactionService"] = { waitApprove: mockWaitApprove } as any;

      await service.checkReadiness(mockEnv);
      expect(mockWaitApprove).toHaveBeenCalledWith(
        mockEnv,
        "/unlock",
        "unlock",
        {}
      );
    });

    it("should return UNLOCKED status when keyring is already unlocked", async () => {
      // Mock keyring status
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        restore: jest.fn(),
      } as any;

      const result = await service.checkReadiness(mockEnv);
      expect(result).toBe(KeyRingStatus.UNLOCKED);
    });
  });

  describe("enable", () => {
    it("should throw error when keyring is empty", async () => {
      // Mock keyring status
      service["keyRing"] = {
        status: KeyRingStatus.EMPTY,
        restore: jest.fn(),
      } as any;

      await expect(service.enable(mockEnv)).rejects.toThrow(
        "key doesn't exist"
      );
    });

    it("should not throw error when keyring is not empty", async () => {
      // Mock keyring status
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        restore: jest.fn(),
      } as any;

      const result = await service.enable(mockEnv);
      expect(result).toBe(KeyRingStatus.UNLOCKED);
    });
  });

  describe("createMnemonicKey security", () => {
    it("does not persist cardanoSerializedAgent even if cardano meta provider returns it", async () => {
      const mockCreateMnemonicKey = jest.fn().mockResolvedValue({
        status: KeyRingStatus.UNLOCKED,
        multiKeyStoreInfo: [],
      });
      service["keyRing"] = {
        createMnemonicKey: mockCreateMnemonicKey,
      } as any;
      service["cardanoService"] = {
        createMetaFromMnemonic: jest.fn().mockResolvedValue({
          cardano: "true",
          coinType: "1815",
          cardanoSerializedAgent: '{"secret":true}',
        }),
      } as any;

      await service.createMnemonicKey(
        "scrypt",
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        "password",
        { name: "Wallet 1" },
        { account: 0, change: 0, addressIndex: 0 }
      );

      expect(mockCreateMnemonicKey).toHaveBeenCalledTimes(1);
      const mergedMeta = mockCreateMnemonicKey.mock.calls[0][3] as Record<
        string,
        string
      >;
      expect(mergedMeta["cardano"]).toBe("true");
      expect(mergedMeta["coinType"]).toBe("1815");
      expect(mergedMeta["cardanoSerializedAgent"]).toBeUndefined();
    });
  });

  describe("cardano blockfrost runtime reinit", () => {
    it("reinitializeCardanoService resets runtime and restores selected chain", async () => {
      const ensure = jest.fn().mockResolvedValue(undefined);
      const { resetHostRuntime } = attachMockSupervisor(service);
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["chainsService"] = {
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["ensureCardanoServiceReady"] = ensure;

      await service.reinitializeCardanoService("cardano-preprod");

      expect(resetHostRuntime).toHaveBeenCalled();
      expect(ensure).toHaveBeenCalledWith("cardano-preprod");
    });

    it("isRegisteredCardanoChain delegates to chain registry features", async () => {
      service["chainsService"] = {
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;

      await expect(
        service.isRegisteredCardanoChain("cardano-preprod")
      ).resolves.toBe(true);
    });
  });

  describe("lock lifecycle", () => {
    it("resets cardano runtime state on lock", () => {
      let status = KeyRingStatus.UNLOCKED;
      const mockLock = jest.fn().mockImplementation(() => {
        status = KeyRingStatus.LOCKED;
      });
      const { resetHostRuntime } = attachMockSupervisor(service);
      service["keyRing"] = {
        get status() {
          return status;
        },
        lock: mockLock,
      } as any;

      const result = service.lock();

      expect(mockLock).toHaveBeenCalled();
      expect(resetHostRuntime).toHaveBeenCalled();
      expect(result).toBe(KeyRingStatus.LOCKED);
    });
  });

  describe("ensureCardanoServiceReady contract", () => {
    it("throws when restore attempt completes but service is still not ready", async () => {
      attachMockSupervisor(service, {
        ensureReady: jest.fn().mockResolvedValue(undefined),
      });
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
        getSelectedChainSnapshot: jest
          .fn()
          .mockResolvedValue({ chainId: "cardano-mainnet", revision: 1 }),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(true),
        isReady: jest.fn().mockReturnValue(false),
        isReadyForChain: jest.fn().mockReturnValue(false),
        isKeyAgentReady: jest.fn().mockReturnValue(false),
        restoreFromKeyStore: jest.fn().mockResolvedValue(undefined),
        getRuntimeState: jest.fn().mockReturnValue("ok"),
      } as any;

      await expect(
        service.ensureCardanoServiceReady("cardano-mainnet")
      ).rejects.toThrow("temporarily_unavailable: wallet_not_ready");
    });

    it("getKey uses offline KeyContext without NetworkRuntime ensure", async () => {
      const key = {
        algo: "cardano_address_only",
        pubKey: new Uint8Array(),
        address: Buffer.from("addr_test1qq"),
        isNanoLedger: false,
        isKeystone: false,
      };
      const keyStore = {
        type: "mnemonic",
        meta: { mnemonicLength: "24" },
      };
      const getCardanoKeyForKeyStore = jest.fn().mockResolvedValue(key);
      const restoreFromKeyStore = jest.fn();
      const { ensureReady } = attachMockSupervisor(service);
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue(keyStore),
        getCardanoKeyForKeyStore,
      } as any;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cosmoshub-4"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(false),
        isReady: jest.fn().mockReturnValue(false),
        isKeyAgentReady: jest.fn().mockReturnValue(false),
        restoreFromKeyStore,
        getKey: jest.fn(),
      } as any;

      await expect(service.getKey("cardano-preprod")).resolves.toEqual(key);
      expect(getCardanoKeyForKeyStore).toHaveBeenCalledWith(
        "cardano-preprod",
        keyStore
      );
      expect(restoreFromKeyStore).not.toHaveBeenCalled();
      expect(ensureReady).not.toHaveBeenCalled();
      expect(service["cardanoService"].getKey).not.toHaveBeenCalled();
    });

    it("ensure(mode:key) does not create NetworkRuntime", async () => {
      const restoreFromKeyStore = jest.fn();
      const { ensureReady } = attachMockSupervisor(service);
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
      } as any;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cosmoshub-4"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(false),
        isReady: jest.fn().mockReturnValue(false),
        restoreFromKeyStore,
      } as any;

      await expect(
        service.ensureCardanoServiceReady("cardano-preprod", { mode: "key" })
      ).resolves.toBeUndefined();
      expect(restoreFromKeyStore).not.toHaveBeenCalled();
      expect(ensureReady).not.toHaveBeenCalled();
    });

    it("rejects stale Cardano ensure when selected chain is non-Cardano", async () => {
      const restoreFromKeyStore = jest.fn();
      attachMockSupervisor(service);
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cosmoshub-4"),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(false),
        restoreFromKeyStore,
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({}),
      } as any;

      await expect(
        service.ensureCardanoServiceReady("cardano-preview")
      ).rejects.toThrow("network_context_invalid_for_cardano: cardano-preview");
      expect(restoreFromKeyStore).not.toHaveBeenCalled();
    });

    it("rejects ensure when selected chain is not the requested Cardano chain", async () => {
      const restoreFromKeyStore = jest.fn();
      attachMockSupervisor(service);
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cosmoshub-4"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(false),
        isReady: jest.fn().mockReturnValue(false),
        restoreFromKeyStore,
      } as any;

      await expect(
        service.ensureCardanoServiceReady("cardano-preview")
      ).rejects.toThrow("network_context_invalid_for_cardano: cardano-preview");
      expect(restoreFromKeyStore).not.toHaveBeenCalled();
    });
  });

  describe("unlock with selected chain", () => {
    it("returns UNLOCKED and keeps Cardano detached without NetworkRuntime on Cardano unlock", async () => {
      const chainsService = await createWiredTestChainsService([
        ...TEST_EMBED_CHAINS,
        {
          chainId: "cardano-preview",
          chainName: "Cardano Preview",
          features: ["cardano"],
        } as ChainInfo,
      ]);
      await chainsService.setSelectedChain("cardano-preview");

      const localCardano = {
        reset: jest.fn(),
        restoreFromKeyStore: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(false),
        isReady: jest.fn().mockReturnValue(false),
        isKeyAgentReady: jest.fn().mockReturnValue(false),
        getRuntimeState: jest.fn().mockReturnValue("not_initialized"),
        getAttachedRuntimeInstanceId: jest.fn(),
        disposeRuntimeIfInstance: jest.fn(),
        invalidateAdvertisedReadiness: jest.fn(),
      } as any as CardanoService;

      service = new KeyRingService(
        new MemoryKVStore("test-keyring-unlock-cardano"),
        [
          ...TEST_EMBED_CHAINS,
          {
            chainId: "cardano-preview",
            chainName: "Cardano Preview",
            features: ["cardano"],
          } as ChainInfo,
        ],
        {} as any,
        localCardano
      );
      service.init(
        {} as any,
        chainsService,
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );
      service["keyRing"] = {
        unlock: jest.fn().mockResolvedValue(undefined),
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;

      const status = await service.unlock("password");

      expect(status).toBe(KeyRingStatus.UNLOCKED);
      expect(localCardano.restoreFromKeyStore).not.toHaveBeenCalled();
    });

    it("returns UNLOCKED and detaches Cardano when selected chain is non-Cardano", async () => {
      const kv = new MemoryKVStore("test-keyring-unlock-stale");
      await kv.set("network_authority_snapshot", {
        chainId: "asi-devnet-1",
        revision: 3,
      });
      const chainsService = await createWiredTestChainsService(undefined, {
        kvStore: kv,
      });

      const localCardano = {
        reset: jest.fn(),
        restoreFromKeyStore: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(false),
        isReady: jest.fn().mockReturnValue(false),
        isKeyAgentReady: jest.fn().mockReturnValue(false),
        getRuntimeState: jest.fn().mockReturnValue("not_initialized"),
        getAttachedRuntimeInstanceId: jest.fn(),
        disposeRuntimeIfInstance: jest.fn(),
        invalidateAdvertisedReadiness: jest.fn(),
      } as any as CardanoService;

      service = new KeyRingService(
        new MemoryKVStore("test-keyring-unlock-non-cardano"),
        TEST_EMBED_CHAINS,
        {} as any,
        localCardano
      );
      service.init(
        {} as any,
        chainsService,
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );
      const resetHostRuntime = jest.fn();
      service["cardanoRuntimeSupervisor"].resetHostRuntime = resetHostRuntime;
      service["keyRing"] = {
        unlock: jest.fn().mockResolvedValue(undefined),
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;

      const status = await service.unlock("password");

      expect(status).toBe(KeyRingStatus.UNLOCKED);
      expect(await chainsService.getSelectedChain()).toBe(
        PREFERRED_DEFAULT_CHAIN_ID
      );
      expect(localCardano.restoreFromKeyStore).not.toHaveBeenCalled();
      expect(resetHostRuntime).toHaveBeenCalled();
    });
  });

  describe("changeKeyStoreFromMultiKeyStore Cardano reset guard", () => {
    it("does not reset Cardano runtime when current chain is non-Cardano", async () => {
      const { resetHostRuntime } = attachMockSupervisor(service);
      const changeKeyStoreFromMultiKeyStore = jest.fn().mockResolvedValue({
        multiKeyStoreInfo: [],
      });
      const dispatchEvent = jest.fn();
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("fetchhub-4"),
        findChainInfo: jest.fn().mockResolvedValue({ features: [] }),
      } as any;
      service["keyRing"] = {
        changeKeyStoreFromMultiKeyStore,
      } as any;
      service["interactionService"] = {
        dispatchEvent,
      } as any;

      await service.changeKeyStoreFromMultiKeyStore(1);

      expect(changeKeyStoreFromMultiKeyStore).toHaveBeenCalledWith(1);
      expect(dispatchEvent).toHaveBeenCalled();
      expect(resetHostRuntime).not.toHaveBeenCalled();
    });

    it("resets Cardano runtime when current chain is Cardano", async () => {
      const { resetHostRuntime } = attachMockSupervisor(service);
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preview"),
        findChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        changeKeyStoreFromMultiKeyStore: jest.fn().mockResolvedValue({
          multiKeyStoreInfo: [],
        }),
      } as any;
      service["interactionService"] = {
        dispatchEvent: jest.fn(),
      } as any;

      await service.changeKeyStoreFromMultiKeyStore(1);

      expect(resetHostRuntime).toHaveBeenCalled();
    });

    it("serializes overlapping wallet switches FIFO", async () => {
      attachMockSupervisor(service);

      const order: number[] = [];
      let markBStarted!: () => void;
      let releaseB!: () => void;

      const bStarted = new Promise<void>((resolve) => {
        markBStarted = resolve;
      });
      const bRelease = new Promise<void>((resolve) => {
        releaseB = resolve;
      });

      const changeKeyStoreFromMultiKeyStore = jest
        .fn()
        .mockImplementationOnce(async (index: number) => {
          order.push(index);
          markBStarted();
          await bRelease;

          return {
            multiKeyStoreInfo: [{ selected: false }, { selected: true }],
          };
        })
        .mockImplementationOnce(async (index: number) => {
          order.push(index);

          return {
            multiKeyStoreInfo: [
              { selected: false },
              { selected: false },
              { selected: true },
            ],
          };
        });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("fetchhub-4"),
        findChainInfo: jest.fn().mockResolvedValue({ features: [] }),
      } as any;
      service["keyRing"] = {
        changeKeyStoreFromMultiKeyStore,
      } as any;
      service["interactionService"] = {
        dispatchEvent: jest.fn(),
      } as any;
      jest
        .spyOn(service as any, "alignSelectedChainWithCurrentWalletIfNeeded")
        .mockResolvedValue(undefined);

      const switchB = service.changeKeyStoreFromMultiKeyStore(1);
      await bStarted;

      const switchC = service.changeKeyStoreFromMultiKeyStore(2);

      // C must not enter the underlying keyRing method while B is held.
      expect(changeKeyStoreFromMultiKeyStore).toHaveBeenCalledTimes(1);
      expect(order).toEqual([1]);

      releaseB();

      const [resultB, resultC] = await Promise.all([switchB, switchC]);

      expect(order).toEqual([1, 2]);
      expect(changeKeyStoreFromMultiKeyStore).toHaveBeenCalledTimes(2);
      expect(resultB.multiKeyStoreInfo[1]?.selected).toBe(true);
      expect(resultC.multiKeyStoreInfo[2]?.selected).toBe(true);
    });

    it("continues the switch queue after a rejected switch", async () => {
      attachMockSupervisor(service);

      const order: number[] = [];
      let markBStarted!: () => void;
      let releaseB!: () => void;

      const bStarted = new Promise<void>((resolve) => {
        markBStarted = resolve;
      });
      const bRelease = new Promise<void>((resolve) => {
        releaseB = resolve;
      });

      const changeKeyStoreFromMultiKeyStore = jest
        .fn()
        .mockImplementationOnce(async (index: number) => {
          order.push(index);
          markBStarted();
          await bRelease;
          throw new Error("switch B failed");
        })
        .mockImplementationOnce(async (index: number) => {
          order.push(index);
          return {
            multiKeyStoreInfo: [
              { selected: false },
              { selected: false },
              { selected: true },
            ],
          };
        });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("fetchhub-4"),
        findChainInfo: jest.fn().mockResolvedValue({ features: [] }),
      } as any;
      service["keyRing"] = {
        changeKeyStoreFromMultiKeyStore,
      } as any;
      service["interactionService"] = {
        dispatchEvent: jest.fn(),
      } as any;
      jest
        .spyOn(service as any, "alignSelectedChainWithCurrentWalletIfNeeded")
        .mockResolvedValue(undefined);

      const switchB = service.changeKeyStoreFromMultiKeyStore(1);
      await bStarted;
      const switchC = service.changeKeyStoreFromMultiKeyStore(2);

      expect(changeKeyStoreFromMultiKeyStore).toHaveBeenCalledTimes(1);

      releaseB();

      await expect(switchB).rejects.toThrow("switch B failed");
      const resultC = await switchC;

      expect(order).toEqual([1, 2]);
      expect(changeKeyStoreFromMultiKeyStore).toHaveBeenCalledTimes(2);
      expect(resultC.multiKeyStoreInfo[2]?.selected).toBe(true);
    });

    it("keeps C blocked until B finishes post-keyring alignment", async () => {
      attachMockSupervisor(service);

      const order: string[] = [];
      let markBAligned!: () => void;
      let releaseBAlign!: () => void;

      const bAligned = new Promise<void>((resolve) => {
        markBAligned = resolve;
      });
      const bAlignRelease = new Promise<void>((resolve) => {
        releaseBAlign = resolve;
      });

      const changeKeyStoreFromMultiKeyStore = jest
        .fn()
        .mockImplementationOnce(async (index: number) => {
          order.push(`keyring:${index}`);
          return {
            multiKeyStoreInfo: [{ selected: false }, { selected: true }],
          };
        })
        .mockImplementationOnce(async (index: number) => {
          order.push(`keyring:${index}`);
          return {
            multiKeyStoreInfo: [
              { selected: false },
              { selected: false },
              { selected: true },
            ],
          };
        });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("fetchhub-4"),
        findChainInfo: jest.fn().mockResolvedValue({ features: [] }),
      } as any;
      service["keyRing"] = {
        changeKeyStoreFromMultiKeyStore,
      } as any;
      service["interactionService"] = {
        dispatchEvent: jest.fn(),
      } as any;
      jest
        .spyOn(service as any, "alignSelectedChainWithCurrentWalletIfNeeded")
        .mockImplementationOnce(async () => {
          order.push("align:1");
          markBAligned();
          await bAlignRelease;
        })
        .mockImplementationOnce(async () => {
          order.push("align:2");
        });

      const switchB = service.changeKeyStoreFromMultiKeyStore(1);
      await bAligned;

      const switchC = service.changeKeyStoreFromMultiKeyStore(2);

      expect(changeKeyStoreFromMultiKeyStore).toHaveBeenCalledTimes(1);
      expect(order).toEqual(["keyring:1", "align:1"]);

      releaseBAlign();

      await Promise.all([switchB, switchC]);

      expect(order).toEqual(["keyring:1", "align:1", "keyring:2", "align:2"]);
      expect(changeKeyStoreFromMultiKeyStore).toHaveBeenCalledTimes(2);
    });
  });

  describe("Cardano runtime ensure via supervisor", () => {
    it("transaction ensure delegates to supervisor with committed revision", async () => {
      const { ensureReady } = attachMockSupervisor(service);
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preview"),
        getSelectedChainSnapshot: jest
          .fn()
          .mockResolvedValue({ chainId: "cardano-preview", revision: 4 }),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;
      service["cardanoService"] = {
        isReadyForChain: jest.fn().mockReturnValue(true),
        isReady: jest.fn().mockReturnValue(true),
        getRuntimeState: jest.fn().mockReturnValue("ready"),
      } as any;

      await expect(
        service.ensureCardanoServiceReady("cardano-preview")
      ).resolves.toBeUndefined();
      expect(ensureReady).toHaveBeenCalledWith("cardano-preview", 4);
    });

    it("concurrent key + transaction: key path skips supervisor ensure", async () => {
      const { ensureReady } = attachMockSupervisor(service);
      const keyStore = {
        type: "mnemonic",
        meta: { mnemonicLength: "24" },
      };
      const getCardanoKeyForKeyStore = jest.fn().mockResolvedValue({
        algo: "cardano_address_only",
        pubKey: new Uint8Array(),
        address: Buffer.from("addr_test1_offline"),
        isNanoLedger: false,
        isKeystone: false,
      });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preview"),
        getSelectedChainSnapshot: jest
          .fn()
          .mockResolvedValue({ chainId: "cardano-preview", revision: 1 }),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
        getCommittedRevision: jest.fn().mockReturnValue(1),
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-preview"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue(keyStore),
        getCardanoKeyForKeyStore,
      } as any;
      service["cardanoService"] = {
        restoreFromKeyStore: jest.fn(),
        isReadyForChain: jest.fn().mockReturnValue(true),
        isReady: jest.fn().mockReturnValue(true),
        getRuntimeState: jest.fn().mockReturnValue("ready"),
      } as any;

      await expect(service.getKey("cardano-preview")).resolves.toBeDefined();
      await expect(
        service.ensureCardanoServiceReady("cardano-preview")
      ).resolves.toBeUndefined();

      expect(getCardanoKeyForKeyStore).toHaveBeenCalledWith(
        "cardano-preview",
        keyStore
      );
      expect(ensureReady).toHaveBeenCalledTimes(1);
      expect(
        service["cardanoService"].restoreFromKeyStore
      ).not.toHaveBeenCalled();
    });
  });
});
