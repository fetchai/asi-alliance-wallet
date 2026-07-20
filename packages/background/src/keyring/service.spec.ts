import { KeyRingService } from "./service";
import { KeyRingStatus } from "./keyring";
import { MemoryKVStore } from "@keplr-wallet/common";
import type { CardanoService } from "../cardano/service";
import { StaleCardanoRuntimeError } from "../cardano/ensure-errors";
import { ChainInfo } from "@keplr-wallet/types";
import { PREFERRED_DEFAULT_CHAIN_ID } from "../chains/default-chain";
import {
  createTestChainsService,
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
      const reset = jest.fn();
      const ensure = jest.fn().mockResolvedValue(undefined);
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["chainsService"] = {
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = { reset } as any;
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-preprod",
        promise: Promise.resolve(),
      };
      service["ensureCardanoServiceReady"] = ensure;

      await service.reinitializeCardanoService("cardano-preprod");

      expect(reset).toHaveBeenCalled();
      expect((service as any)["cardanoNetworkRuntimeInFlight"]).toBeNull();
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
      service["keyRing"] = {
        get status() {
          return status;
        },
        lock: mockLock,
      } as any;
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-mainnet",
        promise: Promise.resolve(),
      };

      const result = service.lock();

      expect(mockLock).toHaveBeenCalled();
      expect((mockCardanoService as any).reset).toHaveBeenCalled();
      expect((service as any)["cardanoNetworkRuntimeInFlight"]).toBeNull();
      expect(result).toBe(KeyRingStatus.LOCKED);
    });
  });

  describe("ensureCardanoServiceReady contract", () => {
    it("throws when restore attempt completes but service is still not ready", async () => {
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
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(true),
        isReady: jest.fn().mockReturnValue(false),
        isKeyAgentReady: jest.fn().mockReturnValue(false),
        restoreFromKeyStore: jest.fn().mockResolvedValue(undefined),
        getRuntimeState: jest.fn().mockReturnValue("ok"),
      } as any;

      await expect(
        service.ensureCardanoServiceReady("cardano-mainnet")
      ).rejects.toThrow("temporarily_unavailable: wallet_not_ready");
    });

    it("throws on existing NetworkRuntime in-flight join when service remains not ready", async () => {
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(true),
        isReady: jest.fn().mockReturnValue(false),
        isKeyAgentReady: jest.fn().mockReturnValue(false),
        getRuntimeState: jest.fn().mockReturnValue("ok"),
      } as any;
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-mainnet",
        promise: Promise.resolve(),
      };

      await expect(
        service.ensureCardanoServiceReady("cardano-mainnet")
      ).rejects.toThrow("temporarily_unavailable: wallet_not_ready");
    });

    it("getKey uses offline KeyContext without NetworkRuntime ensure", async () => {
      const mockDerive = jest.fn().mockResolvedValue({
        algo: "cardano_address_only",
        pubKey: new Uint8Array(),
        address: Buffer.from("addr_test1qq"),
        isNanoLedger: false,
        isKeystone: false,
      });
      const restoreFromKeyStore = jest.fn();
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;
      service["chainsService"] = {
        // Selected can be non-Cardano — offline getKey must still succeed.
        getSelectedChain: jest.fn().mockResolvedValue("cosmoshub-4"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(false),
        isReady: jest.fn().mockReturnValue(false),
        isKeyAgentReady: jest.fn().mockReturnValue(false),
        restoreFromKeyStore,
        deriveKeyFromKeyStore: mockDerive,
        getKey: jest.fn(),
      } as any;

      await expect(service.getKey("cardano-preprod")).resolves.toEqual({
        algo: "cardano_address_only",
        pubKey: new Uint8Array(),
        address: Buffer.from("addr_test1qq"),
        isNanoLedger: false,
        isKeystone: false,
      });
      expect(mockDerive).toHaveBeenCalledWith(
        expect.anything(),
        "pw",
        expect.anything(),
        "cardano-preprod"
      );
      expect(restoreFromKeyStore).not.toHaveBeenCalled();
      expect(service["cardanoService"].getKey).not.toHaveBeenCalled();
    });

    it("ensure(mode:key) does not create NetworkRuntime", async () => {
      const restoreFromKeyStore = jest.fn();
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
      expect(service["cardanoNetworkRuntimeInFlight"]).toBeNull();
    });

    it("rejects stale Cardano ensure when selected chain is non-Cardano", async () => {
      const restoreFromKeyStore = jest.fn();
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

    it("does not restore Cardano when selected chain changes before restore", async () => {
      const restoreFromKeyStore = jest.fn();
      const getSelectedChain = jest
        .fn()
        .mockResolvedValueOnce("cardano-preview")
        .mockResolvedValue("cosmoshub-4");
      service["chainsService"] = {
        getSelectedChain,
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

  describe("network switch rollback degradation paths", () => {
    it("enters Cardano without NetworkRuntime ensure (lazy key context / tx ensure)", async () => {
      const mockGetChainInfo = jest.fn().mockImplementation((chainId: string) =>
        Promise.resolve({
          features: chainId.startsWith("cardano") ? ["cardano"] : [],
        })
      );
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-new"),
        getChainInfo: mockGetChainInfo,
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["cardanoService"] = {
        reset: jest.fn(),
        isInitialized: jest.fn().mockReturnValue(false),
        getBoundChainId: jest.fn().mockReturnValue(undefined),
        getAttachedRuntimeInstanceId: jest.fn(),
        disposeRuntimeIfInstance: jest.fn(),
      } as any;
      const ensure = jest.fn().mockResolvedValue(undefined);
      service["ensureCardanoServiceReady"] = ensure;
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      await expect(
        service["onNetworkSwitch"]("fetchhub-4", "cardano-new")
      ).resolves.toBeUndefined();

      expect(ensure).not.toHaveBeenCalled();
      expect((service["cardanoService"] as any).reset).not.toHaveBeenCalled();
      expect(service["runAddressCacheRepairBestEffort"]).toHaveBeenCalledWith(
        "cardano-new"
      );
    });

    it("Cardano→Cardano detaches prior runtime without creating a new one", async () => {
      const leaveSpy = jest.spyOn(service as any, "leaveCardanoRuntime");
      service["cardanoRuntimeGeneration"] = 5;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      const disposeRuntimeIfInstance = jest.fn().mockReturnValue(true);
      service["cardanoService"] = {
        reset: jest.fn(),
        isInitialized: jest.fn().mockReturnValue(true),
        isReady: jest.fn().mockReturnValue(true),
        getBoundChainId: jest.fn().mockReturnValue("cardano-preprod"),
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue("rt_preprod"),
        disposeRuntimeIfInstance,
      } as any;
      const ensure = jest.fn();
      service["ensureCardanoServiceReady"] = ensure;
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      await expect(
        service["onNetworkSwitch"]("cardano-preprod", "cardano-mainnet")
      ).resolves.toBeUndefined();

      expect(ensure).not.toHaveBeenCalled();
      expect(leaveSpy).toHaveBeenCalledWith({
        instanceId: "rt_preprod",
        runtimeGeneration: 5,
      });
      leaveSpy.mockRestore();
    });

    it("after Cardano→Cardano, transaction ensure restores for the new chain", async () => {
      let bound: string | undefined = "cardano-preprod";
      let ready = true;
      const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
        bound = "cardano-mainnet";
        ready = true;
      });
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
        getSwitchGeneration: jest.fn().mockReturnValue(1),
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-mainnet"),
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
        reset: jest.fn(),
        restoreFromKeyStore,
        isInitialized: jest.fn().mockImplementation(() => ready),
        isReady: jest.fn().mockImplementation(() => ready),
        isReadyForChain: jest
          .fn()
          .mockImplementation((id: string) => ready && bound === id),
        getBoundChainId: jest.fn().mockImplementation(() => bound),
        getRuntimeState: jest.fn().mockReturnValue("ready"),
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue("rt_old"),
        disposeRuntimeIfInstance: jest.fn().mockImplementation(() => {
          ready = false;
          bound = undefined;
          return true;
        }),
      } as any;
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      await service["onNetworkSwitch"]("cardano-preprod", "cardano-mainnet");
      expect(restoreFromKeyStore).not.toHaveBeenCalled();

      await service.ensureCardanoServiceReady("cardano-mainnet");
      expect(restoreFromKeyStore).toHaveBeenCalledTimes(1);
      expect(restoreFromKeyStore).toHaveBeenCalledWith(
        expect.anything(),
        "pw",
        expect.anything(),
        "cardano-mainnet",
        expect.anything()
      );
    });

    it("stale handler that paused before stillCurrent does not dispose winner runtime B", async () => {
      service["cardanoRuntimeGeneration"] = 5;
      let attachedId: string | undefined = "rt_A";
      const disposeRuntimeIfInstance = jest.fn((id: string | undefined) => {
        if (id != null && id === attachedId) {
          attachedId = undefined;
          return true;
        }
        return false;
      });

      let releaseGetChainInfo: (() => void) | undefined;
      const getChainInfoGate = new Promise<void>((resolve) => {
        releaseGetChainInfo = resolve;
      });

      service["chainsService"] = {
        getSelectedChain: jest
          .fn()
          // Handler A first check while still winning
          .mockResolvedValueOnce("cardano-mainnet")
          // Handler A stillCurrent — B already won
          .mockResolvedValueOnce("cardano-preprod"),
        getChainInfo: jest.fn().mockImplementation(async () => {
          await getChainInfoGate;
          return { features: ["cardano"] };
        }),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["cardanoService"] = {
        reset: jest.fn(),
        isInitialized: jest.fn().mockReturnValue(true),
        getBoundChainId: jest.fn().mockReturnValue("cardano-preprod"),
        getAttachedRuntimeInstanceId: jest
          .fn()
          .mockImplementation(() => attachedId),
        disposeRuntimeIfInstance,
      } as any;
      service["runAddressCacheRepairBestEffort"] = jest.fn();

      const handlerA = service["onNetworkSwitch"](
        "cardano-preprod",
        "cardano-mainnet"
      );
      await new Promise((resolve) => setImmediate(resolve));

      // B wins and attaches a newer runtime while A is suspended in getChainInfo.
      attachedId = "rt_B";
      service["cardanoRuntimeGeneration"] = 6;

      releaseGetChainInfo?.();
      await expect(handlerA).resolves.toBeUndefined();

      // Stale A may only dispose the instance captured at start (rt_A), never rt_B.
      expect(disposeRuntimeIfInstance).toHaveBeenCalledWith("rt_A");
      expect(disposeRuntimeIfInstance).not.toHaveBeenCalledWith("rt_B");
      expect(attachedId).toBe("rt_B");
    });

    it("same-target mid-init in-flight is not treated as wrong-network by switch", async () => {
      let createCalls = 0;
      let releaseCreate: (() => void) | undefined;
      let ready = false;
      let bound: string | undefined;
      let initialized = false;

      const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
        createCalls += 1;
        initialized = true;
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        bound = "cardano-mainnet";
        ready = true;
      });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
        getSwitchGeneration: jest.fn().mockReturnValue(1),
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-mainnet"),
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
        reset: jest.fn(),
        restoreFromKeyStore,
        isInitialized: jest.fn().mockImplementation(() => initialized),
        isReady: jest.fn().mockImplementation(() => ready),
        isReadyForChain: jest
          .fn()
          .mockImplementation((id: string) => ready && bound === id),
        getBoundChainId: jest.fn().mockImplementation(() => bound),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() => (ready ? "ready" : "not_initialized")),
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue(undefined),
        disposeRuntimeIfInstance: jest.fn().mockReturnValue(false),
      } as any;
      const leaveSpy = jest.spyOn(service as any, "leaveCardanoRuntime");
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      const ensurePromise =
        service.ensureCardanoServiceReady("cardano-mainnet");
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);
      expect(initialized).toBe(true);
      expect(bound).toBeUndefined();
      expect(service["cardanoNetworkRuntimeInFlight"]?.chainId).toBe(
        "cardano-mainnet"
      );

      // Switch to same target while mid-init: must not leave / bump generation.
      await service["onNetworkSwitch"]("fetchhub-4", "cardano-mainnet");
      expect(leaveSpy).not.toHaveBeenCalled();
      expect(createCalls).toBe(1);

      releaseCreate?.();
      await ensurePromise;
      expect(createCalls).toBe(1);
      expect(restoreFromKeyStore).toHaveBeenCalledTimes(1);
      leaveSpy.mockRestore();
    });

    it("target ensure started after switch snapshot is not wiped by cleanup", async () => {
      service["cardanoRuntimeGeneration"] = 5;
      let createCalls = 0;
      let releaseCreate: (() => void) | undefined;
      let releaseGetChainInfo: (() => void) | undefined;
      let ready = true;
      let bound: string | undefined = "cardano-preprod";
      let attachedId: string | undefined = "rt_preprod";
      let initialized = true;
      // Only the switch handler's getChainInfo waits — ensure must proceed.
      let pauseNextGetChainInfo = true;

      const getChainInfoGate = new Promise<void>((resolve) => {
        releaseGetChainInfo = resolve;
      });

      const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
        createCalls += 1;
        initialized = true;
        // Real CardanoKeyRing keeps previous manager attached until new attach.
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        bound = "cardano-mainnet";
        attachedId = "rt_mainnet";
        ready = true;
      });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
        getChainInfo: jest.fn().mockImplementation(async () => {
          if (pauseNextGetChainInfo) {
            pauseNextGetChainInfo = false;
            await getChainInfoGate;
          }
          return { features: ["cardano"] };
        }),
        getSwitchGeneration: jest.fn().mockReturnValue(2),
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-mainnet"),
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
        reset: jest.fn(),
        restoreFromKeyStore,
        isInitialized: jest.fn().mockImplementation(() => initialized),
        isReady: jest.fn().mockImplementation(() => ready && bound != null),
        isReadyForChain: jest
          .fn()
          .mockImplementation((id: string) => ready && bound === id),
        getBoundChainId: jest.fn().mockImplementation(() => bound),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() =>
            ready && bound != null ? "ready" : "not_initialized"
          ),
        getAttachedRuntimeInstanceId: jest
          .fn()
          .mockImplementation(() => attachedId),
        disposeRuntimeIfInstance: jest.fn((id: string | undefined) => {
          if (id != null && id === attachedId) {
            attachedId = undefined;
            bound = undefined;
            return true;
          }
          return false;
        }),
      } as any;
      const leaveSpy = jest.spyOn(service as any, "leaveCardanoRuntime");
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      // Handler snapshots preprod, then suspends in getChainInfo.
      const switchPromise = service["onNetworkSwitch"](
        "cardano-preprod",
        "cardano-mainnet"
      );
      await new Promise((resolve) => setImmediate(resolve));

      // Target ensure starts AFTER snapshot while handler is paused.
      const ensurePromise =
        service.ensureCardanoServiceReady("cardano-mainnet");
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);
      expect(service["cardanoNetworkRuntimeInFlight"]?.chainId).toBe(
        "cardano-mainnet"
      );
      expect(attachedId).toBe("rt_preprod");

      releaseGetChainInfo?.();
      await switchPromise;

      // Must not leave immediately — that would stale the in-flight ensure.
      expect(leaveSpy).not.toHaveBeenCalled();
      expect(service["cardanoRuntimeGeneration"]).toBe(5);
      expect(createCalls).toBe(1);

      releaseCreate?.();
      await ensurePromise;
      // Success settle: newer instance attached — no forced leave.
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);
      expect(bound).toBe("cardano-mainnet");
      expect(attachedId).toBe("rt_mainnet");
      expect(service["cardanoRuntimeGeneration"]).toBe(5);
      leaveSpy.mockRestore();
    });

    it("settle disposes ensure winner bound to a deselected Cardano chain", async () => {
      service["cardanoRuntimeGeneration"] = 5;
      let createCalls = 0;
      let releaseCreate: (() => void) | undefined;
      let releaseGetChainInfo: (() => void) | undefined;
      let ready = true;
      let bound: string | undefined = "cardano-preprod";
      let attachedId: string | undefined = "rt_A";
      let initialized = true;
      let selected = "cardano-preview";
      let pauseNextGetChainInfo = true;

      const getChainInfoGate = new Promise<void>((resolve) => {
        releaseGetChainInfo = resolve;
      });

      const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
        createCalls += 1;
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        // Ensure(C=preview) attaches successfully after selected already moved to B.
        bound = "cardano-preview";
        attachedId = "rt_C";
        ready = true;
      });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockImplementation(async () => selected),
        getChainInfo: jest.fn().mockImplementation(async () => {
          if (pauseNextGetChainInfo) {
            pauseNextGetChainInfo = false;
            await getChainInfoGate;
          }
          return { features: ["cardano"] };
        }),
        getSwitchGeneration: jest.fn().mockReturnValue(2),
        peekSelectedChainId: jest.fn().mockImplementation(() => selected),
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
        reset: jest.fn(() => {
          attachedId = undefined;
          bound = undefined;
          initialized = false;
          ready = false;
        }),
        restoreFromKeyStore,
        isInitialized: jest.fn().mockImplementation(() => initialized),
        isReady: jest.fn().mockImplementation(() => ready && bound != null),
        isReadyForChain: jest
          .fn()
          .mockImplementation((id: string) => ready && bound === id),
        getBoundChainId: jest.fn().mockImplementation(() => bound),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() =>
            ready && bound != null ? "ready" : "not_initialized"
          ),
        getAttachedRuntimeInstanceId: jest
          .fn()
          .mockImplementation(() => attachedId),
        disposeRuntimeIfInstance: jest.fn((id: string | undefined) => {
          if (id != null && id === attachedId) {
            attachedId = undefined;
            bound = undefined;
            initialized = false;
            ready = false;
            return true;
          }
          return false;
        }),
      } as any;
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      const switchPromise = service["onNetworkSwitch"](
        "cardano-preprod",
        "cardano-preview"
      );
      await new Promise((resolve) => setImmediate(resolve));

      const ensurePromise =
        service.ensureCardanoServiceReady("cardano-preview");
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);

      // Complete switch while selected is still the ensure target (settles later).
      releaseGetChainInfo?.();
      await switchPromise;

      // Selected moves to B before ensure(C) attaches.
      selected = "cardano-mainnet";
      releaseCreate?.();
      await ensurePromise;
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      // C must not remain attached under selected B.
      expect(createCalls).toBe(1);
      expect(attachedId).toBeUndefined();
      expect(bound).toBeUndefined();
      expect(selected).toBe("cardano-mainnet");
    });

    it("failed target ensure after switch snapshot detaches leftover wrong-network runtime", async () => {
      service["cardanoRuntimeGeneration"] = 5;
      let createCalls = 0;
      let releaseCreate: (() => void) | undefined;
      let releaseGetChainInfo: (() => void) | undefined;
      let ready = true;
      let bound: string | undefined = "cardano-preprod";
      let attachedId: string | undefined = "rt_preprod";
      let initialized = true;
      let pauseNextGetChainInfo = true;

      const getChainInfoGate = new Promise<void>((resolve) => {
        releaseGetChainInfo = resolve;
      });

      const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
        createCalls += 1;
        // Keep A attached through the failed create (real KeyRing behavior).
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        throw new Error("cardano_wallet_manager_create_failed");
      });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
        getChainInfo: jest.fn().mockImplementation(async () => {
          if (pauseNextGetChainInfo) {
            pauseNextGetChainInfo = false;
            await getChainInfoGate;
          }
          return { features: ["cardano"] };
        }),
        getSwitchGeneration: jest.fn().mockReturnValue(2),
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-mainnet"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;
      const reset = jest.fn(() => {
        attachedId = undefined;
        bound = undefined;
        initialized = false;
        ready = false;
      });
      service["cardanoService"] = {
        reset,
        restoreFromKeyStore,
        isInitialized: jest.fn().mockImplementation(() => initialized),
        isReady: jest.fn().mockImplementation(() => ready && bound != null),
        isReadyForChain: jest
          .fn()
          .mockImplementation((id: string) => ready && bound === id),
        getBoundChainId: jest.fn().mockImplementation(() => bound),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() =>
            ready && bound != null ? "ready" : "not_initialized"
          ),
        getAttachedRuntimeInstanceId: jest
          .fn()
          .mockImplementation(() => attachedId),
        disposeRuntimeIfInstance: jest.fn((id: string | undefined) => {
          if (id != null && id === attachedId) {
            reset();
            return true;
          }
          return false;
        }),
      } as any;
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      const switchPromise = service["onNetworkSwitch"](
        "cardano-preprod",
        "cardano-mainnet"
      );
      await new Promise((resolve) => setImmediate(resolve));

      const ensurePromise =
        service.ensureCardanoServiceReady("cardano-mainnet");
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);

      releaseGetChainInfo?.();
      await switchPromise;
      expect(attachedId).toBe("rt_preprod");
      expect(service["cardanoRuntimeGeneration"]).toBe(5);

      releaseCreate?.();
      await expect(ensurePromise).rejects.toThrow(
        "cardano_wallet_manager_create_failed"
      );
      // Settlement after failed ensure must detach leftover A.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(createCalls).toBe(1);
      expect(attachedId).toBeUndefined();
      expect(bound).toBeUndefined();
      expect(service["cardanoRuntimeGeneration"]).toBe(6);
    });

    it("leaveCardanoRuntime does not bump generation when a different instance is attached", () => {
      const reset = jest.fn();
      const disposeRuntimeIfInstance = jest.fn().mockReturnValue(false);
      service["cardanoRuntimeGeneration"] = 5;
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-mainnet",
        promise: Promise.resolve(),
      };
      service["cardanoService"] = {
        reset,
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue("rt_new"),
        disposeRuntimeIfInstance,
        isInitialized: jest.fn().mockReturnValue(true),
      } as any;

      service["leaveCardanoRuntime"]({
        instanceId: "rt_old",
        runtimeGeneration: 5,
      });

      expect(disposeRuntimeIfInstance).toHaveBeenCalledWith("rt_old");
      expect(service["cardanoRuntimeGeneration"]).toBe(5);
      expect(service["cardanoNetworkRuntimeInFlight"]).not.toBeNull();
      expect(reset).not.toHaveBeenCalled();
    });

    it("leaveCardanoRuntime defers when captured instance was cleared mid-ensure", async () => {
      const reset = jest.fn();
      const disposeRuntimeIfInstance = jest.fn().mockReturnValue(false);
      service["cardanoRuntimeGeneration"] = 5;
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-mainnet",
        promise: Promise.resolve(),
      };
      service["chainsService"] = {
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-mainnet"),
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
      } as any;
      service["cardanoService"] = {
        reset,
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue(undefined),
        getBoundChainId: jest.fn().mockReturnValue(undefined),
        disposeRuntimeIfInstance,
        isInitialized: jest.fn().mockReturnValue(true),
      } as any;

      service["leaveCardanoRuntime"]({
        instanceId: "rt_preprod",
        runtimeGeneration: 5,
      });

      // Immediate wipe skipped — settle runs after in-flight.
      expect(disposeRuntimeIfInstance).not.toHaveBeenCalled();
      expect(service["cardanoRuntimeGeneration"]).toBe(5);
      expect(service["cardanoNetworkRuntimeInFlight"]).not.toBeNull();
      expect(reset).not.toHaveBeenCalled();

      await new Promise((resolve) => setImmediate(resolve));
      // Captured id already gone → settle is a no-op.
      expect(disposeRuntimeIfInstance).not.toHaveBeenCalled();
      expect(service["cardanoRuntimeGeneration"]).toBe(5);
      expect(reset).not.toHaveBeenCalled();
    });

    it("stale dispose during mid-create does not invalidate newer candidate", async () => {
      service["cardanoRuntimeGeneration"] = 5;
      let createCalls = 0;
      let releaseCreate: (() => void) | undefined;
      let ready = true;
      let bound: string | undefined = "cardano-preprod";
      let attachedId: string | undefined = "rt_A";
      let initialized = true;
      let rebuildInFlight = false;
      const invalidatePendingRebuilds = jest.fn();

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-mainnet"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
        getSwitchGeneration: jest.fn().mockReturnValue(2),
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-mainnet"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;

      const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
        createCalls += 1;
        rebuildInFlight = true;
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        rebuildInFlight = false;
        attachedId = "rt_B";
        bound = "cardano-mainnet";
        ready = true;
      });

      const reset = jest.fn(() => {
        invalidatePendingRebuilds();
        attachedId = undefined;
        bound = undefined;
        initialized = false;
      });

      service["cardanoService"] = {
        reset,
        restoreFromKeyStore,
        isInitialized: jest.fn().mockImplementation(() => initialized),
        isReady: jest.fn().mockImplementation(() => ready && bound != null),
        isReadyForChain: jest
          .fn()
          .mockImplementation((id: string) => ready && bound === id),
        getBoundChainId: jest.fn().mockImplementation(() => bound),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() =>
            ready && bound != null ? "ready" : "not_initialized"
          ),
        getAttachedRuntimeInstanceId: jest
          .fn()
          .mockImplementation(() => attachedId),
        disposeRuntimeIfInstance: jest.fn((id: string | undefined) => {
          if (id == null || id !== attachedId) {
            return false;
          }
          if (rebuildInFlight) {
            attachedId = undefined;
            bound = undefined;
            return true;
          }
          reset();
          return true;
        }),
      } as any;
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      const ensurePromise =
        service.ensureCardanoServiceReady("cardano-mainnet");
      await new Promise((resolve) => setImmediate(resolve));
      expect(createCalls).toBe(1);
      expect(rebuildInFlight).toBe(true);
      expect(attachedId).toBe("rt_A");

      // Stale abandoned switch target: selected already mainnet ≠ preprod.
      await service["onNetworkSwitch"]("cardano-preprod", "cardano-preprod");
      expect(invalidatePendingRebuilds).not.toHaveBeenCalled();

      releaseCreate?.();
      await ensurePromise;
      await new Promise((resolve) => setImmediate(resolve));

      expect(createCalls).toBe(1);
      expect(attachedId).toBe("rt_B");
      expect(bound).toBe("cardano-mainnet");
      expect(invalidatePendingRebuilds).not.toHaveBeenCalled();
    });

    it("does not fail switch when only post-commit cache repair fails", async () => {
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-new"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["ensureCardanoServiceReady"] = jest
        .fn()
        .mockResolvedValue(undefined);
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockRejectedValue(new Error("cache_repair_failed"));
      service["cardanoService"] = {
        reset: jest.fn(),
        isInitialized: jest.fn().mockReturnValue(false),
        getBoundChainId: jest.fn().mockReturnValue(undefined),
        getAttachedRuntimeInstanceId: jest.fn(),
        disposeRuntimeIfInstance: jest.fn(),
      } as any;

      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).resolves.toBeUndefined();
      expect((service["cardanoService"] as any).reset).not.toHaveBeenCalled();
    });

    it("skips post-commit cache repair for stale chain after rapid switch", async () => {
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-newer"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      const ensureReady = jest.fn().mockResolvedValue(undefined);
      service["ensureCardanoServiceReady"] = ensureReady;
      const repair = jest.spyOn(service as any, "ensureAndRepairAddressCaches");
      service["runAddressCacheRepairBestEffort"] = (
        service as any
      ).runAddressCacheRepairBestEffort.bind(service);
      service["cardanoService"] = {
        reset: jest.fn(),
        isInitialized: jest.fn().mockReturnValue(false),
        getBoundChainId: jest.fn().mockReturnValue(undefined),
        getAttachedRuntimeInstanceId: jest.fn(),
        disposeRuntimeIfInstance: jest.fn(),
      } as any;

      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).resolves.toBeUndefined();

      expect(ensureReady).not.toHaveBeenCalled();
      expect(repair).not.toHaveBeenCalled();
    });

    it("retries enter Cardano after prior leave without requiring NetworkRuntime ensure", async () => {
      const getSelectedChain = jest.fn().mockResolvedValue("cardano-new");
      service["chainsService"] = {
        getSelectedChain,
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["cardanoService"] = {
        reset: jest.fn(),
        isInitialized: jest.fn().mockReturnValue(false),
        getBoundChainId: jest.fn().mockReturnValue(undefined),
        getAttachedRuntimeInstanceId: jest.fn(),
        disposeRuntimeIfInstance: jest.fn(),
      } as any;

      const ensure = jest.fn();
      service["ensureCardanoServiceReady"] = ensure;
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).resolves.toBeUndefined();
      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).resolves.toBeUndefined();
      expect(ensure).not.toHaveBeenCalled();
    });
  });

  describe("onNetworkSwitch non-Cardano detach", () => {
    it("detaches Cardano runtime when switching to a non-Cardano chain", async () => {
      const disposeRuntimeIfInstance = jest.fn().mockReturnValue(true);
      const reset = jest.fn();
      const ensure = jest.fn();
      service["cardanoRuntimeGeneration"] = 3;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("fetchhub-4"),
        getChainInfo: jest.fn().mockResolvedValue({ features: [] }),
        peekSelectedChainId: jest.fn().mockReturnValue("fetchhub-4"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["cardanoService"] = {
        reset,
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue("rt_leave"),
        disposeRuntimeIfInstance,
        isInitialized: jest.fn().mockReturnValue(false),
      } as any;
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-preview",
        promise: Promise.resolve(),
      };
      service["ensureCardanoServiceReady"] = ensure;
      const repair = jest.fn().mockResolvedValue(undefined);
      service["runAddressCacheRepairBestEffort"] = repair;

      await expect(
        service["onNetworkSwitch"]("cardano-preview", "fetchhub-4")
      ).resolves.toBeUndefined();

      // Confirmed non-Cardano leave hard-resets (invalidates mid-create candidates).
      expect(reset).toHaveBeenCalled();
      expect(disposeRuntimeIfInstance).not.toHaveBeenCalled();
      expect((service as any)["cardanoNetworkRuntimeInFlight"]).toBeNull();
      expect((service as any)["cardanoRuntimeGeneration"]).toBe(4);
      expect(ensure).not.toHaveBeenCalled();
      expect(repair).not.toHaveBeenCalled();
    });

    it("confirmed leave without attached manager uses ownership-aware reset", async () => {
      const disposeRuntimeIfInstance = jest.fn();
      const reset = jest.fn();
      service["cardanoRuntimeGeneration"] = 1;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("fetchhub-4"),
        getChainInfo: jest.fn().mockResolvedValue({ features: [] }),
        peekSelectedChainId: jest.fn().mockReturnValue("fetchhub-4"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["cardanoService"] = {
        reset,
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue(undefined),
        disposeRuntimeIfInstance,
        isInitialized: jest.fn().mockReturnValue(true),
      } as any;

      await expect(
        service["onNetworkSwitch"]("cardano-preview", "fetchhub-4")
      ).resolves.toBeUndefined();

      expect(disposeRuntimeIfInstance).not.toHaveBeenCalled();
      expect(reset).toHaveBeenCalled();
      expect((service as any)["cardanoRuntimeGeneration"]).toBe(2);
    });

    it("confirmed non-Cardano leave hard-resets when B already attached", async () => {
      const reset = jest.fn();
      const disposeRuntimeIfInstance = jest.fn();
      service["cardanoRuntimeGeneration"] = 3;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("fetchhub-4"),
        getChainInfo: jest.fn().mockResolvedValue({ features: [] }),
        peekSelectedChainId: jest.fn().mockReturnValue("fetchhub-4"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      // Capture A, but B attaches before leave runs (same generation).
      service["cardanoService"] = {
        reset,
        getAttachedRuntimeInstanceId: jest
          .fn()
          .mockReturnValueOnce("rt_A") // capture
          .mockReturnValue("rt_B"),
        disposeRuntimeIfInstance,
        isInitialized: jest.fn().mockReturnValue(true),
        getBoundChainId: jest.fn().mockReturnValue("cardano-mainnet"),
      } as any;

      await expect(
        service["onNetworkSwitch"]("cardano-preprod", "fetchhub-4")
      ).resolves.toBeUndefined();

      expect(reset).toHaveBeenCalled();
      expect((service as any)["cardanoRuntimeGeneration"]).toBe(4);
      expect(disposeRuntimeIfInstance).not.toHaveBeenCalled();
    });

    it("confirmed non-Cardano leave hard-resets mid-create candidate via invalidate", async () => {
      const reset = jest.fn();
      service["cardanoRuntimeGeneration"] = 3;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("fetchhub-4"),
        getChainInfo: jest.fn().mockResolvedValue({ features: [] }),
        peekSelectedChainId: jest.fn().mockReturnValue("fetchhub-4"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["cardanoService"] = {
        reset,
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue("rt_A"),
        disposeRuntimeIfInstance: jest.fn(),
        isInitialized: jest.fn().mockReturnValue(true),
        getBoundChainId: jest.fn().mockReturnValue("cardano-preprod"),
      } as any;
      // Mid-create ensure is in-flight; hard leave must clear it (soft-detach alone is insufficient).
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-mainnet",
        promise: new Promise(() => {
          /* never settles in this test */
        }),
      };

      await expect(
        service["onNetworkSwitch"]("cardano-preprod", "fetchhub-4")
      ).resolves.toBeUndefined();

      expect(reset).toHaveBeenCalled();
      expect((service as any)["cardanoNetworkRuntimeInFlight"]).toBeNull();
      expect((service as any)["cardanoRuntimeGeneration"]).toBe(4);
    });

    it("stale leave does not reset mid-init newer runtime when captured id is gone", async () => {
      const disposeRuntimeIfInstance = jest.fn().mockReturnValue(false);
      const reset = jest.fn();
      const getSelectedChain = jest
        .fn()
        .mockResolvedValueOnce("fetchhub-4")
        .mockResolvedValueOnce("cardano-preview")
        .mockResolvedValue("cardano-preview");
      service["cardanoRuntimeGeneration"] = 5;
      service["chainsService"] = {
        getSelectedChain,
        getChainInfo: jest.fn().mockResolvedValue({ features: [] }),
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-preview"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["cardanoService"] = {
        reset,
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue("rt_old"),
        disposeRuntimeIfInstance,
        isInitialized: jest.fn().mockReturnValue(true),
      } as any;
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-preview",
        promise: Promise.resolve(),
      };
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      await expect(
        service["onNetworkSwitch"]("cardano-preview", "fetchhub-4")
      ).resolves.toBeUndefined();

      // stillCurrent abort defers exact dispose until in-flight settles.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(disposeRuntimeIfInstance).toHaveBeenCalledWith("rt_old");
      expect(reset).not.toHaveBeenCalled();
      expect((service as any)["cardanoNetworkRuntimeInFlight"]).not.toBeNull();
      expect((service as any)["cardanoRuntimeGeneration"]).toBe(5);
    });

    it("leave with stale captured generation does not reset mid-init newer runtime", async () => {
      const disposeRuntimeIfInstance = jest.fn().mockReturnValue(false);
      const reset = jest.fn();
      let selectedChainCalls = 0;
      service["cardanoRuntimeGeneration"] = 5;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockImplementation(async () => {
          selectedChainCalls += 1;
          // After capture, reinitialize bumps generation and publishes mid-init keyRing.
          if (selectedChainCalls >= 2) {
            service["cardanoRuntimeGeneration"] = 6;
            (service["cardanoService"] as any).isInitialized = jest
              .fn()
              .mockReturnValue(true);
            (service["cardanoService"] as any).getAttachedRuntimeInstanceId =
              jest.fn().mockReturnValue(undefined);
          }
          return "fetchhub-4";
        }),
        getChainInfo: jest.fn().mockResolvedValue({ features: [] }),
        peekSelectedChainId: jest.fn().mockReturnValue("fetchhub-4"),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
      } as any;
      service["cardanoService"] = {
        reset,
        getAttachedRuntimeInstanceId: jest.fn().mockReturnValue("rt_old"),
        disposeRuntimeIfInstance,
        isInitialized: jest.fn().mockReturnValue(true),
      } as any;
      service["cardanoNetworkRuntimeInFlight"] = {
        chainId: "cardano-preview",
        promise: Promise.resolve(),
      };

      await expect(
        service["onNetworkSwitch"]("cardano-preview", "fetchhub-4")
      ).resolves.toBeUndefined();

      expect(disposeRuntimeIfInstance).toHaveBeenCalledWith("rt_old");
      expect(reset).not.toHaveBeenCalled();
      // Generation/in-flight of the newer owner must stay intact.
      expect((service as any)["cardanoRuntimeGeneration"]).toBe(6);
      expect((service as any)["cardanoNetworkRuntimeInFlight"]).not.toBeNull();
    });
  });

  describe("unlock with stale selected chain", () => {
    let chainsService: ReturnType<typeof createTestChainsService>;
    let mockCardanoService: CardanoService;

    beforeEach(() => {
      mockCardanoService = {
        reset: jest.fn(),
        restoreFromKeyStore: jest.fn().mockResolvedValue(undefined),
        isInitialized: jest.fn().mockReturnValue(false),
        isReady: jest.fn().mockReturnValue(false),
        isKeyAgentReady: jest.fn().mockReturnValue(false),
        getRuntimeState: jest.fn().mockReturnValue("not_initialized"),
        getAttachedRuntimeInstanceId: jest.fn(),
        disposeRuntimeIfInstance: jest.fn(),
      } as any as CardanoService;

      chainsService = createTestChainsService();
      chainsService["selectedChainId"] = "asi-devnet-1";

      service = new KeyRingService(
        new MemoryKVStore("test-keyring-unlock"),
        TEST_EMBED_CHAINS,
        {} as any,
        mockCardanoService
      );
      service.chainsService = chainsService;
      service["keyRing"] = {
        unlock: jest.fn().mockResolvedValue(undefined),
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { mnemonicLength: "24" },
        }),
        currentPassword: "pw",
      } as any;
    });

    it("returns UNLOCKED and keeps Cardano detached without NetworkRuntime on Cardano unlock", async () => {
      chainsService = createTestChainsService([
        ...TEST_EMBED_CHAINS,
        {
          chainId: "cardano-preview",
          chainName: "Cardano Preview",
          features: ["cardano"],
        } as ChainInfo,
      ]);
      chainsService["selectedChainId"] = "cardano-preview";
      service.chainsService = chainsService;

      const status = await service.unlock("password");

      expect(status).toBe(KeyRingStatus.UNLOCKED);
      expect(mockCardanoService.restoreFromKeyStore).not.toHaveBeenCalled();
      expect(mockCardanoService.reset).not.toHaveBeenCalled();
      expect((service as any)["cardanoNetworkRuntimeInFlight"]).toBeNull();
    });

    it("returns UNLOCKED, reconciles stale selected chain, and detaches Cardano on non-Cardano", async () => {
      const status = await service.unlock("password");

      expect(status).toBe(KeyRingStatus.UNLOCKED);
      expect(service.keyRingStatus).toBe(KeyRingStatus.UNLOCKED);
      expect(await chainsService.getSelectedChain()).toBe(
        PREFERRED_DEFAULT_CHAIN_ID
      );
      expect(mockCardanoService.restoreFromKeyStore).not.toHaveBeenCalled();
      expect(mockCardanoService.reset).toHaveBeenCalled();
    });
  });

  describe("changeKeyStoreFromMultiKeyStore Cardano reset guard", () => {
    it("does not reset Cardano runtime when current chain is non-Cardano", async () => {
      const reset = jest.fn();
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
      service["cardanoService"] = { reset } as any;
      service["interactionService"] = {
        dispatchEvent,
      } as any;

      await service.changeKeyStoreFromMultiKeyStore(1);

      expect(changeKeyStoreFromMultiKeyStore).toHaveBeenCalledWith(1);
      expect(dispatchEvent).toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
    });

    it("resets Cardano runtime when current chain is Cardano", async () => {
      const reset = jest.fn();
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preview"),
        findChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        changeKeyStoreFromMultiKeyStore: jest.fn().mockResolvedValue({
          multiKeyStoreInfo: [],
        }),
      } as any;
      service["cardanoService"] = { reset } as any;
      service["interactionService"] = {
        dispatchEvent: jest.fn(),
      } as any;

      await service.changeKeyStoreFromMultiKeyStore(1);

      expect(reset).toHaveBeenCalled();
    });
  });

  describe("Cardano runtime stale init recovery", () => {
    it("retries ensure after in-flight init is invalidated by resetCardanoRuntime", async () => {
      let resolveRestore: (() => void) | undefined;
      let restoreCallCount = 0;
      let initialized = false;
      const restoreFromKeyStore = jest.fn().mockImplementation(() => {
        restoreCallCount += 1;
        if (restoreCallCount === 1) {
          return new Promise<void>((resolve) => {
            resolveRestore = resolve;
          });
        }
        initialized = true;
        return Promise.resolve();
      });
      const reset = jest.fn();
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preview"),
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
        reset,
        restoreFromKeyStore,
        isInitialized: jest.fn().mockImplementation(() => initialized),
        isReady: jest.fn().mockImplementation(() => initialized),
        isReadyForChain: jest
          .fn()
          .mockImplementation(
            (id: string) => initialized && id === "cardano-preview"
          ),
        getBoundChainId: jest
          .fn()
          .mockImplementation(() =>
            initialized ? "cardano-preview" : undefined
          ),
        isKeyAgentReady: jest.fn().mockImplementation(() => initialized),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() =>
            initialized ? "ready" : "not_initialized"
          ),
      } as any;

      const ensurePromise =
        service.ensureCardanoServiceReady("cardano-preview");

      await new Promise((resolve) => setImmediate(resolve));
      expect(restoreFromKeyStore).toHaveBeenCalledTimes(1);

      service["resetCardanoRuntime"]();
      resolveRestore?.();

      await expect(ensurePromise).resolves.toBeUndefined();
      expect(restoreFromKeyStore).toHaveBeenCalledTimes(2);
      expect(reset).toHaveBeenCalled();
    });

    it("does not log stale generation as Cardano initialization failure", async () => {
      const consoleError = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      let initialized = false;
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preview"),
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
        reset: jest.fn(),
        restoreFromKeyStore: jest
          .fn()
          .mockImplementationOnce(async () => {
            service["cardanoRuntimeGeneration"] += 1;
          })
          .mockImplementationOnce(async () => {
            initialized = true;
          }),
        isInitialized: jest.fn().mockImplementation(() => initialized),
        isReady: jest.fn().mockImplementation(() => initialized),
        isReadyForChain: jest
          .fn()
          .mockImplementation(
            (id: string) => initialized && id === "cardano-preview"
          ),
        getBoundChainId: jest
          .fn()
          .mockImplementation(() =>
            initialized ? "cardano-preview" : undefined
          ),
        isKeyAgentReady: jest.fn().mockImplementation(() => initialized),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() =>
            initialized ? "ready" : "not_initialized"
          ),
      } as any;

      await expect(
        service.ensureCardanoServiceReady("cardano-preview")
      ).resolves.toBeUndefined();

      expect(consoleError).not.toHaveBeenCalledWith(
        "[KeyRingService] Failed to initialize CardanoService:",
        expect.any(StaleCardanoRuntimeError)
      );
      consoleError.mockRestore();
    });

    it("concurrent ensure joins one NetworkRuntime create/attach (create===1, attached===1)", async () => {
      let releaseCreate: (() => void) | undefined;
      let createCalls = 0;
      let attachedCount = 0;
      let midInit = false;
      let ready = false;

      // Stand-in for CardanoWalletManager.create + markAttached inside restore.
      const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
        createCalls += 1;
        midInit = true;
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        attachedCount = 1;
        ready = true;
      });
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preview"),
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
        reset: jest.fn(),
        restoreFromKeyStore,
        // Mimic early keyRing publish: initialized mid-flight, ready only after restore.
        isInitialized: jest.fn().mockImplementation(() => midInit || ready),
        isReady: jest.fn().mockImplementation(() => ready),
        isReadyForChain: jest
          .fn()
          .mockImplementation(
            (id: string) => ready && id === "cardano-preview"
          ),
        getBoundChainId: jest
          .fn()
          .mockImplementation(() => (ready ? "cardano-preview" : undefined)),
        isKeyAgentReady: jest.fn().mockImplementation(() => ready),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() => (ready ? "ready" : "not_initialized")),
      } as any;

      const ensure1 = service.ensureCardanoServiceReady("cardano-preview");
      await new Promise((resolve) => setImmediate(resolve));
      expect(midInit).toBe(true);
      expect(createCalls).toBe(1);

      // Second ensure (transaction) while initialized but not ready — must join, not create.
      const ensure2 = service.ensureCardanoServiceReady("cardano-preview");
      await new Promise((resolve) => setImmediate(resolve));

      expect(createCalls).toBe(1);
      expect(attachedCount).toBe(0);

      releaseCreate?.();
      await Promise.all([ensure1, ensure2]);

      expect(createCalls).toBe(1);
      expect(attachedCount).toBe(1);
      expect(restoreFromKeyStore).toHaveBeenCalledTimes(1);
    });

    it("concurrent key + transaction: key path 0 creates, transaction path exactly 1", async () => {
      let releaseCreate: (() => void) | undefined;
      let createCalls = 0;
      let ready = false;

      const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
        createCalls += 1;
        await new Promise<void>((resolve) => {
          releaseCreate = resolve;
        });
        ready = true;
      });
      const deriveKeyFromKeyStore = jest.fn().mockImplementation(async () => {
        // Simulate offline key work overlapping with NetworkRuntime create.
        await new Promise((resolve) => setImmediate(resolve));
        return {
          algo: "cardano_address_only",
          pubKey: new Uint8Array(),
          address: Buffer.from("addr_test1_offline"),
          isNanoLedger: false,
          isKeystone: false,
        };
      });

      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-preview"),
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
        getSwitchGeneration: jest.fn().mockReturnValue(0),
        peekSelectedChainId: jest.fn().mockReturnValue("cardano-preview"),
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
        reset: jest.fn(),
        restoreFromKeyStore,
        deriveKeyFromKeyStore,
        isInitialized: jest.fn().mockImplementation(() => ready),
        isReady: jest.fn().mockImplementation(() => ready),
        isReadyForChain: jest
          .fn()
          .mockImplementation(
            (id: string) => ready && id === "cardano-preview"
          ),
        getBoundChainId: jest
          .fn()
          .mockImplementation(() => (ready ? "cardano-preview" : undefined)),
        isKeyAgentReady: jest.fn().mockImplementation(() => ready),
        getRuntimeState: jest
          .fn()
          .mockImplementation(() => (ready ? "ready" : "not_initialized")),
      } as any;

      const keyPath = service.getKey("cardano-preview");
      const txPath = service.ensureCardanoServiceReady("cardano-preview");

      await new Promise((resolve) => setImmediate(resolve));
      expect(deriveKeyFromKeyStore).toHaveBeenCalled();
      expect(createCalls).toBe(1);

      releaseCreate?.();
      await Promise.all([keyPath, txPath]);

      expect(deriveKeyFromKeyStore).toHaveBeenCalledTimes(1);
      expect(createCalls).toBe(1);
      expect(restoreFromKeyStore).toHaveBeenCalledTimes(1);
    });
  });
});
