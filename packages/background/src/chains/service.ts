import {
  ChainInfoWithCoreTypes,
  ChainInfoWithRepoUpdateOptions,
} from "./types";
import {
  AppCurrency,
  ChainInfo,
  ChainInfoWithoutEndpoints,
  FeeCurrency,
  Currency as LegacyCurrency,
  CW20Currency as LegacyCW20Currency,
  Erc20Currency as LegacyERC20Currency,
  IBCCurrency as LegacyIBCCurrency,
} from "@keplr-wallet/types";
import { KVStore, Debouncer, MemoryKVStore } from "@keplr-wallet/common";
import { ChainUpdaterService } from "../updater";
import { InteractionService } from "../interaction";
import { Env, WEBPAGE_PORT } from "@keplr-wallet/router";
import { SuggestChainInfoMsg, SwitchNetworkByChainIdMsg } from "./messages";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { getDefaultFallbackChainId } from "./default-chain";
import { validateBasicChainInfoType } from "@keplr-wallet/chain-validator";
import { getBasicAccessPermissionType, PermissionService } from "../permission";
import { Mutable, Optional } from "utility-types";
import {
  NetworkConfig,
  Currency,
  BaseCurrency,
  NativeCurrency,
  CW20Currency,
  IBCCurrency,
  ERC20Currency,
} from "@fetchai/wallet-types";
import { NetworkAuthority } from "./authority/network-authority";
import {
  NetworkAuthorityCommitObserver,
  NetworkAuthoritySnapshot,
} from "./authority/types";
import {
  NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
  notifyNetworkSurfacesSyncListeners,
} from "./network-surfaces-sync-fanout";

export { NETWORK_SURFACES_SYNC_MESSAGE_TYPE } from "./network-surfaces-sync-fanout";
export {
  addNetworkSurfacesSyncListener,
  notifyNetworkSurfacesSyncListeners,
} from "./network-surfaces-sync-fanout";
export type { NetworkSurfacesSyncPayload } from "./network-surfaces-sync-fanout";

type ChainRemovedHandler = (chainId: string, identifier: string) => void;
type NetworkSwitchHandler = (
  oldChainId: string | undefined,
  newChainId: string
) => Promise<void>;

export class ChainsService {
  protected onChainRemovedHandlers: ChainRemovedHandler[] = [];
  /** @deprecated Prefer NetworkAuthority commit observers. */
  protected onNetworkSwitchHandlers: NetworkSwitchHandler[] = [];

  protected cachedChainInfos: ChainInfoWithCoreTypes[] | undefined;
  protected selectedChainId: string | undefined;
  /**
   * Mirrors committed authority revision after wire-up (legacy name kept for
   * Cardano restore meta / existing call sites).
   */
  private switchGeneration = 0;

  protected chainUpdaterService!: ChainUpdaterService;
  protected interactionService!: InteractionService;
  public permissionService!: PermissionService;

  protected readonly kvStoreForSuggestChain: KVStore;

  private networkAuthority: NetworkAuthority | undefined;
  private authorityUnsubscribers: Array<() => void> = [];

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly embedChainInfos: ChainInfo[],
    protected readonly experimentalOptions: Partial<{
      useMemoryKVStoreForSuggestChain: boolean;
    }> = {}
  ) {
    if (experimentalOptions?.useMemoryKVStoreForSuggestChain) {
      this.kvStoreForSuggestChain = new MemoryKVStore("suggest-chain");
    } else {
      this.kvStoreForSuggestChain = kvStore;
    }
  }

  init(
    chainUpdaterService: ChainUpdaterService,
    interactionService: InteractionService,
    permissionService: PermissionService
  ) {
    this.chainUpdaterService = chainUpdaterService;
    this.interactionService = interactionService;
    this.permissionService = permissionService;
  }

  readonly getChainInfos: () => Promise<ChainInfoWithCoreTypes[]> =
    Debouncer.promise(async () => {
      if (this.cachedChainInfos) {
        return this.cachedChainInfos;
      }

      const chainInfos = this.embedChainInfos.map((chainInfo) => {
        return {
          ...chainInfo,
          embeded: true,
        };
      });
      const embedChainInfoIdentifierMap: Map<string, true | undefined> =
        new Map();
      for (const embedChainInfo of chainInfos) {
        embedChainInfoIdentifierMap.set(
          ChainIdHelper.parse(embedChainInfo.chainId).identifier,
          true
        );
      }

      const suggestedChainInfos: ChainInfoWithCoreTypes[] = (
        await this.getSuggestedChainInfos()
      )
        .filter((chainInfo) => {
          // Filter the overlaped chain info with the embeded chain infos.
          return !embedChainInfoIdentifierMap.get(
            ChainIdHelper.parse(chainInfo.chainId).identifier
          );
        })
        .map((chainInfo: ChainInfo) => {
          return {
            ...chainInfo,
            embeded: false,
          };
        });

      let result: ChainInfoWithCoreTypes[] =
        chainInfos.concat(suggestedChainInfos);

      // Set the updated property of the chain.
      result = await Promise.all(
        result.map(async (chainInfo) => {
          const updated: ChainInfo =
            await this.chainUpdaterService.replaceChainInfo(chainInfo);

          return {
            ...updated,
            embeded: chainInfo.embeded,
          };
        })
      );

      this.cachedChainInfos = result;

      return result;
    });

  async getChainInfosWithoutEndpoints(): Promise<ChainInfoWithoutEndpoints[]> {
    return (await this.getChainInfos()).map<ChainInfoWithoutEndpoints>(
      (chainInfo) => {
        const chainInfoMutable: Mutable<
          Optional<
            ChainInfoWithCoreTypes,
            "rpc" | "rest" | "updateFromRepoDisabled" | "embeded"
          >
        > = {
          ...chainInfo,
        };

        // Should remove fields not related to `ChainInfoWithoutEndpoints`
        delete chainInfoMutable.rpc;
        delete chainInfoMutable.rest;
        delete chainInfoMutable.nodeProvider;

        delete chainInfoMutable.updateFromRepoDisabled;
        delete chainInfoMutable.embeded;

        return chainInfoMutable;
      }
    );
  }

  clearCachedChainInfos() {
    this.cachedChainInfos = undefined;
  }

  private getChainIdentifierSafe(chainId: string): string | undefined {
    try {
      return ChainIdHelper.parse(chainId).identifier;
    } catch {
      return undefined;
    }
  }

  async findChainInfo(
    chainId: string
  ): Promise<ChainInfoWithCoreTypes | undefined> {
    const identifier = this.getChainIdentifierSafe(chainId);
    if (!identifier) {
      return undefined;
    }

    return (await this.getChainInfos()).find(
      (chainInfo) =>
        this.getChainIdentifierSafe(chainInfo.chainId) === identifier
    );
  }

  async getChainInfo(chainId: string): Promise<ChainInfoWithCoreTypes> {
    const chainInfo = (await this.getChainInfos()).find((chainInfo) => {
      return (
        ChainIdHelper.parse(chainInfo.chainId).identifier ===
        ChainIdHelper.parse(chainId).identifier
      );
    });

    if (!chainInfo) {
      throw new Error(`There is no chain info for ${chainId}`);
    }
    return chainInfo;
  }

  getNetworkConfig(chainInfo: ChainInfoWithCoreTypes): NetworkConfig {
    return {
      chainId: chainInfo.chainId,
      chainName: chainInfo.chainName,
      networkType: chainInfo.features?.includes("evm") ? "evm" : "cosmos",
      rpcUrl: chainInfo.rpc,
      grpcUrl: chainInfo.grpcUrl,
      restUrl: chainInfo.rest,
      type: chainInfo.type,
      status: chainInfo.status
        ? chainInfo.status
        : chainInfo.beta
        ? "beta"
        : undefined,
      bip44s: [
        chainInfo.bip44,
        ...(chainInfo.alternativeBIP44s ? chainInfo.alternativeBIP44s : []),
      ],
      bech32Config: chainInfo.bech32Config,
      currencies: this.mapLegacyToNewCurrencies(
        chainInfo.currencies
      ) as Currency[],
      feeCurrencies: this.mapLegacyToNewCurrencies(
        chainInfo.feeCurrencies
      ) as NativeCurrency[],
      stakeCurrency: this.mapLegacyToNewCurrencies([
        chainInfo.stakeCurrency,
      ])[0] as NativeCurrency,
      gasPriceStep: chainInfo.feeCurrencies[0].gasPriceStep,
      features: chainInfo.features,
      explorerUrl: chainInfo.explorerUrl,
      chainSymbolImageUrl: chainInfo.chainSymbolImageUrl,
    };
  }

  mapLegacyToNewCurrencies(
    currencies: AppCurrency[] | FeeCurrency[]
  ): Currency[] | NativeCurrency[] {
    return currencies.map((c) => {
      const baseCurrency = this.getNewBaseCurrency(c);

      if ("type" in c) {
        if (["cw20", "erc20"].includes(c.type) && "contractAddress" in c) {
          return {
            ...baseCurrency,
            type: c.type,
            contractAddress: c.contractAddress,
          } as CW20Currency | ERC20Currency;
        }
      }

      if ("paths" in c && "originChainId" in c && "originCurrency" in c) {
        const ibcCurrency: IBCCurrency = {
          ...baseCurrency,
          type: "ibc",
          paths: c.paths,
          originChainId: c.originChainId,
          originCurrency: undefined,
        };

        if (!c.originCurrency) {
          return ibcCurrency;
        }

        const baseIbcCurrency = this.getNewBaseCurrency(c.originCurrency);

        if (
          "type" in c.originCurrency &&
          "contractAddress" in c.originCurrency
        ) {
          if (c.originCurrency.type === "cw20") {
            return {
              ...ibcCurrency,
              originCurrency: {
                ...baseIbcCurrency,
                type: "cw20",
                contractAddress: c.originCurrency.contractAddress,
              },
            } as IBCCurrency;
          }
        } else {
          return {
            ...ibcCurrency,
            originCurrency: {
              ...baseIbcCurrency,
              type: "native",
            },
          } as IBCCurrency;
        }
      }

      return { ...baseCurrency, denom: c.coinDenom } as NativeCurrency;
    });
  }

  getNewBaseCurrency(c: AppCurrency | FeeCurrency): BaseCurrency {
    return {
      type: "native",
      description: c.description ? c.description : "",
      display: c.display ? c.display : "",
      name: c.name ? c.name : "",
      coinGeckoId: c.coinGeckoId,
      imageUrl: c.coinImageUrl,
      decimals: c.coinDecimals,
      denomUnits: c.denomUnits
        ? c.denomUnits
        : [
            {
              name: c.coinDenom,
              exponent: c.coinDecimals,
            },
            {
              name: c.coinMinimalDenom,
              exponent: 0,
            },
          ],
    };
  }

  mapNewToLegacyCurrencies(
    currencies: Currency[] | NativeCurrency[],
    gasPriceStep?: {
      readonly low: number;
      readonly average: number;
      readonly high: number;
    }
  ): AppCurrency[] | FeeCurrency[] | LegacyCurrency[] {
    return currencies.map((c) => {
      const baseCurrency = this.getLegacyBaseCurrency(c, gasPriceStep);

      if (["cw20", "erc20"].includes(c.type) && "contractAddress" in c) {
        return {
          ...baseCurrency,
          type: c.type,
          contractAddress: c.contractAddress,
        } as LegacyCW20Currency | LegacyERC20Currency;
      }

      if ("paths" in c && "originChainId" in c && "originCurrency" in c) {
        const ibcCurrency: LegacyIBCCurrency = {
          ...baseCurrency,
          paths: c.paths,
          originChainId: c.originChainId,
          originCurrency: undefined,
        };

        if (!c.originCurrency) {
          return ibcCurrency;
        }

        const baseIbcCurrency = this.getLegacyBaseCurrency(
          c.originCurrency,
          gasPriceStep
        );

        if (
          "type" in c.originCurrency &&
          "contractAddress" in c.originCurrency
        ) {
          if (c.originCurrency.type === "cw20") {
            return {
              ...ibcCurrency,
              originCurrency: {
                ...baseIbcCurrency,
                type: "cw20",
                contractAddress: c.originCurrency.contractAddress,
              },
            } as LegacyIBCCurrency;
          }
        } else {
          return {
            ...ibcCurrency,
            originCurrency: {
              ...baseIbcCurrency,
            },
          } as LegacyIBCCurrency;
        }
      }

      return baseCurrency;
    });
  }

  getLegacyBaseCurrency(
    c: Currency | NativeCurrency,
    gasPriceStep?: {
      readonly low: number;
      readonly average: number;
      readonly high: number;
    }
  ): LegacyCurrency | FeeCurrency {
    const legacyBaseCurrency: LegacyCurrency = {
      description: c.description ? c.description : "",
      display: c.display ? c.display : "",
      name: c.name ? c.name : "",
      coinGeckoId: c.coinGeckoId,
      coinImageUrl: c.imageUrl,
      coinDecimals: c.decimals,
      coinDenom:
        c.denomUnits.find((d) => {
          return d.exponent === c.decimals;
        })?.name ?? "unknown",
      coinMinimalDenom:
        c.denomUnits.find((d) => {
          return d.exponent === 0;
        })?.name ?? "unknown",
    };

    if (gasPriceStep) {
      return {
        ...legacyBaseCurrency,
        gasPriceStep,
      } as FeeCurrency;
    }

    return legacyBaseCurrency;
  }

  async getAllNetworks(): Promise<NetworkConfig[]> {
    const chainInfos = await this.getChainInfos();
    return chainInfos.map((chainInfo) => {
      return this.getNetworkConfig(chainInfo);
    });
  }

  async getChainCoinType(chainId: string): Promise<number> {
    const chainInfo = await this.getChainInfo(chainId);

    if (!chainInfo) {
      throw new Error(`There is no chain info for ${chainId}`);
    }

    return chainInfo.bip44.coinType;
  }

  async hasChainInfo(chainId: string): Promise<boolean> {
    return (await this.findChainInfo(chainId)) != null;
  }

  async suggestChainInfo(
    env: Env,
    chainInfo: ChainInfo,
    origin: string
  ): Promise<void> {
    chainInfo = await validateBasicChainInfoType(chainInfo);

    let receivedChainInfo = (await this.interactionService.waitApprove(
      env,
      "/suggest-chain",
      SuggestChainInfoMsg.type(),
      {
        chainInfo,
        origin,
      }
    )) as ChainInfoWithRepoUpdateOptions;

    receivedChainInfo = {
      ...(await validateBasicChainInfoType(receivedChainInfo)),
      // Beta should be from suggested chain info itself.
      beta: chainInfo.beta,
      updateFromRepoDisabled: receivedChainInfo.updateFromRepoDisabled,
    };

    await this.permissionService.addPermission(
      [chainInfo.chainId],
      getBasicAccessPermissionType(),
      [origin]
    );

    await this.addChainInfo(receivedChainInfo);
    // Complete the external request only after registry + selection are committed.
    await this.setSelectedChain(receivedChainInfo.chainId);
  }

  async getSuggestedChainInfos(): Promise<ChainInfoWithRepoUpdateOptions[]> {
    return (
      (await this.kvStoreForSuggestChain.get<ChainInfoWithRepoUpdateOptions[]>(
        "chain-infos"
      )) ?? []
    );
  }

  async addChainInfo(chainInfo: ChainInfoWithRepoUpdateOptions): Promise<void> {
    if (this.networkAuthority) {
      await this.networkAuthority.commitAddChain(chainInfo);
      return;
    }
    await this.commitAddChainInfo(chainInfo);
  }

  /** Registry write only — must run inside the authority FIFO when wired. */
  private async commitAddChainInfo(
    chainInfo: ChainInfoWithRepoUpdateOptions
  ): Promise<void> {
    if (await this.hasChainInfo(chainInfo.chainId)) {
      throw new Error("Same chain is already registered");
    }

    const savedChainInfos =
      (await this.kvStoreForSuggestChain.get<ChainInfoWithRepoUpdateOptions[]>(
        "chain-infos"
      )) ?? [];

    savedChainInfos.push(chainInfo);

    await this.kvStoreForSuggestChain.set<ChainInfoWithRepoUpdateOptions[]>(
      "chain-infos",
      savedChainInfos
    );

    this.clearCachedChainInfos();
  }

  async removeChainInfo(chainId: string): Promise<void> {
    if (!(await this.hasChainInfo(chainId))) {
      throw new Error("Chain is not registered");
    }

    if ((await this.getChainInfo(chainId)).embeded) {
      throw new Error("Can't remove the embedded chain");
    }

    if (this.networkAuthority) {
      await this.networkAuthority.commitRemoveChain(chainId);
      return;
    }

    await this.commitRemoveChainInfo(chainId);
  }

  /** Registry write only — must run inside the authority FIFO when wired. */
  private async commitRemoveChainInfo(chainId: string): Promise<void> {
    if (!(await this.hasChainInfo(chainId))) {
      throw new Error("Chain is not registered");
    }

    if ((await this.getChainInfo(chainId)).embeded) {
      throw new Error("Can't remove the embedded chain");
    }

    const savedChainInfos =
      (await this.kvStoreForSuggestChain.get<ChainInfoWithRepoUpdateOptions[]>(
        "chain-infos"
      )) ?? [];

    const resultChainInfo = savedChainInfos.filter((chainInfo) => {
      return (
        ChainIdHelper.parse(chainInfo.chainId).identifier !==
        ChainIdHelper.parse(chainId).identifier
      );
    });

    await this.kvStoreForSuggestChain.set<ChainInfoWithRepoUpdateOptions[]>(
      "chain-infos",
      resultChainInfo
    );

    this.clearCachedChainInfos();

    // Best-effort cleanup after the registry commit is durable.
    try {
      await this.chainUpdaterService.clearUpdatedProperty(chainId);
    } catch (error) {
      console.warn(
        "[ChainsService] clearUpdatedProperty failed after remove:",
        error
      );
    }

    for (const chainRemovedHandler of this.onChainRemovedHandlers) {
      try {
        chainRemovedHandler(chainId, ChainIdHelper.parse(chainId).identifier);
      } catch (error) {
        console.warn("[ChainsService] chain removed handler failed:", error);
      }
    }
  }

  async getChainEthereumKeyFeatures(
    chainId: string
  ): Promise<{ address: boolean; signing: boolean }> {
    const chainInfo = await this.getChainInfo(chainId);

    if (chainInfo.features?.includes("evm")) {
      return {
        address: true,
        signing: true,
      };
    }

    return {
      address: chainInfo.features?.includes("eth-address-gen") ?? false,
      signing: chainInfo.features?.includes("eth-key-sign") ?? false,
    };
  }

  async addChainByNetwork(
    env: Env,
    networkConfig: NetworkConfig,
    origin: string
  ): Promise<void> {
    const features = networkConfig.features ?? [];

    if (
      networkConfig.networkType === "evm" &&
      !features.find((f) => f === "evm")
    ) {
      features.push("evm");
    }

    let chainInfo: ChainInfo = {
      rpc: networkConfig.rpcUrl,
      rest: networkConfig.restUrl ?? "",
      chainId: networkConfig.chainId,
      chainName: networkConfig.chainName,
      stakeCurrency: this.mapNewToLegacyCurrencies([
        networkConfig.stakeCurrency,
      ])[0],
      currencies: this.mapNewToLegacyCurrencies(networkConfig.currencies),
      feeCurrencies: this.mapNewToLegacyCurrencies(
        networkConfig.feeCurrencies,
        networkConfig.gasPriceStep
      ),
      bech32Config: networkConfig.bech32Config,
      bip44: networkConfig.bip44s[0],
      alternativeBIP44s: networkConfig.bip44s.slice(
        1,
        networkConfig.bip44s.length - 1
      ),
      features,
      beta: networkConfig.status ? networkConfig.status === "beta" : false,
      grpcUrl: networkConfig.grpcUrl,
      type: networkConfig.type,
      status: networkConfig.status,
      explorerUrl: networkConfig.explorerUrl,
      chainSymbolImageUrl: networkConfig.chainSymbolImageUrl,
    };
    chainInfo = await validateBasicChainInfoType(chainInfo);

    let receivedChainInfo = (await this.interactionService.waitApprove(
      env,
      "/add-chain-by-network",
      SuggestChainInfoMsg.type(),
      {
        chainInfo,
        origin,
      }
    )) as ChainInfoWithRepoUpdateOptions;

    receivedChainInfo = {
      ...(await validateBasicChainInfoType(receivedChainInfo)),
      // Beta should be from suggested chain info itself.
      beta: chainInfo.beta,
      updateFromRepoDisabled: receivedChainInfo.updateFromRepoDisabled,
    };

    await this.permissionService.addPermission(
      [chainInfo.chainId],
      getBasicAccessPermissionType(),
      [origin]
    );

    await this.addChainInfo(receivedChainInfo);
    await this.setSelectedChain(receivedChainInfo.chainId);
  }

  async switchChainByChainId(
    env: Env,
    chainId: string,
    origin: string
  ): Promise<void> {
    // Resolve the requested target before approval — selection must not follow
    // an arbitrary interaction result if UI/result is corrupted.
    const requested = await this.findChainInfo(chainId);
    if (!requested) {
      throw new Error(`There is no chain info for ${chainId}`);
    }
    const targetChainId = requested.chainId;

    const approved = await this.interactionService.waitApprove(
      env,
      "/switch-chain-by-chainid",
      SwitchNetworkByChainIdMsg.type(),
      {
        chainId: targetChainId,
        origin,
      }
    );

    if (typeof approved === "string" && approved.length > 0) {
      const approvedCanonical = await this.findChainInfo(approved);
      if (
        !approvedCanonical ||
        ChainIdHelper.parse(approvedCanonical.chainId).identifier !==
          ChainIdHelper.parse(targetChainId).identifier
      ) {
        throw new Error(
          `Approved chain ${approved} does not match requested ${targetChainId}`
        );
      }
    }

    await this.permissionService.addPermission(
      [targetChainId],
      getBasicAccessPermissionType(),
      [origin]
    );
    // Selection must commit before the external switch request resolves.
    await this.setSelectedChain(targetChainId);
  }

  addChainRemovedHandler(handler: ChainRemovedHandler) {
    this.onChainRemovedHandlers.push(handler);
  }

  /**
   * @deprecated Legacy async switch handlers. Prefer authority commit observers.
   * Not used when NetworkAuthority is wired.
   */
  addNetworkSwitchHandler(handler: NetworkSwitchHandler) {
    this.onNetworkSwitchHandlers.push(handler);
  }

  getSwitchGeneration(): number {
    return this.switchGeneration;
  }

  getCommittedRevision(): number {
    return this.switchGeneration;
  }

  /** Sync peek of in-memory selected chain (may be undefined before hydrate). */
  peekSelectedChainId(): string | undefined {
    return this.selectedChainId;
  }

  /**
   * Sync Cardano feature check from cache/embed (no await).
   * Used by RuntimeSupervisor commit observers.
   */
  isCardanoFeatureSync(chainId: string): boolean {
    const identifier = this.getChainIdentifierSafe(chainId);
    if (identifier == null) {
      return false;
    }
    const infos: Array<{ chainId: string; features?: string[] }> =
      this.cachedChainInfos ??
      this.embedChainInfos.map((chainInfo) => ({
        chainId: chainInfo.chainId,
        features: chainInfo.features,
      }));
    const found = infos.find(
      (chainInfo) =>
        this.getChainIdentifierSafe(chainInfo.chainId) === identifier
    );
    return found?.features?.includes("cardano") ?? false;
  }

  getNetworkAuthority(): NetworkAuthority {
    if (!this.networkAuthority) {
      throw new Error("NetworkAuthority is not wired");
    }
    return this.networkAuthority;
  }

  hasNetworkAuthority(): boolean {
    return this.networkAuthority != null;
  }

  subscribeNetworkAuthority(
    observer: NetworkAuthorityCommitObserver
  ): () => void {
    return this.getNetworkAuthority().subscribe(observer);
  }

  /**
   * Attach durable selected-chain authority. Call once during background init
   * before hydrate, together with CardanoRuntimeSupervisor subscription.
   */
  wireNetworkAuthority(options: {
    readLegacyLastViewChainId: () => Promise<string | undefined>;
  }): void {
    if (this.networkAuthority) {
      throw new Error("NetworkAuthority is already wired");
    }

    this.networkAuthority = new NetworkAuthority({
      kvStore: this.kvStore,
      registry: {
        getChainInfos: async () => this.getChainInfos(),
        findCanonicalChainId: async (chainId) => {
          const info = await this.findChainInfo(chainId);
          return info?.chainId;
        },
        commitAddChain: (chainInfo) => this.commitAddChainInfo(chainInfo),
        commitRemoveChain: (chainId) => this.commitRemoveChainInfo(chainId),
      },
      readLegacyLastViewChainId: options.readLegacyLastViewChainId,
      resolveFallbackChainId: (chainInfos) => {
        const fallback = getDefaultFallbackChainId(chainInfos);
        if (!fallback) {
          throw new Error("No chain infos available");
        }
        return fallback;
      },
      publisher: {
        publishInternalSurfacesSync: (snapshot) => {
          this.broadcastNetworkSurfacesSync(snapshot);
        },
        publishWebpageNetworkChanged: (opaqueSeq) => {
          this.interactionService.dispatchEvent(
            WEBPAGE_PORT,
            "network-changed",
            {
              seq: opaqueSeq,
            }
          );
          this.interactionService.dispatchEvent(
            WEBPAGE_PORT,
            "keystore-changed",
            {}
          );
        },
      },
    });

    const unsubscribe = this.networkAuthority.subscribe((snapshot) => {
      this.selectedChainId = snapshot.chainId;
      this.switchGeneration = snapshot.revision;
    });
    this.authorityUnsubscribers.push(unsubscribe);
  }

  async hydrateNetworkAuthority(): Promise<void> {
    const authority = this.getNetworkAuthority();
    await authority.hydrate();
    const snapshot = await authority.getSnapshot();
    this.selectedChainId = snapshot.chainId;
    this.switchGeneration = snapshot.revision;
  }

  async getSelectedChainSnapshot(): Promise<NetworkAuthoritySnapshot> {
    if (this.networkAuthority) {
      return this.networkAuthority.getSnapshot();
    }
    const chainId = await this.getSelectedChain();
    return {
      chainId,
      revision: Math.max(this.switchGeneration, 1),
    };
  }

  async setSelectedChain(chainId: string): Promise<void> {
    if (this.networkAuthority) {
      await this.networkAuthority.select(chainId);
      return;
    }

    await this.setSelectedChainLegacy(chainId);
  }

  /** Internal UI path: returns committed `{ chainId, revision }` ack. */
  async selectChainWithAck(chainId: string): Promise<NetworkAuthoritySnapshot> {
    if (!this.networkAuthority) {
      await this.setSelectedChainLegacy(chainId);
      return {
        chainId: this.selectedChainId as string,
        revision: Math.max(this.switchGeneration, 1),
      };
    }
    return this.networkAuthority.select(chainId);
  }

  private async setSelectedChainLegacy(chainId: string): Promise<void> {
    if (this.selectedChainId !== chainId) {
      const oldChainId = this.selectedChainId;
      this.switchGeneration += 1;
      this.selectedChainId = chainId;
      try {
        for (const handler of this.onNetworkSwitchHandlers) {
          await handler(oldChainId, chainId).catch((error) => {
            console.error("Network switch handler failed:", error);
            throw error;
          });
        }
      } catch (error) {
        this.selectedChainId = oldChainId;
        throw error;
      }
      this.interactionService.dispatchEvent(WEBPAGE_PORT, "network-changed", {
        seq: Date.now(),
      });
      this.interactionService.dispatchEvent(
        WEBPAGE_PORT,
        "keystore-changed",
        {}
      );
    }
  }

  private broadcastNetworkSurfacesSync(
    snapshot: NetworkAuthoritySnapshot
  ): void {
    notifyNetworkSurfacesSyncListeners(snapshot);

    try {
      const g = globalThis as {
        browser?: { runtime?: { sendMessage?: (message: unknown) => unknown } };
        chrome?: { runtime?: { sendMessage?: (message: unknown) => unknown } };
      };
      const rt = g.browser?.runtime ?? g.chrome?.runtime;
      if (!rt?.sendMessage) {
        return;
      }
      const sendMessage = rt.sendMessage as (
        message: unknown
      ) => void | Promise<unknown>;
      const out = sendMessage({
        type: NETWORK_SURFACES_SYNC_MESSAGE_TYPE,
        chainId: snapshot.chainId,
        revision: snapshot.revision,
      });
      if (out && typeof (out as Promise<unknown>).catch === "function") {
        (out as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      // Best-effort fan-out; commit already succeeded.
    }
  }

  private resolveFallbackChainId(chainInfos: ChainInfoWithCoreTypes[]): string {
    const fallback = getDefaultFallbackChainId(chainInfos);
    if (!fallback) {
      throw new Error("No chain infos available");
    }
    return fallback;
  }

  async getSelectedChain(): Promise<string> {
    if (this.networkAuthority) {
      return this.networkAuthority.getSelectedChainId();
    }

    const chainInfos = await this.getChainInfos();

    if (!this.selectedChainId) {
      const fallback = this.resolveFallbackChainId(chainInfos);
      this.selectedChainId = fallback;
      return fallback;
    }

    const selectedIdentifier = this.getChainIdentifierSafe(
      this.selectedChainId
    );
    const exists =
      selectedIdentifier != null &&
      chainInfos.some(
        (chainInfo) =>
          this.getChainIdentifierSafe(chainInfo.chainId) === selectedIdentifier
      );

    if (exists) {
      return this.selectedChainId;
    }

    const fallback = this.resolveFallbackChainId(chainInfos);

    console.warn(
      `[ChainsService] selected chain ${this.selectedChainId} is no longer available, fallback to ${fallback}`
    );

    this.selectedChainId = fallback;
    return fallback;
  }
}
