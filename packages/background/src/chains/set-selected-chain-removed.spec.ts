import { MessageRegistry, Router } from "@keplr-wallet/router";
import { PREFERRED_DEFAULT_CHAIN_ID } from "./default-chain";
import { createTestChainsService } from "./chains-service.test-helpers";
import { init as initChains } from "./init";
import { SelectSelectedChainMsg, SwitchNetworkByChainIdMsg } from "./messages";
import { getHandler } from "./handler";

/** Minimal router that exposes message parse for registration assertions. */
class TestChainsRouter extends Router {
  parseMessage(message: { type?: string; msg: any }) {
    return this.msgRegistry.parseMessage(message);
  }

  protected attachHandler(): void {}
  protected detachHandler(): void {}
}

describe("legacy SetSelectedChainMsg removed", () => {
  it("does not register set-selected-chain after chains init", () => {
    const service = createTestChainsService();
    const router = new TestChainsRouter(
      () =>
        ({
          isInternalMsg: true,
          requestInteraction: jest.fn(),
        } as any)
    );
    initChains(router, service);

    expect(() =>
      router.parseMessage({
        type: "set-selected-chain",
        msg: { chainId: "dorado-1" },
      })
    ).toThrow(/Unregistered msg type set-selected-chain/);
  });

  it("handcrafted MessageRegistry rejects set-selected-chain when only current msgs are registered", () => {
    const registry = new MessageRegistry();
    registry.registerMessage(SelectSelectedChainMsg);
    registry.registerMessage(SwitchNetworkByChainIdMsg);

    expect(() =>
      registry.parseMessage({
        type: "set-selected-chain",
        msg: { chainId: "dorado-1" },
      })
    ).toThrow(/Unregistered msg type set-selected-chain/);
  });

  it("SelectSelectedChainMsg remains internal-only and returns { chainId, revision }", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();
    await service.setSelectedChain(PREFERRED_DEFAULT_CHAIN_ID);

    const msg = new SelectSelectedChainMsg("dorado-1");
    expect(msg.approveExternal({} as any, {} as any)).toBe(false);

    const handler = getHandler(service);
    const result = await handler({ isInternalMsg: true } as any, msg);

    expect(result).toEqual({
      chainId: "dorado-1",
      revision: expect.any(Number),
    });
    await expect(service.getSelectedChainSnapshot()).resolves.toEqual(result);
  });

  it("rejected external SwitchNetworkByChainIdMsg does not change snapshot", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();
    await service.setSelectedChain(PREFERRED_DEFAULT_CHAIN_ID);
    const before = await service.getSelectedChainSnapshot();

    service["interactionService"].waitApprove = jest
      .fn()
      .mockRejectedValue(new Error("user rejected"));

    const msg = new SwitchNetworkByChainIdMsg("dorado-1");
    (msg as { origin?: string }).origin = "https://dapp.example";
    expect(msg.approveExternal()).toBe(true);

    const handler = getHandler(service);
    await expect(handler({ isInternalMsg: false } as any, msg)).rejects.toThrow(
      /user rejected/
    );

    await expect(service.getSelectedChainSnapshot()).resolves.toEqual(before);
  });

  it("approved external SwitchNetworkByChainIdMsg changes authority once", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();
    await service.setSelectedChain(PREFERRED_DEFAULT_CHAIN_ID);
    const before = await service.getSelectedChainSnapshot();

    service["interactionService"].waitApprove = jest
      .fn()
      .mockResolvedValue("dorado-1");
    service["permissionService"].addPermission = jest
      .fn()
      .mockResolvedValue(undefined);

    const msg = new SwitchNetworkByChainIdMsg("dorado-1");
    (msg as { origin?: string }).origin = "https://dapp.example";

    const handler = getHandler(service);
    await handler({ isInternalMsg: false } as any, msg);

    const after = await service.getSelectedChainSnapshot();
    expect(after.chainId).toBe("dorado-1");
    expect(after.revision).toBe(before.revision + 1);
    expect(service["interactionService"].waitApprove).toHaveBeenCalledTimes(1);
  });
});
