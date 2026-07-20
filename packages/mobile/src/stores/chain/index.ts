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
  GetChainInfosMsg,
  GetSelectedChainSnapshotMsg,
  RemoveSuggestedChainInfoMsg,
  TryUpdateChainMsg,
  SetChainEndpointsMsg,
  ResetChainEndpointsMsg,
  SelectSelectedChainMsg,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";

import { MessageRequester } from "@keplr-wallet/router";
import { KVStore, toGenerator } from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { getDefaultFallbackChainId } from "@keplr-wallet/background/cardano-chain-policy";
import { selectChainAndPersistWiring } from "./select-chain-and-persist-wiring";
import { startupSyncSelectedChainWiring } from "./startup-sync-selected-chain-wiring";
import { SelectedChainApplyResult } from "./apply-selected-chain-authority";
import { applyBackgroundSelectedChainCore } from "./apply-background-selected-chain-core";
import {
  pickFallbackWhenHidingChains,
  toChainIdentifierSet,
} from "./chain-ui-visibility";

export class ChainStore extends BaseChainStore<ChainInfoWithCoreTypes> {
  @observable
  protected _selectedChainId: string;

  @observable
  protected _acceptedRevision: number = 0;

  @observable
  protected _isInitializing: boolean = false;

  @observable
  protected chainInfoInUIConfig: {
    disabledChains: string[];
  };

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

    makeObservable(this);

    this.init();
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  get acceptedRevision(): number {
    return this._acceptedRevision;
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
      "chain_info_in_ui_config",
      {
        disabledChains: disableChainIds,
      }
    );

    this.chainInfoInUIConfig.disabledChains = disableChainIds;
  }

  @flow
  *toggleMultipleChainInfoInUI(chainIds: string[], isVisible: boolean) {
    let disableChainIds = [...this.chainInfoInUIConfig.disabledChains];
    const hideIdentifiers = toChainIdentifierSet(chainIds);

    for (let chainId of chainIds) {
      chainId = ChainIdHelper.parse(chainId).identifier;

      if (this.chainInfoInUIConfig.disabledChains.includes(chainId)) {
        disableChainIds = disableChainIds.filter((chain) => chain !== chainId);
      }

      if (!isVisible) {
        if (this.enabledChainInfosInUI.length === 1) {
          return;
        }

        disableChainIds.push(chainId);
      }
    }

    const selectedIdentifier = ChainIdHelper.parse(
      this.current.chainId
    ).identifier;
    const hidingSelected =
      !isVisible && hideIdentifiers.has(selectedIdentifier);

    if (hidingSelected) {
      const otherChainId = pickFallbackWhenHidingChains(
        this.chainInfosInUI.map((c) => c.chainId),
        chainIds
      );

      if (!otherChainId) {
        return;
      }

      try {
        yield* this.selectChainAndPersist(otherChainId);
      } catch (error) {
        console.warn(
          "[ChainStore] Failed to switch before disabling chains:",
          error
        );
        return;
      }
    }

    yield this.kvStore.set<{ disabledChains: string[] }>(
      "chain_info_in_ui_config",
      {
        disabledChains: disableChainIds,
      }
    );

    this.chainInfoInUIConfig.disabledChains = disableChainIds;
  }

  get selectedChainId(): string {
    return this._selectedChainId;
  }

  /**
   * Explicit selection must use selectChainAndPersist. Fire-and-forget wrapper
   * still goes through ack; callers that care about errors should await Persist.
   */
  @action
  selectChain(chainId: string) {
    void flowResult(this.selectChainAndPersist(chainId)).catch((error) => {
      console.warn("[ChainStore] selectChain failed:", error);
    });
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
        tryApplyBackgroundSelectedChain: (id, revision) =>
          flowResult(this.applyBackgroundSelectedChain(id, revision)),
        saveLastViewChainId: () => flowResult(this.saveLastViewChainId()),
      },
      chainId
    );
  }

  /**
   * Apply a background snapshot to local projection. Refreshes chain infos when
   * the selected chain is not yet known locally. Revision is re-checked after
   * every await before mutating local state.
   */
  @flow
  *applyBackgroundSelectedChain(
    chainId: string,
    revision: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Generator<any, SelectedChainApplyResult, any> {
    return (yield* toGenerator(
      applyBackgroundSelectedChainCore(
        {
          getLocalSnapshot: () => ({
            chainId: this._selectedChainId,
            revision: this._acceptedRevision,
          }),
          setLocalSnapshot: (snapshot) => {
            runInAction(() => {
              this._selectedChainId = snapshot.chainId;
              this._acceptedRevision = snapshot.revision;
            });
          },
          hasChain: (id) => this.hasChainSafe(id),
          refreshRegistry: () => flowResult(this.getChainInfosFromBackground()),
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
          onMissingChain: (missingId) => {
            console.warn(
              "[ChainStore] background selected chain is not in local registry:",
              missingId
            );
          },
        },
        { chainId, revision }
      )
    )) as SelectedChainApplyResult;
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
    yield this.kvStore.set<string>("last_view_chain_id", this._selectedChainId);
  }

  /**
   * Read the current background snapshot and apply locally. Used for live
   * catch-up after subscribe (including Provider remount). Never writes.
   */
  @flow
  *catchUpSelectedChainFromBackground() {
    const msg = new GetSelectedChainSnapshotMsg();
    const snapshot = (yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    )) as { chainId: string; revision: number };

    yield* toGenerator(
      flowResult(
        this.applyBackgroundSelectedChain(snapshot.chainId, snapshot.revision)
      )
    );
  }

  @flow
  protected *init() {
    this._isInitializing = true;
    yield this.getChainInfosFromBackground();

    this.deferInitialQueryController.ready();

    yield* startupSyncSelectedChainWiring({
      getBackgroundSnapshot: () => {
        const msg = new GetSelectedChainSnapshotMsg();
        return this.requester.sendMessage(BACKGROUND_PORT, msg) as Promise<{
          chainId: string;
          revision: number;
        }>;
      },
      tryApplyBackgroundSelectedChain: (chainId, revision) =>
        flowResult(this.applyBackgroundSelectedChain(chainId, revision)),
    });

    // Cosmetic last-view mirror after successful projection; never drives authority.
    try {
      yield* toGenerator(
        Promise.resolve(flowResult(this.saveLastViewChainId()))
      );
    } catch (error) {
      console.warn(
        "[ChainStore] Failed to persist last-view chain id after startup sync:",
        error
      );
    }

    this._isInitializing = false;

    const chainInfoUI = yield* toGenerator(
      this.kvStore.get<{ disabledChains: string[] }>("chain_info_in_ui_config")
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
  public *getChainInfosFromBackground() {
    const msg = new GetChainInfosMsg();
    const result = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    this.setChainInfos(result.chainInfos);
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
    const chainInfos = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setChainInfos(chainInfos);
  }

  @flow
  *tryUpdateChain(chainId: string) {
    const msg = new TryUpdateChainMsg(chainId);
    const result = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    if (result.updated) {
      yield this.getChainInfosFromBackground();
    }
  }

  @flow
  *setChainEndpoints(
    chainId: string,
    rpc: string | undefined,
    rest: string | undefined
  ) {
    const msg = new SetChainEndpointsMsg(chainId, rpc, rest);
    const newChainInfos = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setChainInfos(newChainInfos);

    ObservableQuery.refreshAllObserved();
  }

  @flow
  *resetChainEndpoints(chainId: string) {
    const msg = new ResetChainEndpointsMsg(chainId);
    const newChainInfos = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setChainInfos(newChainInfos);

    ObservableQuery.refreshAllObserved();
  }
}
