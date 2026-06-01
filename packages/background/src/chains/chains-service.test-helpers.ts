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

export function createTestChainsService(
  embedChainInfos: ChainInfo[] = TEST_EMBED_CHAINS
): ChainsService {
  const service = new ChainsService(
    new MemoryKVStore("test-chains"),
    embedChainInfos
  );
  service.init(
    {
      replaceChainInfo: async (chainInfo: ChainInfo) => chainInfo,
    } as any,
    {
      dispatchEvent: jest.fn(),
    } as any,
    {} as any
  );
  return service;
}
