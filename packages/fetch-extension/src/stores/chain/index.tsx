import {
  observable,
  action,
  computed,
  makeObservable,
  flow,
  autorun,
  runInAction,
  toJS,
} from "mobx";

import {
  IChainInfoImpl,
  ChainStore as BaseChainStore,
  DeferInitialQueryController,
  ObservableQuery,
} from "@keplr-wallet/stores";

import {
  ChainInfo,
  ModularChainInfo,
  AppCurrency,
  BitcoinChainInfo,
  StarknetChainInfo,
} from "@keplr-wallet/types";
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
  TokenScanInfo,
  ToggleChainsMsg,
  EnableChainsMsg,
  DismissNewTokenFoundInMainMsg,
  TryUpdateEnabledChainInfosMsg,
  EnableVaultsWithCosmosAddressMsg,
  ClearAllSuggestedChainInfosMsg,
  ClearAllChainEndpointsMsg,
  DisableChainsMsg,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { MessageRequester } from "@keplr-wallet/router";
import { KVStore, toGenerator } from "@keplr-wallet/common";
import { Bech32Address, ChainIdHelper } from "@keplr-wallet/cosmos";
// eslint-disable-next-line import/no-extraneous-dependencies
import { KeyRingStore } from "@keplr-wallet/stores-core";

export type RequiredCurrencyTokenScan = Omit<
  TokenScan,
  "infos" | "dismissedInfos"
> & {
  infos: (Omit<TokenScanInfo, "assets"> & {
    assets: (TokenScan["infos"][number]["assets"][number] & {
      currency: AppCurrency;
    })[];
  })[];
  dismissedInfos?: (Omit<TokenScanInfo, "assets"> & {
    assets: (TokenScan["infos"][number]["assets"][number] & {
      currency: AppCurrency;
    })[];
  })[];
};

const ENABLED_DEFAULT_CHAINIDs = [
  "fetchhub-4",
  "cosmoshub-4",
  "osmosis-1",
  "axelar-dojo-1",
  "injective-1",
  "akashnet-2",
  "1",
  "bip122:000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f:taproot",
];

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
      ...ENABLED_DEFAULT_CHAINIDs.map(
        (chainId) => ChainIdHelper.parse(chainId).identifier
      ),
    ];

    makeObservable(this);

    this.init();
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  async waitUntilInitialized(): Promise<void> {
    if (!this.isInitializing) {
      return;
    }

    return new Promise((resolve) => {
      const disposal = autorun(() => {
        if (!this.isInitializing) {
          resolve();

          if (disposal) {
            disposal();
          }
        }
      });
    });
  }

  @computed
  get tokenScans(): RequiredCurrencyTokenScan[] {
    let res = this._tokenScans.filter((scan) => {
      if (!this.hasChain(scan.chainId) && !this.hasModularChain(scan.chainId)) {
        return false;
      }

      const chainIdentifier = ChainIdHelper.parse(scan.chainId).identifier;
      return !this.enabledChainIdentifiesMap.get(chainIdentifier);
    });

    res = res
      .map((scan) => {
        return {
          ...scan,
          infos: scan.infos
            .map((info) => {
              return {
                ...info,
                assets: info.assets
                  .map((asset) => {
                    if (asset.currency) {
                      return asset;
                    }

                    if (asset.coinMinimalDenom) {
                      if (this.hasChain(scan.chainId)) {
                        const currency = this.getChain(
                          scan.chainId
                        ).findCurrency(asset.coinMinimalDenom);
                        if (currency) {
                          return {
                            ...asset,
                            currency,
                          };
                        }
                      }
                    }

                    return asset;
                  })
                  .filter((asset) => {
                    return !!asset.currency;
                  }),
              };
            })
            .filter((info) => {
              return info.assets.length > 0;
            }),
        };
      })
      .filter((scan) => {
        return scan.infos.length > 0;
      });

    return res as RequiredCurrencyTokenScan[];
  }

  @computed
  get tokenScansWithoutDismissed(): RequiredCurrencyTokenScan[] {
    let res = this._tokenScansWithoutDismissed.filter((scan) => {
      if (!this.hasChain(scan.chainId) && !this.hasModularChain(scan.chainId)) {
        return false;
      }

      const chainIdentifier = ChainIdHelper.parse(scan.chainId).identifier;
      return !this.enabledChainIdentifiesMap.get(chainIdentifier);
    });

    res = res
      .map((scan) => {
        return {
          ...scan,
          infos: scan.infos
            .map((info) => {
              return {
                ...info,
                assets: info.assets
                  .map((asset) => {
                    if (asset.currency) {
                      return asset;
                    }

                    if (asset.coinMinimalDenom) {
                      if (this.hasChain(scan.chainId)) {
                        const currency = this.getChain(
                          scan.chainId
                        ).findCurrency(asset.coinMinimalDenom);
                        if (currency) {
                          return {
                            ...asset,
                            currency,
                          };
                        }
                      }
                    }

                    return asset;
                  })
                  .filter((asset) => {
                    return !!asset.currency;
                  }),
              };
            })
            .filter((info) => {
              return info.assets.length > 0;
            }),
        };
      })
      .filter((scan) => {
        return scan.infos.length > 0;
      });

    return res as RequiredCurrencyTokenScan[];
  }

  @computed
  override get chainInfos(): IChainInfoImpl<ChainInfoWithCoreTypes>[] {
    // Sort by chain name.
    // The first chain has priority to be the first.
    return super.chainInfos.sort((a, b) => {
      const aChainIdentifier = ChainIdHelper.parse(a.chainId).identifier;
      const bChainIdentifier = ChainIdHelper.parse(b.chainId).identifier;

      if (
        aChainIdentifier ===
        ChainIdHelper.parse(this.embedChainInfos[0].chainId).identifier
      ) {
        return -1;
      }
      if (
        bChainIdentifier ===
        ChainIdHelper.parse(this.embedChainInfos[0].chainId).identifier
      ) {
        return 1;
      }

      return a.chainName.trim().localeCompare(b.chainName.trim());
    });
  }

  @computed
  override get modularChainInfos(): ModularChainInfo[] {
    // Sort by chain name.
    // The first chain has priority to be the first.
    return super.modularChainInfos.sort((a, b) => {
      const aChainIdentifier = ChainIdHelper.parse(a.chainId).identifier;
      const bChainIdentifier = ChainIdHelper.parse(b.chainId).identifier;

      if (
        aChainIdentifier ===
        ChainIdHelper.parse(this.embedChainInfos[0].chainId).identifier
      ) {
        return -1;
      }
      if (
        bChainIdentifier ===
        ChainIdHelper.parse(this.embedChainInfos[0].chainId).identifier
      ) {
        return 1;
      }

      return a.chainName.trim().localeCompare(b.chainName.trim());
    });
  }

  /**
   * Group modular chain infos by linked chain ids.
   * For example, bitcoin has separated chain for native segwit and taproot,
   * but they have to be shown as a same chain in some cases.
   *
   * @returns Grouped modular chain infos.
   */
  @computed
  get groupedModularChainInfos(): (ModularChainInfo & {
    linkedModularChainInfos?: ModularChainInfo[];
  })[] {
    const linkedChainInfosByChainKey = new Map<string, ModularChainInfo[]>();
    const groupedModularChainInfos: (ModularChainInfo & {
      linkedModularChainInfos?: ModularChainInfo[];
    })[] = [];

    for (const modularChainInfo of this.modularChainInfos) {
      if ("linkedChainKey" in modularChainInfo) {
        const linkedChainKey = modularChainInfo.linkedChainKey;
        const linkedChainInfos = linkedChainInfosByChainKey.get(linkedChainKey);
        if (linkedChainInfos) {
          linkedChainInfos.push(modularChainInfo);
        } else {
          linkedChainInfosByChainKey.set(linkedChainKey, [modularChainInfo]);
        }
      } else {
        groupedModularChainInfos.push(modularChainInfo);
      }
    }

    for (const linkedChainInfos of linkedChainInfosByChainKey.values()) {
      // 하나의 체인 키에 여러개의 체인이 연결되어 있으면 하나의 체인만 남기고 나머지는 버린다
      // CHECK: 어떤 것이 primary 체인인지 결정할 필요가 있는지? 우선 첫번째 체인을 primary로 설정
      if (linkedChainInfos.length > 1) {
        groupedModularChainInfos.push({
          ...linkedChainInfos[0],
          linkedModularChainInfos: linkedChainInfos.slice(1),
        });
      }
    }

    return groupedModularChainInfos;
  }

  @computed
  protected get enabledChainIdentifiesMap(): Map<string, true> {
    if (this._enabledChainIdentifiers.length === 0) {
      // Should be enabled at least one chain.
      const map = new Map<string, true>();
      map.set(
        ChainIdHelper.parse(this.embedChainInfos[0].chainId).identifier,
        true
      );

      return map;
    }

    const map = new Map<string, true>();
    for (const chainIdentifier of this._enabledChainIdentifiers) {
      map.set(chainIdentifier, true);
    }
    return map;
  }

  get enabledChainIdentifiers(): string[] {
    return this._enabledChainIdentifiers;
  }

  @computed
  get modularChainInfosInUI() {
    return this.modularChainInfos.filter((modularChainInfo) => {
      if ("cosmos" in modularChainInfo && modularChainInfo.cosmos.hideInUI) {
        return false;
      }
      const chainIdentifier = ChainIdHelper.parse(
        modularChainInfo.chainId
      ).identifier;

      return this.enabledChainIdentifiesMap.get(chainIdentifier);
    });
  }

  @computed
  get groupedModularChainInfosInUI() {
    return this.groupedModularChainInfos.filter((modularChainInfo) => {
      if ("cosmos" in modularChainInfo && modularChainInfo.cosmos.hideInUI) {
        return false;
      }

      const chainIdentifier = ChainIdHelper.parse(
        modularChainInfo.chainId
      ).identifier;

      return this.enabledChainIdentifiesMap.get(chainIdentifier);
    });
  }

  // chain info들을 list로 보여줄때 hideInUI인 얘들은 빼고 보여줘야한다
  // property 이름이 얘매해서 일단 이렇게 지었다.
  @computed
  get chainInfosInListUI() {
    return this.chainInfos.filter((chainInfo) => {
      return !chainInfo.hideInUI;
    });
  }

  @computed
  get modularChainInfosInListUI() {
    return this.modularChainInfos.filter((modularChainInfo) => {
      if ("cosmos" in modularChainInfo && modularChainInfo.cosmos.hideInUI) {
        return false;
      }

      return true;
    });
  }

  @computed
  get groupedModularChainInfosInListUI() {
    return this.groupedModularChainInfos.filter((modularChainInfo) => {
      if ("cosmos" in modularChainInfo && modularChainInfo.cosmos.hideInUI) {
        return false;
      }

      return true;
    });
  }

  isEnabledChain(chainId: string): boolean {
    const chainIdentifier = ChainIdHelper.parse(chainId).identifier;
    return this.enabledChainIdentifiesMap.get(chainIdentifier) === true;
  }

  @computed
  protected get chainInfosInListUIMap(): Map<string, true> {
    const map = new Map<string, true>();
    for (const chainInfo of this.chainInfosInListUI) {
      map.set(chainInfo.chainIdentifier, true);
    }
    return map;
  }

  isInChainInfosInListUI(chainId: string): boolean {
    return (
      this.chainInfosInListUIMap.get(
        ChainIdHelper.parse(chainId).identifier
      ) === true
    );
  }

  @flow
  *toggleChainInfoInUI(...chainIds: string[]) {
    if (!this.keyRingStore.selectedKeyInfo) {
      return;
    }

    const msg = new ToggleChainsMsg(
      this.keyRingStore.selectedKeyInfo.id,
      chainIds
    );
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
  }

  @flow
  *enableChainInfoInUI(...chainIds: string[]) {
    if (!this.keyRingStore.selectedKeyInfo) {
      return;
    }

    const msg = new EnableChainsMsg(
      this.keyRingStore.selectedKeyInfo.id,
      chainIds
    );
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
  }

  @flow
  *enableChainInfoInUIWithVaultId(vaultId: string, ...chainIds: string[]) {
    const msg = new EnableChainsMsg(vaultId, chainIds);
    const enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    if (this.keyRingStore.selectedKeyInfo?.id === vaultId) {
      this._enabledChainIdentifiers = enabledChainIdentifiers;
    }
  }

  @flow
  *disableChainInfoInUI(...chainIds: string[]) {
    if (!this.keyRingStore.selectedKeyInfo) {
      return;
    }

    const msg = new DisableChainsMsg(
      this.keyRingStore.selectedKeyInfo.id,
      chainIds
    );
    this._enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
  }

  @flow
  *disableChainInfoInUIWithVaultId(vaultId: string, ...chainIds: string[]) {
    const msg = new DisableChainsMsg(vaultId, chainIds);
    const enabledChainIdentifiers = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );
    if (this.keyRingStore.selectedKeyInfo?.id === vaultId) {
      this._enabledChainIdentifiers = enabledChainIdentifiers;
    }
  }

  @flow
  *dismissNewTokenFoundInMain() {
    const msg = new DismissNewTokenFoundInMainMsg(
      this.keyRingStore.selectedKeyInfo?.id ?? ""
    );

    const res = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    if (this.keyRingStore.selectedKeyInfo?.id === msg.vaultId) {
      this._tokenScans = res.tokenScans;
      this._tokenScansWithoutDismissed = res.tokenScansWithoutDismissed;
    }
  }

  @flow
  protected *init() {
    this._isInitializing = true;

    yield this.keyRingStore.waitUntilInitialized();

    const lastViewChainId = yield* toGenerator(
      this.kvStore.get<string>("extension_last_view_chain_id")
    );

    if (!this.deferChainIdSelect) {
      if (lastViewChainId) {
        this.selectChain(lastViewChainId);
      }
    }

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

    const lastTokenScanRevalidateTimestamp = yield* toGenerator(
      this.kvStore.get<Record<string, number>>(
        "lastTokenScanRevalidateTimestamp"
      )
    );
    if (lastTokenScanRevalidateTimestamp) {
      for (const [key, value] of Object.entries(
        lastTokenScanRevalidateTimestamp
      )) {
        runInAction(() => {
          this._lastTokenScanRevalidateTimestamp.set(key, value);
        });
      }
    }
    autorun(() => {
      autorun(() => {
        const js = toJS(this._lastTokenScanRevalidateTimestamp);
        const obj = Object.fromEntries(js);
        this.kvStore.set<Record<string, number>>(
          "lastTokenScanRevalidateTimestamp",
          obj
        );
      });
    });

    yield Promise.all([
      this.updateChainInfosFromBackground(),
      this.updateEnabledChainIdentifiersFromBackground(),
    ]);

    autorun(() => {
      // Change the enabled chain identifiers when the selected key info is changed.
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

    this._isInitializing = false;

    // Must not wait!!
    if (!this.updateAllChainInfo) {
      this.tryUpdateEnabledChainInfos();
    } else {
      this.tryUpdateAllChainInfos();
    }
  }

  async tryUpdateEnabledChainInfos(): Promise<void> {
    const msg = new TryUpdateEnabledChainInfosMsg();
    const updated = await this.requester.sendMessage(BACKGROUND_PORT, msg);
    if (updated) {
      await this.updateChainInfosFromBackground();
    }
  }

  async tryUpdateAllChainInfos(): Promise<void> {
    const msg = new TryUpdateAllChainInfosMsg();
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
  }

  @flow
  *enableVaultsWithCosmosAddress(chainId: string, bech32Address: string) {
    const msg = new EnableVaultsWithCosmosAddressMsg(chainId, bech32Address);
    const res = yield* toGenerator(
      this.requester.sendMessage(BACKGROUND_PORT, msg)
    );

    const changed = res.find(
      (r) => r.vaultId === this.keyRingStore.selectedKeyInfo?.id
    );
    if (changed) {
      this._enabledChainIdentifiers = changed.newEnabledChains as string[];
    }
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

  // Enabled chains depends on the selected key info.
  // This process is automatically done when the selected key info is changed. (see init())
  // But, if you want to wait until the enabled chains are synced, you can use this getter.
  @computed
  get isEnabledChainsSynced(): boolean {
    return !!(
      this.keyRingStore.selectedKeyInfo &&
      this.keyRingStore.selectedKeyInfo.id ===
        this._lastSyncedEnabledChainsVaultId
    );
  }

  get lastSyncedEnabledChainsVaultId(): string {
    return this._lastSyncedEnabledChainsVaultId;
  }

  // Enabled chains depends on the selected key info.
  // This process is automatically done when the selected key info is changed. (see init())
  // But, if you want to wait until the enabled chains are synced, you can use this method.
  async waitSyncedEnabledChains(): Promise<void> {
    if (
      this.keyRingStore.selectedKeyInfo &&
      this.keyRingStore.selectedKeyInfo.id ===
        this._lastSyncedEnabledChainsVaultId
    ) {
      return;
    }

    return new Promise((resolve) => {
      const disposal = autorun(() => {
        if (
          this.keyRingStore.selectedKeyInfo &&
          this.keyRingStore.selectedKeyInfo.id ===
            this._lastSyncedEnabledChainsVaultId
        ) {
          resolve();

          if (disposal) {
            disposal();
          }
        }
      });
    });
  }

  @computed
  get chainInfosInUI() {
    return this.chainInfos.filter((chainInfo) => {
      if (chainInfo.hideInUI) {
        return false;
      }
      const chainIdentifier = ChainIdHelper.parse(chainInfo.chainId).identifier;
      return this.enabledChainIdentifiesMap.get(chainIdentifier);
    });
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

  protected toChainInfoWithCoreTypes(
    modular: ModularChainInfo
  ): ChainInfoWithCoreTypes {
    let miscChainInfo: any;

    if ("bitcoin" in modular) {
      miscChainInfo = modular.bitcoin as BitcoinChainInfo;
    }

    if ("starknet" in modular) {
      miscChainInfo = modular.starknet as StarknetChainInfo;
    }

    return {
      chainId: modular.chainId,
      chainName: modular.chainName,
      rpc: miscChainInfo.rpc,
      rest: miscChainInfo?.rest || "",
      bip44: miscChainInfo?.bip44 || "",

      currencies: miscChainInfo.currencies,
      feeCurrencies: miscChainInfo.currencies,
      stakeCurrency: {} as any,
      features: [],
      chainSymbolImageUrl: modular.chainSymbolImageUrl,

      bech32Config: Bech32Address.defaultBech32Config(""),
      embedded: true,
    };
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

  // I use Async, Await because it doesn't change the state value.
  async clearClearAllSuggestedChainInfos() {
    const msg = new ClearAllSuggestedChainInfosMsg();
    await this.requester.sendMessage(BACKGROUND_PORT, msg);
  }

  // I use Async, Await because it doesn't change the state value.
  async clearAllChainEndpoints() {
    const msg = new ClearAllChainEndpointsMsg();
    await this.requester.sendMessage(BACKGROUND_PORT, msg);
  }
}
