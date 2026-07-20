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

  describe("getNetworkProjection", () => {
    it("returns selection that is present in the same chainInfos snapshot", async () => {
      const service = await createWiredTestChainsService();
      const bundle = await service.getNetworkProjection();
      const selectedId = bundle.selection.chainId;
      expect(
        bundle.chainInfos.some((info) => info.chainId === selectedId)
      ).toBe(true);
    });

    it("stays consistent with concurrent select (FIFO, no torn pair)", async () => {
      const service = await createWiredTestChainsService();

      const [first, ack, second] = await Promise.all([
        service.getNetworkProjection(),
        service.selectChainWithAck("dorado-1"),
        service.getNetworkProjection(),
      ]);

      expect(ack).toEqual({ chainId: "dorado-1", revision: 2 });

      for (const bundle of [first, second]) {
        expect(
          bundle.chainInfos.some(
            (info) => info.chainId === bundle.selection.chainId
          )
        ).toBe(true);
      }
    });

    it("stays consistent with concurrent add/remove (FIFO, no torn pair)", async () => {
      const service = await createWiredTestChainsService();

      const add = service.addChainInfo({
        chainId: "custom-torn-1",
        chainName: "Custom Torn",
        features: ["cosmos"],
      } as any);

      const [duringAdd, afterAdd] = await Promise.all([
        service.getNetworkProjection(),
        add.then(() => service.getNetworkProjection()),
      ]);

      for (const bundle of [duringAdd, afterAdd]) {
        expect(
          bundle.chainInfos.some(
            (info) => info.chainId === bundle.selection.chainId
          )
        ).toBe(true);
      }

      expect(
        afterAdd.chainInfos.some((info) => info.chainId === "custom-torn-1")
      ).toBe(true);

      const remove = service.removeChainInfo("custom-torn-1");
      const [duringRemove, afterRemove] = await Promise.all([
        service.getNetworkProjection(),
        remove.then(() => service.getNetworkProjection()),
      ]);

      for (const bundle of [duringRemove, afterRemove]) {
        expect(
          bundle.chainInfos.some(
            (info) => info.chainId === bundle.selection.chainId
          )
        ).toBe(true);
      }

      expect(
        afterRemove.chainInfos.some((info) => info.chainId === "custom-torn-1")
      ).toBe(false);
    });

    it("fails closed when selection chainId is not exactly in chainInfos", async () => {
      const service = await createWiredTestChainsService();
      await service.selectChainWithAck("dorado-1");
      jest.spyOn(service, "getChainInfos").mockResolvedValue([
        {
          chainId: "fetchhub-4",
          chainName: "Fetchhub",
          features: ["cosmos"],
        } as any,
      ]);

      await expect(service.getNetworkProjection()).rejects.toThrow(
        /not present in chain registry/
      );
    });
  });
});
