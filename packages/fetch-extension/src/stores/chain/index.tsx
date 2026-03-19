import {
  observable,
  action,
  computed,
  makeObservable,
  flow,
  autorun,
  runInAction,
} from "mobx";

import {
  IChainInfoImpl,
  ChainStore as BaseChainStore,
  DeferInitialQueryController,
  ObservableQuery,
} from "@keplr-wallet/stores";

import { ChainInfo, ModularChainInfo } from "@keplr-wallet/types";
import {
  ChainInfoWithCoreTypes,
  GetChainInfosWithCoreTypesMsg,
  RemoveSuggestedChainInfoMsg,
  SetChainEndpointsMsg,
  ClearChainEndpointsMsg,
  SuggestChainInfoMsg,
  SetSelectedChainMsg,
  TryUpdateAllChainInfosMsg,
  GetEnabledChainIdentifiersMsg,
  GetTokenScansMsg,
  RevalidateTokenScansMsg,
  TokenScan,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { MessageRequester } from "@keplr-wallet/router";
import { KVStore, toGenerator } from "@keplr-wallet/common";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
// eslint-disable-next-line import/no-extraneous-dependencies
import { KeyRingStore } from "@keplr-wallet/stores-core";

export class ChainStore extends BaseChainStore<ChainInfoWithCoreTypes> {
  @observable.ref
  protected _enabledChainIdentifiers: string[] = [];

  @observable.ref
  protected _tokenScans: TokenScan[] = [];
  @observable.ref
  protected _tokenScansWithoutDismissed: TokenScan[] = [];

  @observable
  protected _lastTokenScanRevalidateTimestamp: Map<string, number> = new Map();

  @observable
  protected _selectedChainId: string;

  @observable
  protected _lastSyncedEnabledChainsVaultId: string = "";

  @observable
  protected _isInitializing: boolean = false;
  protected deferChainIdSelect: string = "";

  @observable
  protected chainInfoInUIConfig: {
    disabledChains: string[];
  };

  @observable
  protected _showTestnet: boolean = false;

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly embedChainInfos: (ModularChainInfo | ChainInfo)[],
    protected readonly requester: MessageRequester,
    protected readonly keyRingStore: KeyRingStore,
    protected readonly updateAllChainInfo: boolean,
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

    // Should be enabled at least one chain.
    this._enabledChainIdentifiers = [
      ChainIdHelper.parse(embedChainInfos[0].chainId).identifier,
    ];

    makeObservable(this);

    this.init();
  }

  get isInitializing(): boolean {
    return this._isInitializing;
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
    let disableChainIds = [];

    if (this.chainInfoInUIConfig.disabledChains.includes(chainId)) {
      disableChainIds = this.chainInfoInUIConfig.disabledChains.filter(
        (chain) => chain !== chainId
      );
    } else {
      if (this.enabledChainInfosInUI.length === 1) {
        // Can't turn off all chains.
        return;
      }

      disableChainIds = [...this.chainInfoInUIConfig.disabledChains, chainId];
    }

    yield this.kvStore.set<{ disabledChains: string[] }>(
      "extension_chainInfoInUIConfig",
      {
        disabledChains: disableChainIds,
      }
    );

    this.chainInfoInUIConfig.disabledChains = disableChainIds;

    if (ChainIdHelper.parse(this.current.chainId).identifier === chainId) {
      const other = this.chainInfosInUI.find(
        (chainInfo) =>
          ChainIdHelper.parse(chainInfo.chainId).identifier !== chainId
      );

      if (other) {
        this.selectChain(other.chainId);
        this.saveLastViewChainId();
      }
    }
  }

  get selectedChainId(): string {
    return this._selectedChainId;
  }

  get showTestnet(): boolean {
    return this._showTestnet;
  }

  @action
  selectChain(chainId: string) {
    if (this._isInitializing) {
      this.deferChainIdSelect = chainId;
    }
    this._selectedChainId = chainId;
    const msg = new SetSelectedChainMsg(this._selectedChainId);
    this.requester.sendMessage(BACKGROUND_PORT, msg);
  }

  @action
  toggleShowTestnet(value: boolean) {
    this._showTestnet = value;
    this.saveLastViewShowTestnet();
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
  protected *init() {
    this._isInitializing = true;
    yield this.getChainInfosFromBackground();

    this.deferInitialQueryController.ready();

    const lastViewChainId = yield* toGenerator(
      this.kvStore.get<string>("extension_last_view_chain_id")
    );

    if (!this.deferChainIdSelect) {
      if (lastViewChainId) {
        this.selectChain(lastViewChainId);
      }
    }
    this._isInitializing = false;

    if (this.deferChainIdSelect) {
      this.selectChain(this.deferChainIdSelect);
      this.deferChainIdSelect = "";
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
  protected *getChainInfosFromBackground() {
    const msg = new GetChainInfosWithCoreTypesMsg();
    const result = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    this.setEmbeddedChainInfos(result.chainInfos);
  }

  @flow
  *removeChainInfo(chainId: string) {
    const msg = new RemoveSuggestedChainInfoMsg(chainId);
    const chainInfos = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfos(chainInfos.modularChainInfos);
  }

  @flow
  *addCustomChainInfo(chainInfo: ChainInfo) {
    const msg = new SuggestChainInfoMsg(chainInfo);
    yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg));

    yield this.getChainInfosFromBackground();
  }

  @flow
  *tryUpdateChain(_chainId: string) {
    const msg = new TryUpdateAllChainInfosMsg();
    const result = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    if (result) {
      yield this.getChainInfosFromBackground();
    }
  }

  @flow
  *setChainEndpoints(
    chainId: string,
    rpc: string | undefined,
    rest: string | undefined
  ) {
    const msg = new SetChainEndpointsMsg(chainId, rpc, rest, undefined);
    const newChainInfos = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfos(newChainInfos.chainInfos);

    ObservableQuery.refreshAllObserved();
  }

  @flow
  *resetChainEndpoints(chainId: string) {
    const msg = new ClearChainEndpointsMsg(chainId);
    const newChainInfos = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    this.setEmbeddedChainInfos(newChainInfos.chainInfos);

    ObservableQuery.refreshAllObserved();
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
  }

  @flow
  *updateEnabledChainIdentifiersFromBackground() {
    if (!this.keyRingStore.selectedKeyInfo) {
      this._lastSyncedEnabledChainsVaultId = "";
      return;
    }

    const id = this.keyRingStore.selectedKeyInfo.id;
    const msg = new GetEnabledChainIdentifiersMsg(id);
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    const getTokenScansResult = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, new GetTokenScansMsg(id))
    );

    if (this.keyRingStore.selectedKeyInfo?.id === getTokenScansResult.vaultId) {
      this._tokenScans = getTokenScansResult.tokenScans;
      this._tokenScansWithoutDismissed =
        getTokenScansResult.tokenScansWithoutDismissed;
    }

    (async () => {
      await new Promise<void>((resolve) => {
        const disposal = autorun(() => {
          if (this.keyRingStore.status === "unlocked") {
            resolve();

            if (disposal) {
              disposal();
            }
          }
        });
      });

      const lastTimestamp = this._lastTokenScanRevalidateTimestamp.get(id);
      if (
        lastTimestamp == null ||
        Date.now() - lastTimestamp > 5 * 60 * 60 * 1000
      ) {
        runInAction(() => {
          this._lastTokenScanRevalidateTimestamp.set(id, Date.now());
        });

        const res = await this.requester.sendMessage(
          BACKGROUND_PORT,
          new RevalidateTokenScansMsg(id)
        );

        if (res.vaultId === this.keyRingStore.selectedKeyInfo?.id) {
          runInAction(() => {
            this._tokenScans = res.tokenScans;
            this._tokenScansWithoutDismissed = res.tokenScansWithoutDismissed;
          });
        }
      }
    })();

    this._lastSyncedEnabledChainsVaultId = id;
  }
}
