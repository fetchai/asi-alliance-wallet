import { MemoryKVStore } from "@keplr-wallet/common";
import { ChainInfo } from "@keplr-wallet/types";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { PREFERRED_DEFAULT_CHAIN_ID } from "../default-chain";
import { getDefaultFallbackChainId } from "../default-chain";
import { ChainInfoWithRepoUpdateOptions } from "../types";
import { NetworkAuthority } from "./network-authority";
import {
  NetworkAuthorityChainInfo,
  NetworkAuthorityCommitObserver,
  NetworkAuthorityPublisher,
  NetworkAuthorityRegistry,
  NetworkAuthoritySnapshot,
} from "./types";

export const AUTHORITY_TEST_CHAINS: NetworkAuthorityChainInfo[] = [
  {
    chainId: PREFERRED_DEFAULT_CHAIN_ID,
    features: ["cosmos"],
  },
  {
    chainId: "dorado-1",
    features: ["cosmos"],
  },
];

export class MemoryAuthorityRegistry implements NetworkAuthorityRegistry {
  private chains: NetworkAuthorityChainInfo[];

  constructor(initial: NetworkAuthorityChainInfo[] = AUTHORITY_TEST_CHAINS) {
    this.chains = initial.map((c) => ({ ...c }));
  }

  async getChainInfos(): Promise<NetworkAuthorityChainInfo[]> {
    return this.chains.map((c) => ({ ...c }));
  }

  async findCanonicalChainId(chainId: string): Promise<string | undefined> {
    let identifier: string;
    try {
      identifier = ChainIdHelper.parse(chainId).identifier;
    } catch {
      return undefined;
    }
    const found = this.chains.find((c) => {
      try {
        return ChainIdHelper.parse(c.chainId).identifier === identifier;
      } catch {
        return false;
      }
    });
    return found?.chainId;
  }

  async commitAddChain(
    chainInfo: ChainInfoWithRepoUpdateOptions
  ): Promise<void> {
    const existing = await this.findCanonicalChainId(chainInfo.chainId);
    if (existing) {
      throw new Error("Same chain is already registered");
    }
    this.chains.push({
      chainId: chainInfo.chainId,
      features: chainInfo.features,
    });
  }

  async commitRemoveChain(chainId: string): Promise<void> {
    const canonical = await this.findCanonicalChainId(chainId);
    if (!canonical) {
      throw new Error("Chain is not registered");
    }
    const identifier = ChainIdHelper.parse(canonical).identifier;
    this.chains = this.chains.filter(
      (c) => ChainIdHelper.parse(c.chainId).identifier !== identifier
    );
  }

  /** Replace the stored chainId string while keeping the same identity. */
  rewriteCanonicalId(fromChainId: string, toChainId: string): void {
    const fromId = ChainIdHelper.parse(fromChainId).identifier;
    if (ChainIdHelper.parse(toChainId).identifier !== fromId) {
      throw new Error("rewriteCanonicalId requires the same chain identity");
    }
    this.chains = this.chains.map((c) =>
      ChainIdHelper.parse(c.chainId).identifier === fromId
        ? { ...c, chainId: toChainId }
        : c
    );
  }

  dropChain(chainId: string): void {
    const identifier = ChainIdHelper.parse(chainId).identifier;
    this.chains = this.chains.filter(
      (c) => ChainIdHelper.parse(c.chainId).identifier !== identifier
    );
  }
}

export type CreateAuthorityOptions = {
  registry?: MemoryAuthorityRegistry;
  kvStore?: MemoryKVStore;
  legacyLastView?: string | undefined;
  observers?: NetworkAuthorityCommitObserver[];
  publisher?: NetworkAuthorityPublisher;
  readLegacy?: () => Promise<string | undefined>;
};

export function createTestNetworkAuthority(
  options: CreateAuthorityOptions = {}
): {
  authority: NetworkAuthority;
  registry: MemoryAuthorityRegistry;
  kvStore: MemoryKVStore;
  publisher: {
    publishInternalSurfacesSync: jest.Mock;
    publishWebpageNetworkChanged: jest.Mock;
  };
} {
  const registry = options.registry ?? new MemoryAuthorityRegistry();
  const kvStore = options.kvStore ?? new MemoryKVStore("test-authority");
  const publisher = {
    publishInternalSurfacesSync: jest.fn(
      options.publisher?.publishInternalSurfacesSync
    ),
    publishWebpageNetworkChanged: jest.fn(
      options.publisher?.publishWebpageNetworkChanged
    ),
  };

  const authority = new NetworkAuthority({
    kvStore,
    registry,
    readLegacyLastViewChainId:
      options.readLegacy ?? (async () => options.legacyLastView),
    resolveFallbackChainId: (infos) =>
      getDefaultFallbackChainId(infos as ChainInfo[]),
    publisher,
  });

  for (const observer of options.observers ?? []) {
    authority.subscribe(observer);
  }

  return { authority, registry, kvStore, publisher };
}

export async function peekStoredSnapshot(
  kvStore: MemoryKVStore
): Promise<NetworkAuthoritySnapshot | undefined> {
  return kvStore.get<NetworkAuthoritySnapshot>(
    NetworkAuthority.SNAPSHOT_KV_KEY
  );
}
