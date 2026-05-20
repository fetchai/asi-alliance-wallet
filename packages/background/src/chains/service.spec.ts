import { PREFERRED_DEFAULT_CHAIN_ID } from "./default-chain";
import { createTestChainsService } from "./chains-service.test-helpers";

describe("ChainsService", () => {
  describe("findChainInfo", () => {
    it("returns undefined for stale chain id", async () => {
      const service = createTestChainsService();
      await expect(
        service.findChainInfo("asi-devnet-1")
      ).resolves.toBeUndefined();
    });

    it("returns undefined for malformed chain id without throwing", async () => {
      const service = createTestChainsService();
      await expect(
        service.findChainInfo("!!!not-a-valid-chain-id")
      ).resolves.toBeUndefined();
    });

    it("returns chain info for embed chain", async () => {
      const service = createTestChainsService();
      const info = await service.findChainInfo(PREFERRED_DEFAULT_CHAIN_ID);
      expect(info?.chainId).toBe(PREFERRED_DEFAULT_CHAIN_ID);
    });
  });

  describe("getChainInfo", () => {
    it("throws for unknown chain id", async () => {
      const service = createTestChainsService();
      await expect(service.getChainInfo("asi-devnet-1")).rejects.toThrow();
    });

    it("throws for malformed chain id", async () => {
      const service = createTestChainsService();
      await expect(
        service.getChainInfo("!!!not-a-valid-chain-id")
      ).rejects.toThrow();
    });
  });

  describe("getSelectedChain", () => {
    it("reconciles stale selectedChainId to default fallback", async () => {
      const service = createTestChainsService();
      service["selectedChainId"] = "asi-devnet-1";

      const selected = await service.getSelectedChain();

      expect(selected).toBe(PREFERRED_DEFAULT_CHAIN_ID);
      expect(service["selectedChainId"]).toBe(PREFERRED_DEFAULT_CHAIN_ID);
    });

    it("assigns fallback when selectedChainId is unset", async () => {
      const service = createTestChainsService();

      const selected = await service.getSelectedChain();

      expect(selected).toBe(PREFERRED_DEFAULT_CHAIN_ID);
      expect(service["selectedChainId"]).toBe(PREFERRED_DEFAULT_CHAIN_ID);
    });

    it("reconciles malformed selectedChainId to fallback", async () => {
      const service = createTestChainsService();
      service["selectedChainId"] = "!!!not-a-valid-chain-id";

      const selected = await service.getSelectedChain();

      expect(selected).toBe(PREFERRED_DEFAULT_CHAIN_ID);
      expect(service["selectedChainId"]).toBe(PREFERRED_DEFAULT_CHAIN_ID);
    });

    it("throws when no chain infos are available", async () => {
      const service = createTestChainsService([]);

      await expect(service.getSelectedChain()).rejects.toThrow(
        "No chain infos available"
      );
    });

    it("keeps stale id after setSelectedChain when no handlers run, then reconciles on read", async () => {
      const service = createTestChainsService();
      await service.setSelectedChain("asi-devnet-1");

      expect(service["selectedChainId"]).toBe("asi-devnet-1");

      const selected = await service.getSelectedChain();
      expect(selected).toBe(PREFERRED_DEFAULT_CHAIN_ID);
    });

    it("rolls back setSelectedChain when handler rejects unknown chain", async () => {
      const service = createTestChainsService();
      service["selectedChainId"] = PREFERRED_DEFAULT_CHAIN_ID;

      service.addNetworkSwitchHandler(async (_old, newChainId) => {
        await service.getChainInfo(newChainId);
      });

      await expect(service.setSelectedChain("asi-devnet-1")).rejects.toThrow();

      expect(service["selectedChainId"]).toBe(PREFERRED_DEFAULT_CHAIN_ID);
    });
  });
});
