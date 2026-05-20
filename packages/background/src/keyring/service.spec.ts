import { KeyRingService } from "./service";
import { KeyRingStatus } from "./keyring";
import { MemoryKVStore } from "@keplr-wallet/common";
import type { CardanoService } from "../cardano/service";
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
      service["cardanoRestoreByChainId"] = new Map([
        ["cardano-preprod", Promise.resolve()],
      ]);
      service["ensureCardanoServiceReady"] = ensure;

      await service.reinitializeCardanoService("cardano-preprod");

      expect(reset).toHaveBeenCalled();
      expect((service as any)["cardanoRestoreByChainId"].size).toBe(0);
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
      service["cardanoRestoreByChainId"] = new Map([
        ["cardano-mainnet", Promise.resolve()],
      ]);

      const result = service.lock();

      expect(mockLock).toHaveBeenCalled();
      expect((mockCardanoService as any).reset).toHaveBeenCalled();
      expect((service as any)["cardanoRestoreByChainId"].size).toBe(0);
      expect(result).toBe(KeyRingStatus.LOCKED);
    });
  });

  describe("ensureCardanoServiceReady contract", () => {
    it("throws when restore attempt completes but service is still not ready", async () => {
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({}),
        currentPassword: "pw",
      } as any;
      service["chainsService"] = {
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(true),
        isReady: jest.fn().mockReturnValue(false),
        restoreFromKeyStore: jest.fn().mockResolvedValue(undefined),
        getRuntimeState: jest.fn().mockReturnValue("ok"),
      } as any;

      await expect(
        service.ensureCardanoServiceReady("cardano-mainnet")
      ).rejects.toThrow("temporarily_unavailable: wallet_not_ready");
    });

    it("throws on existing dedup promise path when service remains not ready", async () => {
      service["chainsService"] = {
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(true),
        isReady: jest.fn().mockReturnValue(false),
        getRuntimeState: jest.fn().mockReturnValue("ok"),
      } as any;
      service["cardanoRestoreByChainId"] = new Map([
        ["cardano-mainnet", Promise.resolve()],
      ]);

      await expect(
        service.ensureCardanoServiceReady("cardano-mainnet")
      ).rejects.toThrow("temporarily_unavailable: wallet_not_ready");
    });

    it("throws on init dedup promise path when service remains not ready", async () => {
      service["cardanoService"] = {
        isInitialized: jest.fn().mockReturnValue(false),
        isReady: jest.fn().mockReturnValue(false),
        getRuntimeState: jest.fn().mockReturnValue("ok"),
      } as any;
      service["cardanoServiceInitPromise"] = Promise.resolve();

      await expect(
        service.ensureCardanoServiceReady("cardano-mainnet")
      ).rejects.toThrow("temporarily_unavailable: wallet_not_ready");
    });
  });

  describe("network switch rollback degradation paths", () => {
    it("resets touched cardano runtime when critical switch step fails", async () => {
      const restoreOld = jest.fn().mockResolvedValue(undefined);
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
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { key: "v", mnemonicLength: "24" },
          bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
        }),
        currentPassword: "pw",
      } as any;
      service["cardanoService"] = {
        reset: jest.fn(),
        restoreFromKeyStore: restoreOld,
      } as any;
      service["ensureCardanoServiceReady"] = jest
        .fn()
        .mockRejectedValue(new Error("critical_rebind_failed"));

      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).rejects.toThrow("critical_rebind_failed");

      expect((service["cardanoService"] as any).reset).toHaveBeenCalled();
      expect((service as any)["cardanoRestoreByChainId"].size).toBe(0);
      expect(restoreOld).toHaveBeenCalled();
    });

    it("keeps deterministic degraded state when old-context restore fails", async () => {
      const restoreOld = jest
        .fn()
        .mockRejectedValue(new Error("old_restore_failed"));
      service["chainsService"] = {
        getSelectedChain: jest.fn().mockResolvedValue("cardano-new"),
        getChainInfo: jest.fn().mockImplementation((chainId: string) =>
          Promise.resolve({
            features: chainId.startsWith("cardano") ? ["cardano"] : [],
          })
        ),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({
          type: "mnemonic",
          meta: { key: "v", mnemonicLength: "24" },
          bip44HDPath: { account: 0, change: 0, addressIndex: 0 },
        }),
        currentPassword: "pw",
      } as any;
      service["cardanoService"] = {
        reset: jest.fn(),
        restoreFromKeyStore: restoreOld,
      } as any;
      service["ensureCardanoServiceReady"] = jest
        .fn()
        .mockRejectedValue(new Error("critical_rebind_failed"));

      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).rejects.toThrow("critical_rebind_failed");

      expect((service["cardanoService"] as any).reset).toHaveBeenCalledTimes(1);
      expect(restoreOld).toHaveBeenCalledTimes(1);
      expect((service as any)["cardanoRestoreByChainId"].size).toBe(0);
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

      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).resolves.toBeUndefined();

      expect(ensureReady).not.toHaveBeenCalled();
      expect(repair).not.toHaveBeenCalled();
    });

    it("supports retry after failed switch without stale dedup state", async () => {
      const getSelectedChain = jest
        .fn()
        .mockResolvedValueOnce("cardano-new")
        .mockResolvedValueOnce("cardano-new");
      service["chainsService"] = {
        getSelectedChain,
        getChainInfo: jest.fn().mockResolvedValue({ features: ["cardano"] }),
      } as any;
      service["keyRing"] = {
        status: KeyRingStatus.UNLOCKED,
        getCurrentKeyStore: jest.fn().mockReturnValue({ meta: { key: "v" } }),
        currentPassword: "pw",
      } as any;
      service["cardanoService"] = {
        reset: jest.fn(),
        restoreFromKeyStore: jest.fn().mockResolvedValue(undefined),
      } as any;

      const ensure = jest
        .fn()
        .mockRejectedValueOnce(new Error("first_failed"))
        .mockResolvedValueOnce(undefined);
      service["ensureCardanoServiceReady"] = ensure;
      service["runAddressCacheRepairBestEffort"] = jest
        .fn()
        .mockResolvedValue(undefined);

      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).rejects.toThrow("first_failed");
      expect((service as any)["cardanoRestoreByChainId"].size).toBe(0);

      await expect(
        service["onNetworkSwitch"]("cardano-old", "cardano-new")
      ).resolves.toBeUndefined();
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

    it("returns UNLOCKED and reconciles selected chain when stale id was persisted", async () => {
      const status = await service.unlock("password");

      expect(status).toBe(KeyRingStatus.UNLOCKED);
      expect(service.keyRingStatus).toBe(KeyRingStatus.UNLOCKED);
      expect(await chainsService.getSelectedChain()).toBe(
        PREFERRED_DEFAULT_CHAIN_ID
      );
      expect(mockCardanoService.reset).toHaveBeenCalled();
    });

    it("returns UNLOCKED and resets Cardano when post-unlock init fails", async () => {
      (mockCardanoService.restoreFromKeyStore as jest.Mock).mockRejectedValue(
        new Error("cardano_init_failed")
      );
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
      expect(service.keyRingStatus).toBe(KeyRingStatus.UNLOCKED);
      expect(mockCardanoService.reset).toHaveBeenCalled();
      expect((service as any)["cardanoRestoreByChainId"].size).toBe(0);
    });
  });
});
