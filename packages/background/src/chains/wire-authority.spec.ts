import { MemoryKVStore } from "@keplr-wallet/common";
import { ChainInfo } from "@keplr-wallet/types";
import { PREFERRED_DEFAULT_CHAIN_ID } from "./default-chain";
import { createTestChainsService } from "./chains-service.test-helpers";
import { NETWORK_SURFACES_SYNC_MESSAGE_TYPE } from "./service";
import { ChainsService } from "./service";
import { CardanoRuntimeSupervisor } from "../cardano/runtime-supervisor";
import { createCardanoServiceHost } from "../cardano/runtime-supervisor/cardano-service-host";
import { MemoryCardanoRuntimeHost } from "../cardano/runtime-supervisor/cardano-runtime-supervisor.test-helpers";
import { KeyRingService } from "../keyring/service";
import { KeyRingStatus } from "../keyring/keyring";
import { CardanoService } from "../cardano/service";

const CARDANO_TEST_CHAINS: ChainInfo[] = [
  {
    chainId: PREFERRED_DEFAULT_CHAIN_ID,
    chainName: "Fetchhub",
    features: ["cosmos"],
  } as ChainInfo,
  {
    chainId: "cardano-mainnet",
    chainName: "Cardano",
    features: ["cardano"],
  } as ChainInfo,
];

describe("ChainsService NetworkAuthority wire-up", () => {
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it("select commits through authority, notifies supervisor, and publishes opaque webpage seq", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();

    const host = new MemoryCardanoRuntimeHost();
    host.ready = true;
    host.boundChainId = PREFERRED_DEFAULT_CHAIN_ID;
    host.initialized = true;
    const invalidateSpy = jest.spyOn(host, "invalidateAdvertisedReadiness");

    const supervisor = new CardanoRuntimeSupervisor({
      host,
      isCardanoChain: (id) => service.isCardanoFeatureSync(id),
    });
    service.subscribeNetworkAuthority((snapshot, previous) => {
      supervisor.onAuthorityCommitted(snapshot, previous);
    });

    const sendMessage = jest.fn();
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage },
    };
    const dispatchEvent = service["interactionService"]
      .dispatchEvent as jest.Mock;
    dispatchEvent.mockClear();

    await service.setSelectedChain("dorado-1");

    await expect(service.getSelectedChain()).resolves.toBe("dorado-1");
    await expect(service.getSelectedChainSnapshot()).resolves.toEqual({
      chainId: "dorado-1",
      revision: 2,
    });
    expect(service.getCommittedRevision()).toBe(2);
    expect(supervisor.getOwnerChainId()).toBe("dorado-1");
    expect(supervisor.getOwnerRevision()).toBe(2);
    expect(invalidateSpy).toHaveBeenCalled();
    expect(host.ready).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
        chainId: "dorado-1",
        revision: 2,
      })
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.anything(),
      "network-changed",
      expect.objectContaining({ seq: expect.any(Number) })
    );
    const networkChanged = dispatchEvent.mock.calls.find(
      (call) => call[1] === "network-changed"
    );
    expect(networkChanged?.[2]?.seq).not.toBe(2);
  });

  it("rejects removing the committed selected chain", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();

    await service.addChainInfo({
      chainId: "custom-1",
      chainName: "Custom",
      features: ["cosmos"],
    } as any);
    await service.setSelectedChain("custom-1");

    await expect(service.removeChainInfo("custom-1")).rejects.toThrow(
      /currently selected/
    );
    await expect(service.hasChainInfo("custom-1")).resolves.toBe(true);
    await expect(service.getSelectedChain()).resolves.toBe("custom-1");
  });

  it("getSelectedChain after hydrate does not write when snapshot is valid", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => PREFERRED_DEFAULT_CHAIN_ID,
    });
    await service.hydrateNetworkAuthority();

    const setSpy = jest.spyOn(service["kvStore"], "set");
    setSpy.mockClear();

    await expect(service.getSelectedChain()).resolves.toBe(
      PREFERRED_DEFAULT_CHAIN_ID
    );
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });

  it("switchChainByChainId selects after approval before the external handler returns", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();

    service["interactionService"].waitApprove = jest
      .fn()
      .mockResolvedValue("dorado-1");
    service["permissionService"].addPermission = jest
      .fn()
      .mockResolvedValue(undefined);

    await service.switchChainByChainId(
      { isInternalMsg: false } as any,
      "dorado-1",
      "https://dapp.example"
    );

    await expect(service.getSelectedChain()).resolves.toBe("dorado-1");
    await expect(service.getSelectedChainSnapshot()).resolves.toEqual({
      chainId: "dorado-1",
      revision: expect.any(Number),
    });
  });

  it("switchChainByChainId rejects mismatched approval result and keeps prior selection", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();
    await service.setSelectedChain(PREFERRED_DEFAULT_CHAIN_ID);

    service["interactionService"].waitApprove = jest
      .fn()
      .mockResolvedValue(PREFERRED_DEFAULT_CHAIN_ID);
    service["permissionService"].addPermission = jest
      .fn()
      .mockResolvedValue(undefined);

    await expect(
      service.switchChainByChainId(
        { isInternalMsg: false } as any,
        "dorado-1",
        "https://dapp.example"
      )
    ).rejects.toThrow(/does not match requested/);

    await expect(service.getSelectedChain()).resolves.toBe(
      PREFERRED_DEFAULT_CHAIN_ID
    );
  });

  it("AddNetworkAndSwitch for an already-registered chain runs switch flow", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();
    await service.setSelectedChain(PREFERRED_DEFAULT_CHAIN_ID);

    const switchSpy = jest
      .spyOn(service, "switchChainByChainId")
      .mockResolvedValue(undefined);
    const addSpy = jest.spyOn(service, "addChainByNetwork");

    const { getHandler } = await import("./handler");
    const { AddNetworkAndSwitchMsg } = await import("./messages");
    const realMsg = new AddNetworkAndSwitchMsg({
      chainId: "dorado-1",
      chainName: "Dorado",
      rpcUrl: "https://rpc.example",
      restUrl: "https://rest.example",
      stakeCurrency: {
        coinDenom: "FET",
        coinMinimalDenom: "afet",
        coinDecimals: 18,
      },
      currencies: [],
      feeCurrencies: [],
      bip44s: [{ coinType: 118 }],
      features: [],
    } as any);
    (realMsg as { origin?: string }).origin = "https://dapp.example";

    const handler = getHandler(service);
    await handler({ isInternalMsg: false } as any, realMsg);

    expect(switchSpy).toHaveBeenCalledWith(
      expect.anything(),
      "dorado-1",
      "https://dapp.example"
    );
    expect(addSpy).not.toHaveBeenCalled();
    switchSpy.mockRestore();
    addSpy.mockRestore();
  });

  it("suggestChainInfo commits add then select before returning", async () => {
    const service = createTestChainsService();
    service.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await service.hydrateNetworkAuthority();

    const custom = {
      chainId: "custom-suggest-1",
      chainName: "Custom Suggest",
      rpc: "https://rpc.example",
      rest: "https://rest.example",
      stakeCurrency: {
        coinDenom: "CST",
        coinMinimalDenom: "ucst",
        coinDecimals: 6,
      },
      bip44: { coinType: 118 },
      bech32Config: {
        bech32PrefixAccAddr: "custom",
        bech32PrefixAccPub: "custompub",
        bech32PrefixValAddr: "customvaloper",
        bech32PrefixValPub: "customvaloperpub",
        bech32PrefixConsAddr: "customvalcons",
        bech32PrefixConsPub: "customvalconspub",
      },
      currencies: [
        {
          coinDenom: "CST",
          coinMinimalDenom: "ucst",
          coinDecimals: 6,
        },
      ],
      feeCurrencies: [
        {
          coinDenom: "CST",
          coinMinimalDenom: "ucst",
          coinDecimals: 6,
        },
      ],
      features: [],
    };

    service["interactionService"].waitApprove = jest
      .fn()
      .mockResolvedValue(custom);
    service["permissionService"].addPermission = jest
      .fn()
      .mockResolvedValue(undefined);

    await service.suggestChainInfo(
      { isInternalMsg: false } as any,
      custom as any,
      "https://dapp.example"
    );

    await expect(service.hasChainInfo("custom-suggest-1")).resolves.toBe(true);
    await expect(service.getSelectedChain()).resolves.toBe("custom-suggest-1");
  });

  it("hydrated Cardano selection: KeyRing init adopts snapshot so first ensure creates one runtime", async () => {
    const kv = new MemoryKVStore("test-hydrate-cardano-ensure");
    await kv.set("network_authority_snapshot", {
      chainId: "cardano-mainnet",
      revision: 4,
    });

    const chainsService = new ChainsService(kv, CARDANO_TEST_CHAINS);
    chainsService.init(
      { replaceChainInfo: async (c: ChainInfo) => c } as any,
      { dispatchEvent: jest.fn() } as any,
      {} as any
    );
    chainsService.wireNetworkAuthority({
      readLegacyLastViewChainId: async () => undefined,
    });
    await chainsService.hydrateNetworkAuthority();
    expect(chainsService.peekSelectedChainId()).toBe("cardano-mainnet");
    expect(chainsService.getCommittedRevision()).toBe(4);

    const restoreFromKeyStore = jest.fn().mockResolvedValue(undefined);
    const mockCardano = {
      reset: jest.fn(),
      restoreFromKeyStore,
      isInitialized: jest.fn().mockReturnValue(false),
      isReady: jest.fn().mockReturnValue(false),
      isReadyForChain: jest.fn().mockReturnValue(false),
      isKeyAgentReady: jest.fn().mockReturnValue(false),
      getBoundChainId: jest.fn().mockReturnValue(undefined),
      getAttachedRuntimeInstanceId: jest.fn().mockReturnValue(undefined),
      disposeRuntimeIfInstance: jest.fn().mockReturnValue(false),
      invalidateAdvertisedReadiness: jest.fn(),
      getRuntimeState: jest.fn().mockReturnValue("not_initialized"),
    } as any as CardanoService;

    // After createAndAttach, advertise ready for the target.
    restoreFromKeyStore.mockImplementation(async () => {
      (mockCardano.isInitialized as jest.Mock).mockReturnValue(true);
      (mockCardano.isReady as jest.Mock).mockReturnValue(true);
      (mockCardano.isReadyForChain as jest.Mock).mockImplementation(
        (id: string) => id === "cardano-mainnet"
      );
      (mockCardano.getBoundChainId as jest.Mock).mockReturnValue(
        "cardano-mainnet"
      );
      (mockCardano.getRuntimeState as jest.Mock).mockReturnValue("ready");
    });

    const keyRingService = new KeyRingService(
      new MemoryKVStore("test-kr"),
      CARDANO_TEST_CHAINS,
      {} as any,
      mockCardano
    );

    keyRingService.init(
      {} as any,
      chainsService,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    keyRingService["keyRing"] = {
      status: KeyRingStatus.UNLOCKED,
      getCurrentKeyStore: jest.fn().mockReturnValue({
        type: "mnemonic",
        meta: { mnemonicLength: "24" },
      }),
      currentPassword: "pw",
    } as any;

    const supervisor = keyRingService["cardanoRuntimeSupervisor"];
    expect(supervisor?.getOwnerChainId()).toBe("cardano-mainnet");
    expect(supervisor?.getOwnerRevision()).toBe(4);

    await keyRingService.ensureCardanoServiceReady("cardano-mainnet");
    expect(restoreFromKeyStore).toHaveBeenCalledTimes(1);

    // Same selection again must not re-create (already ready).
    await keyRingService.ensureCardanoServiceReady("cardano-mainnet");
    expect(restoreFromKeyStore).toHaveBeenCalledTimes(1);
  });

  it("init without authority leaves supervisor unset so legacy ensure works", async () => {
    const chainsService = createTestChainsService(CARDANO_TEST_CHAINS);
    expect(chainsService.hasNetworkAuthority()).toBe(false);
    chainsService["selectedChainId"] = "cardano-mainnet";
    chainsService["switchGeneration"] = 1;

    let ready = false;
    let bound: string | undefined;
    const restoreFromKeyStore = jest.fn().mockImplementation(async () => {
      ready = true;
      bound = "cardano-mainnet";
    });
    const mockCardano = {
      reset: jest.fn(),
      restoreFromKeyStore,
      isInitialized: jest.fn().mockImplementation(() => ready),
      isReady: jest.fn().mockImplementation(() => ready),
      isReadyForChain: jest
        .fn()
        .mockImplementation((id: string) => ready && bound === id),
      isKeyAgentReady: jest.fn().mockReturnValue(false),
      getBoundChainId: jest.fn().mockImplementation(() => bound),
      getAttachedRuntimeInstanceId: jest.fn().mockReturnValue(undefined),
      disposeRuntimeIfInstance: jest.fn().mockReturnValue(false),
      invalidateAdvertisedReadiness: jest.fn(),
      getRuntimeState: jest
        .fn()
        .mockImplementation(() => (ready ? "ready" : "not_initialized")),
    } as any as CardanoService;

    const keyRingService = new KeyRingService(
      new MemoryKVStore("test-kr-legacy"),
      CARDANO_TEST_CHAINS,
      {} as any,
      mockCardano
    );

    keyRingService.init(
      {} as any,
      chainsService,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    expect(keyRingService["cardanoRuntimeSupervisor"]).toBeUndefined();

    keyRingService["keyRing"] = {
      status: KeyRingStatus.UNLOCKED,
      getCurrentKeyStore: jest.fn().mockReturnValue({
        type: "mnemonic",
        meta: { mnemonicLength: "24" },
      }),
      currentPassword: "pw",
    } as any;

    await keyRingService.ensureCardanoServiceReady("cardano-mainnet");
    expect(restoreFromKeyStore).toHaveBeenCalledTimes(1);
  });
});

describe("CardanoService advertised readiness", () => {
  it("invalidateAdvertisedReadiness makes isReady false while manager still present", () => {
    const service = new CardanoService();
    service["keyRing"] = {
      isTransactionReady: () => true,
    } as any;
    service["boundChainId"] = "cardano-mainnet";
    service["advertisedReady"] = true;

    expect(service.isReady()).toBe(true);
    expect(service.isReadyForChain("cardano-mainnet")).toBe(true);

    service.invalidateAdvertisedReadiness();

    expect(service.isReady()).toBe(false);
    expect(service.isReadyForChain("cardano-mainnet")).toBe(false);
    expect(service.getBoundChainId()).toBeUndefined();
  });

  it("host adapter invalidate clears readiness on real CardanoService", () => {
    const service = new CardanoService();
    service["keyRing"] = {
      isTransactionReady: () => true,
    } as any;
    service["boundChainId"] = "cardano-mainnet";
    service["advertisedReady"] = true;

    const host = createCardanoServiceHost(service, async () => undefined);
    host.invalidateAdvertisedReadiness();

    expect(service.isReady()).toBe(false);
    expect(host.isReadyForChain("cardano-mainnet")).toBe(false);
  });
});
