import { ChainsService } from "./service";
import { MemoryKVStore } from "@keplr-wallet/common";
import { ChainInfo } from "@keplr-wallet/types";
import { PREFERRED_DEFAULT_CHAIN_ID } from "./default-chain";

export const TEST_EMBED_CHAINS: ChainInfo[] = [
  {
    chainId: PREFERRED_DEFAULT_CHAIN_ID,
    chainName: "Fetchhub",
    features: ["cosmos"],
  } as ChainInfo,
  {
    chainId: "dorado-1",
    chainName: "Dorado",
    features: ["cosmos"],
  } as ChainInfo,
];

const testChainUpdater = {
  replaceChainInfo: async (chainInfo: ChainInfo) => chainInfo,
  clearUpdatedProperty: async (_chainId: string) => undefined,
};

function initTestChainsService(service: ChainsService): ChainsService {
  service.init(
    testChainUpdater as any,
    {
      dispatchEvent: jest.fn(),
    } as any,
    {} as any
  );
  return service;
}

export function createTestChainsService(
  embedChainInfos: ChainInfo[] = TEST_EMBED_CHAINS
): ChainsService {
  return initTestChainsService(
    new ChainsService(new MemoryKVStore("test-chains"), embedChainInfos)
  );
}

/** Wire and hydrate NetworkAuthority for selection/registry commit tests. */
export async function createWiredTestChainsService(
  embedChainInfos: ChainInfo[] = TEST_EMBED_CHAINS,
  options?: {
    readLegacyLastViewChainId?: () => Promise<string | undefined>;
    kvStore?: MemoryKVStore;
  }
): Promise<ChainsService> {
  const service = options?.kvStore
    ? initTestChainsService(new ChainsService(options.kvStore, embedChainInfos))
    : createTestChainsService(embedChainInfos);

  service.wireNetworkAuthority({
    readLegacyLastViewChainId:
      options?.readLegacyLastViewChainId ?? (async () => undefined),
  });
  await service.hydrateNetworkAuthority();
  return service;
}
