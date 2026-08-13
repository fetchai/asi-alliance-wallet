import {
  observable,
  action,
  computed,
  makeObservable,
  flow,
  flowResult,
  runInAction,
} from "mobx";

import {
  ChainInfoInner,
  ChainStore as BaseChainStore,
  DeferInitialQueryController,
  ObservableQuery,
} from "@keplr-wallet/stores";

import { ChainInfo } from "@keplr-wallet/types";
import {
  ChainInfoWithCoreTypes,
  GetNetworkProjectionMsg,
  RemoveSuggestedChainInfoMsg,
  TryUpdateChainMsg,
  SetChainEndpointsMsg,
  ResetChainEndpointsMsg,
  SuggestChainInfoMsg,
  SelectSelectedChainMsg,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";

import { MessageRequester } from "@keplr-wallet/router";
import {
  KVStore,
  toGenerator,
  createNetworkProjectionController,
  createProjectionHydrationGate,
  applyNetworkProjectionBundle,
  armEndpointsQueryRefresh,
  createEndpointsQueryRefreshLatch,
  disarmEndpointsQueryRefresh,
  noteEndpointsMutationSyncOutcome,
  shouldRefreshQueriesOnAcceptedApply,
  type EndpointsQueryRefreshLatch,
  type NetworkProjectionController,
  type ProjectionHydrationGate,
  type ProjectionApplyResult,
  type ProjectionSyncOutcome,
} from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { selectChainAndPersistWiring } from "./select-chain-and-persist-wiring";
import { getDefaultFallbackChainId } from "@keplr-wallet/background/cardano-chain-policy";

export class ChainStore extends BaseChainStore<ChainInfoWithCoreTypes> {
  @observable
  protected _selectedChainId: string;

  /** 0 = placeholder / not yet projected from background. */
  @observable
  protected _acceptedRevision: number = 0;

  @observable
  protected _isInitializing: boolean = false;

  @observable
  protected chainInfoInUIConfig: {
    disabledChains: string[];
  };

  @observable
  protected _showTestnet: boolean = false;

  protected readonly projectionController: NetworkProjectionController;
  protected readonly projectionHydrationGate: ProjectionHydrationGate;
  protected readonly endpointsQueryRefreshLatch: EndpointsQueryRefreshLatch =
    createEndpointsQueryRefreshLatch();

  constructor(
    protected readonly kvStore: KVStore,
    embedChainInfos: ChainInfo[],
    protected readonly requester: MessageRequester,
    protected readonly deferInitialQueryController: DeferInitialQueryController
  ) {
    super(
      embedChainInfos.map((chainInfo) => {
        return {
          ...chainInfo,
          ...{
            embeded: true,
          },
        };
      })
    );

    this._selectedChainId = embedChainInfos[0].chainId;

    this.chainInfoInUIConfig = {
      disabledChains: [],
    };

    this.projectionController = createNetworkProjectionController({
      pullBundle: () => this.pullProjectionBundle(),
      applyBundle: (bundle) => this.applyProjectionBundle(bundle),
      onPullError: (error) => {
        console.warn("[ChainStore] network projection pull failed:", error);
      },
    });

    this.projectionHydrationGate = createProjectionHydrationGate({
      releaseInitialQueries: () => {
        this.deferInitialQueryController.ready();
      },
      setInitializing: (value) => {
        runInAction(() => {
          this._isInitializing = value;
        });
      },
      onFirstSuccess: () => {
        void flowResult(this.finishProjectionBootstrap());
      },
    });

    makeObservable(this);

    this.init();
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  get acceptedRevision(): number {
    return this._acceptedRevision;
  }

  get projectionReady(): boolean {
    return this.projectionController.projectionReady;
  }

  /** One controller per ChainStore; UI surfaces call invalidate/syncNow. */
  getNetworkProjectionController(): NetworkProjectionController {
    return this.projectionController;
  }

  invalidateNetworkProjection(): void {
    this.projectionController.invalidate();
  }

  syncNetworkProjection(): Promise<ProjectionSyncOutcome> {
    return this.projectionController.syncNow();
  }

  cancelPendingNetworkProjectionRetry(): void {
    this.projectionController.cancelPendingRetry();
  }

  @computed
  get chainInfosInUI() {
    return this.enabledChainInfosInUI;
  }

  @computed
  get chainInfosWithUIConfig() {
    return this.chainInfos.map((chainInfo) => {
      if (this.disabledChainInfosInUI.includes(chainInfo)) {
        return {
          chainInfo,
          disabled: true,
        };
      } else {
        return {
          chainInfo,
          disabled: false,
        };
      }
    });
  }

  @computed
  protected get enabledChainInfosInUI() {
    return this.chainInfos.filter(
      (chainInfo) =>
        !this.chainInfoInUIConfig.disabledChains.includes(
          ChainIdHelper.parse(chainInfo.chainId).identifier
        )
    );
  }

  @computed
  get disabledChainInfosInUI() {
    return this.chainInfos.filter((chainInfo) =>
      this.chainInfoInUIConfig.disabledChains.includes(
        ChainIdHelper.parse(chainInfo.chainId).identifier
      )
    );
  }

  @flow
  *toggleChainInfoInUI(chainId: string) {
    chainId = ChainIdHelper.parse(chainId).identifier;
    const enabling = this.chainInfoInUIConfig.disabledChains.includes(chainId);

    let disableChainIds: string[];
    if (enabling) {
      disableChainIds = this.chainInfoInUIConfig.disabledChains.filter(
        (chain) => chain !== chainId
      );
    } else {
      if (this.enabledChainInfosInUI.length === 1) {
        return;
      }

      disableChainIds = [...this.chainInfoInUIConfig.disabledChains, chainId];
    }

    const disablingSelected =
      !enabling &&
      ChainIdHelper.parse(this.current.chainId).identifier === chainId;

    if (disablingSelected) {
      const other = this.chainInfosInUI.find(
        (chainInfo) =>
          ChainIdHelper.parse(chainInfo.chainId).identifier !== chainId
      );

      if (!other) {
        return;
      }

      try {
        yield* this.selectChainAndPersist(other.chainId);
      } catch (error) {
        console.warn(
          "[ChainStore] Failed to switch before disabling chain:",
          error
        );
        return;
      }
    }

    yield this.kvStore.set<{ disabledChains: string[] }>(
      "extension_chainInfoInUIConfig",
      {
        disabledChains: disableChainIds,
      }
    );

    this.chainInfoInUIConfig.disabledChains = disableChainIds;
  }

  get selectedChainId(): string {
    return this._selectedChainId;
  }

  get showTestnet(): boolean {
    return this._showTestnet;
  }

  @flow
  *selectChainAndPersist(chainId: string) {
    yield* selectChainAndPersistWiring(
      {
        sendSelectSelectedChain: (id) => {
          const msg = new SelectSelectedChainMsg(id);
          return this.requester.sendMessage(BACKGROUND_PORT, msg) as Promise<{
            chainId: string;
            revision: number;
          }>;
        },
        syncProjection: () => this.projectionController.syncNow(),
        saveLastViewChainId: () => flowResult(this.saveLastViewChainId()),
      },
      chainId
    );
  }

  dispose(): void {
    this.projectionController.dispose();
  }

  protected async pullProjectionBundle(): Promise<{
    selection: { chainId: string; revision: number };
    chainInfos: ChainInfoWithCoreTypes[];
  }> {
    const msg = new GetNetworkProjectionMsg();
    return this.requester.sendMessage(BACKGROUND_PORT, msg);
  }

  protected applyProjectionBundle(bundle: {
    selection: { chainId: string; revision: number };
    chainInfos: ChainInfoWithCoreTypes[];
  }): ProjectionApplyResult {
    if (this.projectionController.disposed) {
      return "rejected";
    }

    const result = runInAction(() =>
      applyNetworkProjectionBundle(
        {
          getLocalSnapshot: () => ({
            chainId: this._selectedChainId,
            revision: this._acceptedRevision,
          }),
          setLocalSnapshot: (snapshot) => {
            this._selectedChainId = snapshot.chainId;
            this._acceptedRevision = snapshot.revision;
          },
          setChainInfos: (chainInfos) => {
            this.setChainInfos(chainInfos as ChainInfoWithCoreTypes[]);
          },
          onProtocolViolation: (local, incoming) => {
            console.error(
              "[ChainStore] equal revision with different chainId from background",
              {
                local: local.chainId,
                incoming: incoming.chainId,
                revision: incoming.revision,
              }
            );
          },
        },
        {
          selection: bundle.selection,
          chainInfos: bundle.chainInfos,
        }
      )
    );

    if (result === "protocol-violation" || result === "stale") {
      return "rejected";
    }

    this.projectionHydrationGate.onPullSucceeded();
    if (shouldRefreshQueriesOnAcceptedApply(this.endpointsQueryRefreshLatch)) {
      ObservableQuery.refreshAllObserved();
    }
    return "accepted";
  }

  @action
  toggleShowTestnet(value: boolean) {
    this._showTestnet = value;
    this.saveLastViewShowTestnet();
  }

  private hasChainSafe(chainId: string): boolean {
    try {
      return this.hasChain(chainId);
    } catch {
      return false;
    }
  }

  @computed
  get current(): ChainInfoInner<ChainInfoWithCoreTypes> {
    if (this.hasChainSafe(this._selectedChainId)) {
      return this.getChain(this._selectedChainId);
    }

    return this.chainInfos[0];
  }

  @flow
  *saveLastViewChainId() {
    yield this.kvStore.set<string>(
      "extension_last_view_chain_id",
      this._selectedChainId
    );
  }

  @flow
  *saveLastViewShowTestnet() {
    yield this.kvStore.set<boolean>(
      "extension_last_view_show_testnet",
      this._showTestnet
    );
  }

  @flow
  protected *finishProjectionBootstrap() {
    try {
      yield* toGenerator(
        Promise.resolve(flowResult(this.saveLastViewChainId()))
      );
    } catch (error) {
      console.warn(
        "[ChainStore] Failed to persist last-view chain id after projection hydrate:",
        error
      );
    }

    const lastViewShowTestnet = yield* toGenerator(
      this.kvStore.get<boolean>("extension_last_view_show_testnet")
    );

    if (lastViewShowTestnet) {
      this.toggleShowTestnet(lastViewShowTestnet);
    }

    const chainInfoUI = yield* toGenerator(
      this.kvStore.get<{ disabledChains: string[] }>(
        "extension_chainInfoInUIConfig"
      )
    );

    if (chainInfoUI) {
      this.chainInfoInUIConfig.disabledChains =
        chainInfoUI?.disabledChains?.length > 0
          ? chainInfoUI.disabledChains
          : this.chainInfos
              .filter((chainInfo) => chainInfo.hideInUI)
              .map(
                (element) => ChainIdHelper.parse(element.chainId).identifier
              );
    } else {
      this.chainInfoInUIConfig.disabledChains = this.chainInfos
        .filter((chainInfo) => chainInfo.hideInUI)
        .map((element) => ChainIdHelper.parse(element.chainId).identifier);
    }
  }

  @flow
  protected *init() {
    this._isInitializing = true;

    // Do not release queries or clear isInitializing until the first successful
    // authoritative pull (see projectionHydrationGate.onPullSucceeded).
    yield* toGenerator(this.projectionController.syncNow());
  }

  @flow
  *removeChainInfo(chainId: string) {
    if (
      this.hasChainSafe(chainId) &&
      ChainIdHelper.parse(this._selectedChainId).identifier ===
        ChainIdHelper.parse(chainId).identifier
    ) {
      const other = this.chainInfosInUI.find(
        (chainInfo) =>
          ChainIdHelper.parse(chainInfo.chainId).identifier !==
          ChainIdHelper.parse(chainId).identifier
      );
      const fallback =
        other?.chainId ||
        getDefaultFallbackChainId(this.chainInfos) ||
        this.chainInfos.find(
          (c) =>
            ChainIdHelper.parse(c.chainId).identifier !==
            ChainIdHelper.parse(chainId).identifier
        )?.chainId;

      if (!fallback) {
        throw new Error("Can't remove the only available network");
      }

      yield* this.selectChainAndPersist(fallback);
    }

    const msg = new RemoveSuggestedChainInfoMsg(chainId);
    yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg));
    return yield* toGenerator(this.projectionController.syncNow());
  }

  @flow
  *addCustomChainInfo(chainInfo: ChainInfo) {
    const msg = new SuggestChainInfoMsg(chainInfo);
    yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg));
    return yield* toGenerator(this.projectionController.syncNow());
  }

  @flow
  *tryUpdateChain(chainId: string) {
    const msg = new TryUpdateChainMsg(chainId);
    yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg));
    return yield* toGenerator(this.projectionController.syncNow());
  }

  @flow
  *setChainEndpoints(
    chainId: string,
    rpc: string | undefined,
    rest: string | undefined
  ) {
    const msg = new SetChainEndpointsMsg(chainId, rpc, rest);
    // Arm before BG: invalidation fan-out may apply before this flow reaches syncNow.
    armEndpointsQueryRefresh(this.endpointsQueryRefreshLatch);
    try {
      yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg));
    } catch (error) {
      disarmEndpointsQueryRefresh(this.endpointsQueryRefreshLatch);
      throw error;
    }
    const outcome = yield* toGenerator(this.projectionController.syncNow());
    noteEndpointsMutationSyncOutcome(this.endpointsQueryRefreshLatch, outcome);
  }

  @flow
  *resetChainEndpoints(chainId: string) {
    const msg = new ResetChainEndpointsMsg(chainId);
    armEndpointsQueryRefresh(this.endpointsQueryRefreshLatch);
    try {
      yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg));
    } catch (error) {
      disarmEndpointsQueryRefresh(this.endpointsQueryRefreshLatch);
      throw error;
    }
    const outcome = yield* toGenerator(this.projectionController.syncNow());
    noteEndpointsMutationSyncOutcome(this.endpointsQueryRefreshLatch, outcome);
  }
}
