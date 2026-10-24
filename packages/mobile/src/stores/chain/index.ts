import {
  observable,
  action,
  computed,
  makeObservable,
  flow,
  autorun,
} from "mobx";

import {
  IChainInfoImpl,
  ChainStore as BaseChainStore,
  DeferInitialQueryController,
  ObservableQuery,
} from "@keplr-wallet/stores";
import { ChainInfo } from "@keplr-wallet/types";
import {
  ChainInfoWithCoreTypes,
  GetChainInfosWithCoreTypesMsg,
  RemoveSuggestedChainInfoMsg,
  SetChainEndpointsMsg,
  ClearChainEndpointsMsg,
  TryUpdateAllChainInfosMsg,
  TryUpdateEnabledChainInfosMsg,
  GetEnabledChainIdentifiersMsg,
  ToggleChainsMsg,
  EnableChainsMsg,
  DisableChainsMsg,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT, MessageRequester } from "@keplr-wallet/router";
import { KVStore, toGenerator } from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { KeyRingStore } from "@keplr-wallet/stores-core";

function getDefaultEnabledChainIdentifiers(
  embedChainInfos: readonly ChainInfo[]
): string[] {
  // Match ChainsUIService.enabledChainIdentifiersForVault empty-map behavior:
  // enable every embedded chain that is not hideInUI (at least one must be on).
  const identifiers = embedChainInfos
    .filter((chainInfo) => !chainInfo.hideInUI)
    .map((chainInfo) => ChainIdHelper.parse(chainInfo.chainId).identifier);

  if (identifiers.length > 0) {
    return identifiers;
  }

  return [ChainIdHelper.parse(embedChainInfos[0].chainId).identifier];
}

export class ChainStore extends BaseChainStore<ChainInfoWithCoreTypes> {
  @observable.ref
  protected _enabledChainIdentifiers: string[] = [];

  @observable
  protected _selectedChainId: string;

  @observable
  protected _lastSyncedEnabledChainsVaultId: string = "";

  @observable
  protected _showTestnet: boolean = false;

  @observable
  protected _isInitializing: boolean = false;
  protected deferChainIdSelect: string = "";

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly embedChainInfos: ChainInfo[],
    protected readonly requester: MessageRequester,
    protected readonly keyRingStore: KeyRingStore,
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

    this._enabledChainIdentifiers =
      getDefaultEnabledChainIdentifiers(embedChainInfos);

    makeObservable(this);

    this.init();
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  get enabledChainIdentifiers(): string[] {
    return this._enabledChainIdentifiers;
  }

  @computed
  protected get enabledChainIdentifiesMap(): Map<string, true> {
    if (this._enabledChainIdentifiers.length === 0) {
      const map = new Map<string, true>();
      for (const identifier of getDefaultEnabledChainIdentifiers(
        this.embedChainInfos
      )) {
        map.set(identifier, true);
      }
      return map;
    }

    const map = new Map<string, true>();
    for (const chainIdentifier of this._enabledChainIdentifiers) {
      map.set(chainIdentifier, true);
    }
    return map;
  }

  isEnabledChain(chainId: string): boolean {
    const chainIdentifier = ChainIdHelper.parse(chainId).identifier;
    return this.enabledChainIdentifiesMap.get(chainIdentifier) === true;
  }

  get showTestnet(): boolean {
    return this._showTestnet;
  }

  @action
  toggleShowTestnet(value: boolean) {
    this._showTestnet = value;
    this.saveLastViewShowTestnet();
  }

  /** Enabled cosmos networks for Change Network (aligned with extension). */
  @computed
  get cosmosChainInfosInUI() {
    return this.chainInfos.filter((chainInfo) => {
      // Signing rejects hideInUI chains ("Can't sign for hidden chain").
      if (chainInfo.hideInUI) {
        return false;
      }
      if (chainInfo.beta) {
        return false;
      }
      if (chainInfo.chainId.startsWith("eip155:")) {
        return false;
      }
      if (!this._showTestnet && chainInfo.isTestnet) {
        return false;
      }
      return this.isEnabledChain(chainInfo.chainId);
    });
  }

  // On mobile "hideInUI" only means disabled by default; once enabled in Manage Networks it is shown.
  @computed
  get chainInfosInUI() {
    return this.chainInfos.filter((chainInfo) => {
      const chainIdentifier = ChainIdHelper.parse(chainInfo.chainId).identifier;
      return this.enabledChainIdentifiesMap.get(chainIdentifier);
    });
  }

  @computed
  get chainInfosWithUIConfig() {
    return this.chainInfos.map((chainInfo) => {
      const chainIdentifier = ChainIdHelper.parse(chainInfo.chainId).identifier;
      return {
        chainInfo,
        disabled: !this.enabledChainIdentifiesMap.get(chainIdentifier),
      };
    });
  }

  @computed
  get disabledChainInfosInUI() {
    return this.chainInfos.filter(
      (chainInfo) =>
        !this.enabledChainIdentifiesMap.get(
          ChainIdHelper.parse(chainInfo.chainId).identifier
        )
    );
  }

  get selectedChainId(): string {
    return this._selectedChainId;
  }

  @action
  selectChain(chainId: string) {
    if (this._isInitializing) {
      this.deferChainIdSelect = chainId;
    }
    this._selectedChainId = chainId;
  }

  /** Move off hideInUI / unknown selection so send/sign is not rejected. */
  @action
  protected ensureSelectedChainIsSignable() {
    const current = this.hasChain(this._selectedChainId)
      ? this.getChain(this._selectedChainId)
      : undefined;
    if (current && !current.hideInUI) {
      return;
    }
    const fallback =
      this.chainInfosInUI[0] ??
      this.chainInfos.find((c) => !c.hideInUI) ??
      this.chainInfos[0];
    if (fallback && fallback.chainId !== this._selectedChainId) {
      this._selectedChainId = fallback.chainId;
      this.saveLastViewChainId();
    }
  }

  @computed
  get current(): IChainInfoImpl<ChainInfoWithCoreTypes> {
    if (this.hasChain(this._selectedChainId)) {
      return this.getChain(this._selectedChainId);
    }

    return this.chainInfos[0];
  }

  @flow
  *saveLastViewChainId() {
    yield this.kvStore.set<string>("last_view_chain_id", this._selectedChainId);
  }

  @flow
  *saveLastViewShowTestnet() {
    yield this.kvStore.set<boolean>(
      "mobile_last_view_show_testnet",
      this._showTestnet
    );
  }

  @flow
  *toggleChainInfoInUI(chainId: string) {
    if (!this.keyRingStore.selectedKeyInfo) {
      return;
    }

    const identifier = ChainIdHelper.parse(chainId).identifier;
    const currentlyEnabled = this.isEnabledChain(chainId);
    if (currentlyEnabled && this.chainInfosInUI.length === 1) {
      return;
    }

    const msg = new ToggleChainsMsg(this.keyRingStore.selectedKeyInfo.id, [
      chainId,
    ]);
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    if (
      currentlyEnabled &&
      ChainIdHelper.parse(this.current.chainId).identifier === identifier
    ) {
      const other = this.chainInfosInUI.find(
        (chainInfo) =>
          ChainIdHelper.parse(chainInfo.chainId).identifier !== identifier
      );
      if (other) {
        this.selectChain(other.chainId);
        this.saveLastViewChainId();
      }
    }
  }

  @flow
  *toggleMultipleChainInfoInUI(chainIds: string[], isVisible: boolean) {
    if (!this.keyRingStore.selectedKeyInfo) {
      return;
    }

    if (!isVisible) {
      const remaining = this.chainInfosInUI.filter((chainInfo) => {
        const identifier = ChainIdHelper.parse(chainInfo.chainId).identifier;
        return !chainIds.some(
          (chainId) => ChainIdHelper.parse(chainId).identifier === identifier
        );
      });
      if (remaining.length === 0) {
        return;
      }
    }

    const msg = isVisible
      ? new EnableChainsMsg(this.keyRingStore.selectedKeyInfo.id, chainIds)
      : new DisableChainsMsg(this.keyRingStore.selectedKeyInfo.id, chainIds);

    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    const currentIdentifier = ChainIdHelper.parse(
      this.current.chainId
    ).identifier;
    if (
      chainIds.some(
        (chainId) =>
          ChainIdHelper.parse(chainId).identifier === currentIdentifier
      ) &&
      !this.isEnabledChain(this.current.chainId)
    ) {
      const other = this.chainInfosInUI[0];
      if (other) {
        this.selectChain(other.chainId);
        this.saveLastViewChainId();
      }
    }
  }

  @flow
  protected *init() {
    this._isInitializing = true;

    yield this.keyRingStore.waitUntilInitialized();

    // GetChainInfosWithCoreTypesMsg → ensureUnlockInteractive while locked, which
    // waits on an unlock approval and can stall under the launch cover. Only sync
    // full chain infos once unlocked; enabled identifiers are safe while locked.
    if (this.keyRingStore.status === "unlocked") {
      yield Promise.all([
        this.updateChainInfosFromBackground(),
        this.updateEnabledChainIdentifiersFromBackground(),
      ]);
    } else {
      yield this.updateEnabledChainIdentifiersFromBackground();
    }

    this.deferInitialQueryController.ready();

    const lastViewChainId = yield* toGenerator(
      this.kvStore.get<string>("last_view_chain_id")
    );

    if (!this.deferChainIdSelect) {
      if (lastViewChainId) {
        this.selectChain(lastViewChainId);
      }
    }

    const lastViewShowTestnet = yield* toGenerator(
      this.kvStore.get<boolean>("mobile_last_view_show_testnet")
    );
    if (lastViewShowTestnet) {
      this.toggleShowTestnet(lastViewShowTestnet);
    }

    this._isInitializing = false;

    if (this.deferChainIdSelect) {
      this.selectChain(this.deferChainIdSelect);
      this.deferChainIdSelect = "";
    }

    // Never stay on a hideInUI chain — background signing will reject it.
    this.ensureSelectedChainIsSignable();

    autorun(() => {
      if (this.keyRingStore.selectedKeyInfo) {
        if (
          this._lastSyncedEnabledChainsVaultId ===
          this.keyRingStore.selectedKeyInfo.id
        ) {
          return;
        }
        this.updateEnabledChainIdentifiersFromBackground();
      }
    });

    this.tryUpdateEnabledChainInfos();
  }

  async tryUpdateEnabledChainInfos(): Promise<void> {
    const msg = new TryUpdateEnabledChainInfosMsg();
    const updated = await this.requester.sendMessage(BACKGROUND_PORT, msg);
    if (updated) {
      await this.updateChainInfosFromBackground();
    }
  }

  @flow
  *updateChainInfosFromBackground() {
    const msg = new GetChainInfosWithCoreTypesMsg();
    const result = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    this.setEmbeddedChainInfosV2({
      chainInfos: result.chainInfos,
      modulrChainInfos: result.modulrChainInfos,
    });
    this.ensureSelectedChainIsSignable();
  }

  @flow
  *updateEnabledChainIdentifiersFromBackground() {
    if (!this.keyRingStore.selectedKeyInfo) {
      this._lastSyncedEnabledChainsVaultId = "";
      this._enabledChainIdentifiers = getDefaultEnabledChainIdentifiers(
        this.embedChainInfos
      );
      return;
    }

    const id = this.keyRingStore.selectedKeyInfo.id;
    const msg = new GetEnabledChainIdentifiersMsg(id);
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this._lastSyncedEnabledChainsVaultId = id;
  }

  @flow
  public *getChainInfosFromBackground() {
    yield this.updateChainInfosFromBackground();
  }

  @flow
  *removeChainInfo(chainId: string) {
    const msg = new RemoveSuggestedChainInfoMsg(chainId);
    const result = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfosV2({
      chainInfos: result.chainInfos,
      modulrChainInfos: result.modularChainInfos,
    });
  }

  @flow
  *tryUpdateChain(_chainId: string) {
    const msg = new TryUpdateAllChainInfosMsg();
    const result = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    if (result) {
      yield this.updateChainInfosFromBackground();
    }
  }

  @flow
  *setChainEndpoints(
    chainId: string,
    rpc: string | undefined,
    rest: string | undefined
  ) {
    const msg = new SetChainEndpointsMsg(chainId, rpc, rest, undefined);
    const res = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfosV2({
      chainInfos: res.chainInfos,
      modulrChainInfos: res.modularChainInfos,
    });

    ObservableQuery.refreshAllObserved();
  }

  @flow
  *resetChainEndpoints(chainId: string) {
    const msg = new ClearChainEndpointsMsg(chainId);
    const newChainInfos = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfosV2({
      chainInfos: newChainInfos.chainInfos,
      modulrChainInfos: newChainInfos.modularChainInfos,
    });

    ObservableQuery.refreshAllObserved();
  }
}
