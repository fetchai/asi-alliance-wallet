import { KeyRingService } from "./service";
import { KeyRingStatus } from "./keyring";
import { MemoryKVStore } from "@keplr-wallet/common";
import { CardanoService } from "../cardano/service";

describe("KeyRingService", () => {
  let service: KeyRingService;
  let mockEnv: any;
  let mockCardanoService: CardanoService;

  beforeEach(() => {
    mockCardanoService = {} as CardanoService;
    service = new KeyRingService(
      new MemoryKVStore("test"),
      [],
      {} as any,
      mockCardanoService
    );
    
    // Mock keyRing property
    service['keyRing'] = {
      status: KeyRingStatus.NOTLOADED,
      restore: jest.fn()
    } as any;
    
    mockEnv = {};
  });

  describe("checkReadiness", () => {
    it("should return EMPTY status when keyring is empty", async () => {
      // Mock keyring status
      service['keyRing'] = {
        status: KeyRingStatus.EMPTY,
        restore: jest.fn()
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
      
      service['keyRing'] = {
        get status() { return status; },
        restore: mockRestore
      } as any;

      const result = await service.checkReadiness(mockEnv);
      expect(mockRestore).toHaveBeenCalled();
      expect(result).toBe(KeyRingStatus.EMPTY);
    });

    it("should request unlock when status is LOCKED", async () => {
      // Mock keyring status and interaction service
      service['keyRing'] = {
        status: KeyRingStatus.LOCKED,
        restore: jest.fn()
      } as any;
      
      const mockWaitApprove = jest.fn();
      service['interactionService'] = { waitApprove: mockWaitApprove } as any;

      await service.checkReadiness(mockEnv);
      expect(mockWaitApprove).toHaveBeenCalledWith(mockEnv, "/unlock", "unlock", {});
    });

    it("should return UNLOCKED status when keyring is already unlocked", async () => {
      // Mock keyring status
      service['keyRing'] = {
        status: KeyRingStatus.UNLOCKED,
        restore: jest.fn()
      } as any;

      const result = await service.checkReadiness(mockEnv);
      expect(result).toBe(KeyRingStatus.UNLOCKED);
    });
  });

  describe("enable", () => {
    it("should throw error when keyring is empty", async () => {
      // Mock keyring status
      service['keyRing'] = {
        status: KeyRingStatus.EMPTY,
        restore: jest.fn()
      } as any;

      await expect(service.enable(mockEnv)).rejects.toThrow("key doesn't exist");
    });

    it("should not throw error when keyring is not empty", async () => {
      // Mock keyring status
      service['keyRing'] = {
        status: KeyRingStatus.UNLOCKED,
        restore: jest.fn()
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
      service["correctChainForCardanoSupport"] = jest.fn().mockResolvedValue(undefined);
      service["cardanoService"] = {
        createMetaFromMnemonic: jest.fn().mockResolvedValue({
          cardano: "true",
          coinType: "1815",
          cardanoSerializedAgent: "{\"secret\":true}",
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
      const mergedMeta = mockCreateMnemonicKey.mock.calls[0][3] as Record<string, string>;
      expect(mergedMeta.cardano).toBe("true");
      expect(mergedMeta.coinType).toBe("1815");
      expect(mergedMeta.cardanoSerializedAgent).toBeUndefined();
    });
  });
}); 