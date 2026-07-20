import { PREFERRED_DEFAULT_CHAIN_ID } from "./default-chain";
import {
  createTestChainsService,
  createWiredTestChainsService,
} from "./chains-service.test-helpers";

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

  describe("selected chain via NetworkAuthority", () => {
    it("requires NetworkAuthority for getSelectedChain", async () => {
      const service = createTestChainsService();
      await expect(service.getSelectedChain()).rejects.toThrow(
        /NetworkAuthority is not wired/
      );
    });

    it("returns hydrated snapshot chain id without repairing on read", async () => {
      const service = await createWiredTestChainsService();
      await expect(service.getSelectedChain()).resolves.toBe(
        PREFERRED_DEFAULT_CHAIN_ID
      );
      await expect(service.getSelectedChainSnapshot()).resolves.toEqual({
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        revision: 1,
      });
    });

    it("rejects unknown select without changing committed snapshot", async () => {
      const service = await createWiredTestChainsService();
      await expect(service.setSelectedChain("asi-devnet-1")).rejects.toThrow(
        /There is no chain info/
      );
      await expect(service.getSelectedChain()).resolves.toBe(
        PREFERRED_DEFAULT_CHAIN_ID
      );
      expect(service.getCommittedRevision()).toBe(1);
    });

    it("selects a registered chain and bumps revision", async () => {
      const service = await createWiredTestChainsService();
      await expect(
        service.setSelectedChain("dorado-1")
      ).resolves.toBeUndefined();
      await expect(service.getSelectedChain()).resolves.toBe("dorado-1");
      expect(service.getCommittedRevision()).toBe(2);
    });

    it("throws when no chain infos are available for hydrate", async () => {
      await expect(createWiredTestChainsService([])).rejects.toThrow(
        "No chain infos available"
      );
    });
  });
});
