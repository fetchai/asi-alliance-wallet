/* eslint-disable @typescript-eslint/no-var-requires */
import { ChainStore } from "./chain";
import { CommunityChainInfoRepo, EmbedChainInfos } from "../config";
import { KeyRingStatus } from "@keplr-wallet/background";
import { setCacheManager } from "@keplr-wallet/common";
import { addressCacheStore } from "../utils/address-cache-store";
import {
  AmplitudeApiKey,
  CoinGeckoAPIEndPoint,
  CoinGeckoGetPrice,
  EthereumEndpoint,
  FiatCurrencies,
  ICNSFrontendLink,
  ICNSInfo,
} from "../config.ui";
import {
  AccountStore,
  ChainSuggestStore,
  ChainSwitchStore,
  AccountSwitchStore,
  CoinGeckoPriceStore,
  CosmosAccount,
  CosmosQueries,
  CosmwasmAccount,
  CosmwasmQueries,
  EvmQueries,
  CardanoQueries,
  NameServiceQueries,
  OsmosisQueries,
  DeferInitialQueryController,
  getKeplrFromWindow,
  IBCChannelStore,
  IBCCurrencyRegsitrar,
  InteractionStore,
  KeyRingStore,
  LedgerInitStore,
  KeystoneStore,
  ObservableQueryBase,
  PermissionStore,
  QueriesStore,
  SecretAccount,
  SecretQueries,
  SignInteractionStore,
  TokensStore,
  WalletStatus,
  ICNSInteractionStore,
  GeneralPermissionStore,
  EthereumAccount,
  ChatStore,
  ProposalStore,
  ActivityStore,
  TokenGraphStore,
} from "@keplr-wallet/stores";

import { CardanoAccount } from "@keplr-wallet/stores";
import {
  KeplrETCQueries,
  GravityBridgeCurrencyRegsitrar,
  AxelarEVMBridgeCurrencyRegistrar,
} from "@keplr-wallet/stores-etc";
import { ExtensionKVStore } from "@keplr-wallet/common";
import {
  ContentScriptEnv,
  ContentScriptGuards,
  ExtensionRouter,
  InExtensionMessageRequester,
  InteractionAddon,
} from "@keplr-wallet/router-extension";
import { APP_PORT } from "@keplr-wallet/router";
import { ChainInfoWithCoreTypes } from "@keplr-wallet/background";
import { FiatCurrency } from "@keplr-wallet/types";
import { UIConfigStore } from "./ui-config";
import { FeeType } from "@keplr-wallet/hooks";
import { AnalyticsStore, NoopAnalyticsClient } from "@keplr-wallet/analytics";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { ExtensionAnalyticsClient } from "../analytics";
import { autorun, flowResult, reaction, runInAction } from "mobx";
import { AddressCacheById } from "../utils/address-cache-store";
import { AddressCacheSyncManager } from "./address-cache-sync-manager";
import { getCardanoChainRepairFallbackIfStale } from "../utils/cardano-chain-repair";

export class RootStore {
  public readonly uiConfigStore: UIConfigStore;
  public readonly chainStore: ChainStore;
  public readonly keyRingStore: KeyRingStore;
  public readonly ibcChannelStore: IBCChannelStore;
  public readonly chatStore: ChatStore;
  public readonly proposalStore: ProposalStore;
  public readonly activityStore: ActivityStore;
  public readonly tokenGraphStore: TokenGraphStore;
  public readonly accountBaseStore: ExtensionKVStore;

  protected readonly interactionStore: InteractionStore;
  public readonly permissionStore: PermissionStore;
  public readonly generalPermissionStore: GeneralPermissionStore;
  public readonly signInteractionStore: SignInteractionStore;
  public readonly ledgerInitStore: LedgerInitStore;
  public readonly keystoneStore: KeystoneStore;
  public readonly chainSuggestStore: ChainSuggestStore;
  public readonly chainSwitchStore: ChainSwitchStore;
  public readonly accountSwitchStore: AccountSwitchStore;
  public readonly icnsInteractionStore: ICNSInteractionStore;

  public readonly queriesStore: QueriesStore<
    [
      CosmosQueries,
      CosmwasmQueries,
      SecretQueries,
      OsmosisQueries,
      KeplrETCQueries,
      NameServiceQueries,
      EvmQueries,
      CardanoQueries
    ]
  >;
  public readonly accountStore: AccountStore<
    [
      CosmosAccount,
      CosmwasmAccount,
      SecretAccount,
      EthereumAccount,
      CardanoAccount
    ]
  >;
  public readonly priceStore: CoinGeckoPriceStore;
  public readonly tokensStore: TokensStore<ChainInfoWithCoreTypes>;

  protected readonly ibcCurrencyRegistrar: IBCCurrencyRegsitrar<ChainInfoWithCoreTypes>;
  protected readonly gravityBridgeCurrencyRegistrar: GravityBridgeCurrencyRegsitrar<ChainInfoWithCoreTypes>;
  protected readonly axelarEVMBridgeCurrencyRegistrar: AxelarEVMBridgeCurrencyRegistrar<ChainInfoWithCoreTypes>;

  public readonly analyticsStore: AnalyticsStore<
    {
      chainId?: string;
      chainIds?: string[];
      chainIdentifier?: string;
      chainIdentifiers?: string[];
      chainName?: string;
      toChainId?: string;
      toChainName?: string;
      registerType?: "seed" | "google" | "ledger" | "keystone" | "qr";
      feeType?: FeeType | undefined;
      rpc?: string;
      rest?: string;
      tabName?: string;
      pageName?: string;
      isClaimAll?: boolean;
      selectedPrivacySetting?: string;
      readReceipt?: boolean;
      message?: string;
      action?: string;
      accountType?: string;
      validatorName?: string;
      toValidatorName?: string;
    },
    {
      registerType?: "seed" | "google" | "ledger" | "keystone" | "qr";
      accountType?: "mnemonic" | "privateKey" | "ledger" | "keystone";
      currency?: string;
      language?: string;
      totalAccounts?: number;
    }
  >;

  private readonly _addressCacheSyncManager: AddressCacheSyncManager;
  private _lastChainType: boolean | undefined = undefined;
  private _lastWalletIds: Set<string> | undefined = undefined;
  private _lastWalletStatus: number | undefined = undefined;
  private _walletListSyncGeneration = 0;
  /** Prevents stacked repairs if selectChainAndPersist retriggers this reaction mid-flight. */
  private _cardanoChainRepairInFlight = false;
  private _disposers: Array<() => void> = [];

  constructor() {
    this.chatStore = new ChatStore();
    this.proposalStore = new ProposalStore();
    this.uiConfigStore = new UIConfigStore(
      new ExtensionKVStore("store_ui_config"),
      ICNSInfo,
      ICNSFrontendLink
    );

    const router = new ExtensionRouter(ContentScriptEnv.produceEnv);
    router.addGuard(ContentScriptGuards.checkMessageIsInternal);

    // Initialize the interaction addon service.
    const interactionAddonService =
      new InteractionAddon.InteractionAddonService();
    InteractionAddon.init(router, interactionAddonService);

    // Order is important.
    this.interactionStore = new InteractionStore(
      router,
      new InExtensionMessageRequester()
    );

    // Defer the first queries until chain infos are loaded from the background.
    // Due to custom rpc/lcd features, endpoints may differ from embedded values.
    // If the query is executed immediately on launch, the initial queries that was sent to embedded chain infos endpoints should be canceled
    // and the queries should be executed again with the new endpoints.
    // If you do this, there is a high risk of network waste and unstable behavior.
    // Therefore, we defer the first queries until ready.

    ObservableQueryBase.experimentalDeferInitialQueryController =
      new DeferInitialQueryController();

    this.chainStore = new ChainStore(
      new ExtensionKVStore("store_chain_config"),
      EmbedChainInfos,
      new InExtensionMessageRequester(),
      ObservableQueryBase.experimentalDeferInitialQueryController
    );

    // this.transactionStore = new

    this.keyRingStore = new KeyRingStore(
      {
        dispatchEvent: (type: string) => {
          window.dispatchEvent(new Event(type));
          if (
            type === "fetchwallet_walletstatuschange" ||
            type === "keplr_walletstatuschange"
          ) {
            try {
              const currentStatus = this.keyRingStore.status;
              const lastStatus = this._lastWalletStatus;
              const isLockUnlockTransition =
                lastStatus !== currentStatus &&
                (currentStatus === 1 /* KeyRingStatus.LOCKED */ ||
                  currentStatus === 2) /* KeyRingStatus.UNLOCKED */ &&
                (lastStatus === 1 || lastStatus === 2);

              this._lastWalletStatus = currentStatus;

              if (isLockUnlockTransition) {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const {
                  addressCacheStore,
                } = require("../utils/address-cache-store");
                addressCacheStore.clearAllCaches();
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.keyRingStore.refreshMultiKeyStoreInfo();
              }
            } catch (e) {
              // no-op
            }
          }
        },
      },
      "scrypt",
      this.chainStore,
      new InExtensionMessageRequester(),
      this.interactionStore
    );
    this._addressCacheSyncManager = new AddressCacheSyncManager(
      this.chainStore,
      this.keyRingStore
    );

    this.ibcChannelStore = new IBCChannelStore(
      new ExtensionKVStore("store_ibc_channel")
    );

    this.permissionStore = new PermissionStore(
      this.interactionStore,
      new InExtensionMessageRequester()
    );

    if (typeof window !== "undefined") {
      window.addEventListener("keplr_keystorechange", () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { addressCacheStore } = require("../utils/address-cache-store");
          addressCacheStore.bumpEpoch();
        } catch {
          // no-op
        }
      });
    }
    this.generalPermissionStore = new GeneralPermissionStore(
      this.interactionStore,
      new InExtensionMessageRequester()
    );
    this.signInteractionStore = new SignInteractionStore(this.interactionStore);
    this.ledgerInitStore = new LedgerInitStore(
      this.interactionStore,
      new InExtensionMessageRequester()
    );
    this.keystoneStore = new KeystoneStore(this.interactionStore);
    this.chainSuggestStore = new ChainSuggestStore(
      this.interactionStore,
      CommunityChainInfoRepo
    );
    this.chainSwitchStore = new ChainSwitchStore(this.interactionStore);
    this.accountSwitchStore = new AccountSwitchStore(this.interactionStore);
    this.icnsInteractionStore = new ICNSInteractionStore(this.interactionStore);

    this.queriesStore = new QueriesStore(
      new ExtensionKVStore("store_queries"),
      this.chainStore,
      CosmosQueries.use(),
      CosmwasmQueries.use(),
      SecretQueries.use({
        apiGetter: getKeplrFromWindow,
      }),
      OsmosisQueries.use(),
      KeplrETCQueries.use({
        ethereumURL: EthereumEndpoint,
      }),
      NameServiceQueries.use(),
      EvmQueries.use(),
      CardanoQueries.use()
    );

    this.activityStore = new ActivityStore(
      new ExtensionKVStore("store_activity_config"),
      this.chainStore
    );

    this.tokenGraphStore = new TokenGraphStore(
      new ExtensionKVStore("store_token_graph_config"),
      this.chainStore
    );

    this.accountBaseStore = new ExtensionKVStore("store_account_config");

    this._disposers.push(
      reaction(
        () =>
          this.keyRingStore.multiKeyStoreInfo
            .map((ks) => ks.meta?.["__id__"] || "")
            .filter(Boolean),
        (currentWalletIds) => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { addressCacheStore } = require("../utils/address-cache-store");
          const currentSet = new Set(currentWalletIds);

          if (!this._lastWalletIds) {
            this._lastWalletIds = new Set(currentSet);
            return;
          }

          const lastWalletIds = this._lastWalletIds;
          const hasWalletListChanged =
            currentSet.size !== lastWalletIds.size ||
            !Array.from(currentSet).every((id) => lastWalletIds.has(id));

          if (!hasWalletListChanged) {
            return;
          }

          const generation = ++this._walletListSyncGeneration;
          const allChainIds = Object.keys(addressCacheStore.getAllCaches());
          (async () => {
            for (const chainId of allChainIds) {
              await addressCacheStore.atomicCacheUpdate(
                chainId,
                (currentCache: AddressCacheById) => {
                  const newCache = { ...currentCache };
                  for (const id of currentSet) {
                    if (!lastWalletIds.has(id) && !newCache[id]) {
                      newCache[id] = "";
                    }
                  }
                  for (const id of lastWalletIds) {
                    if (!currentSet.has(id)) {
                      delete newCache[id];
                    }
                  }
                  return { newCache, result: newCache };
                }
              );
            }
            runInAction(() => {
              if (this._walletListSyncGeneration === generation) {
                this._lastWalletIds = new Set(currentSet);
              }
            });
          })();
        },
        { fireImmediately: true }
      )
    );

    // This prevents showing incorrect addresses due to format differences
    this._disposers.push(
      autorun(() => {
        const currentChain = this.chainStore.current;
        const isEvm = currentChain.features?.includes("evm") ?? false;

        if (!this._lastChainType) {
          this._lastChainType = isEvm;
          return;
        }

        const lastChainType = this._lastChainType;
        const hasChainTypeChanged = lastChainType !== isEvm;

        if (hasChainTypeChanged) {
          const { addressCacheStore } = require("../utils/address-cache-store");
          addressCacheStore.clearAllCaches();
        }

        this._lastChainType = isEvm;
      })
    );

    const addressCacheReactionDisposer = reaction(
      () => {
        if (this.keyRingStore.status !== KeyRingStatus.UNLOCKED) {
          return null;
        }
        const currentChainId = this.chainStore.selectedChainId;
        if (!currentChainId) return null;
        const currentWalletIds = this.keyRingStore.multiKeyStoreInfo
          .map((ks) => ks.meta?.["__id__"] || "")
          .filter(Boolean);
        if (currentWalletIds.length === 0) return null;
        return {
          currentChainId,
          currentWalletIds,
          retryEpoch: this._addressCacheSyncManager.retryEpoch,
        };
      },
      (descriptor) => {
        if (descriptor) {
          this._addressCacheSyncManager.schedule({
            currentChainId: descriptor.currentChainId,
            currentWalletIds: descriptor.currentWalletIds,
          });
        }
      },
      { fireImmediately: true }
    );
    this._disposers.push(addressCacheReactionDisposer);

    // Repair layer: recover from stale Cardano selection when the selected wallet must leave Cardano.
    this._disposers.push(
      reaction(
        () => {
          if (this.keyRingStore.status !== KeyRingStatus.UNLOCKED) {
            return null;
          }
          const selected = this.keyRingStore.multiKeyStoreInfo.find(
            (k) => k.selected
          );
          if (!selected) {
            return null;
          }
          return {
            chainId: this.chainStore.selectedChainId,
            walletId: selected.meta?.["__id__"] || "",
          };
        },
        (snap) => {
          if (this._cardanoChainRepairInFlight) {
            return;
          }
          const fallback = getCardanoChainRepairFallbackIfStale(
            snap ?? undefined,
            this.keyRingStore.multiKeyStoreInfo,
            this.chainStore.current,
            this.chainStore.chainInfos
          );
          if (!fallback) {
            return;
          }
          this._cardanoChainRepairInFlight = true;
          void flowResult(this.chainStore.selectChainAndPersist(fallback))
            .catch((e) => {
              console.error(
                "[RootStore] Cardano chain repair (select fallback) failed:",
                e
              );
            })
            .finally(() => {
              this._cardanoChainRepairInFlight = false;
            });
        },
        { fireImmediately: true }
      )
    );

    this.accountStore = new AccountStore(
      window,
      this.chainStore,
      this.activityStore,
      this.tokenGraphStore,
      this.accountBaseStore,
      () => {
        return {
          suggestChain: false,
          autoInit: false, // Changed to false to prevent premature initialization
          getKeplr: getKeplrFromWindow,
        };
      },
      CosmosAccount.use({
        queriesStore: this.queriesStore,
        msgOptsCreator: (chainId) => {
          // In certik, change the msg type of the MsgSend to "bank/MsgSend"
          if (chainId.startsWith("shentu-")) {
            return {
              send: {
                native: {
                  type: "bank/MsgSend",
                },
              },
            };
          }

          // In akash or sifchain, increase the default gas for sending
          if (
            chainId.startsWith("akashnet-") ||
            chainId.startsWith("sifchain")
          ) {
            return {
              send: {
                native: {
                  gas: 120000,
                },
              },
            };
          }

          if (chainId.startsWith("secret-")) {
            return {
              send: {
                native: {
                  gas: 20000,
                },
              },
              withdrawRewards: {
                gas: 25000,
              },
            };
          }

          // For terra related chains
          if (
            chainId.startsWith("bombay-") ||
            chainId.startsWith("columbus-")
          ) {
            return {
              send: {
                native: {
                  type: "bank/MsgSend",
                },
              },
              withdrawRewards: {
                type: "distribution/MsgWithdrawDelegationReward",
              },
            };
          }

          if (chainId.startsWith("evmos_")) {
            return {
              send: {
                native: {
                  gas: 140000,
                },
              },
              withdrawRewards: {
                gas: 200000,
              },
            };
          }

          if (chainId.startsWith("osmosis")) {
            return {
              send: {
                native: {
                  gas: 100000,
                },
              },
              withdrawRewards: {
                gas: 300000,
              },
            };
          }

          if (chainId.startsWith("stargaze-")) {
            return {
              send: {
                native: {
                  gas: 100000,
                },
              },
              withdrawRewards: {
                gas: 200000,
              },
            };
          }
        },
      }),
      CosmwasmAccount.use({
        queriesStore: this.queriesStore,
      }),
      SecretAccount.use({
        queriesStore: this.queriesStore,
        msgOptsCreator: (chainId) => {
          if (chainId.startsWith("secret-")) {
            return {
              send: {
                secret20: {
                  gas: 175000,
                },
              },
              createSecret20ViewingKey: {
                gas: 175000,
              },
            };
          }
        },
      }),
      EthereumAccount.use({
        queriesStore: this.queriesStore,
      }),
      CardanoAccount.use({
        messageRequester: new InExtensionMessageRequester(),
      })
    );

    if (!window.location.href.includes("#/unlock")) {
      // Wait for KeyRing to be fully initialized before initializing accounts
      // This prevents "No keys available" errors during startup
      const initAccountsWhenReady = () => {
        // Only initialize when KeyRing is fully UNLOCKED, not just "not NOTLOADED"
        // This prevents race conditions with Cardano initialization
        if (this.keyRingStore.status === KeyRingStatus.UNLOCKED) {
          const currentChainId = this.chainStore.current.chainId;
          if (currentChainId) {
            const account = this.accountStore.getAccount(currentChainId);
            // Because {autoInit: true} is given as the default option above,
            // initialization for the account starts at this time just by using getAccount().
            // However, run safe check on current status and init if status is not inited.
            if (account.walletStatus === WalletStatus.NotInit) {
              account.init();
            }
          }
        } else {
          // If KeyRing is not ready yet, wait a bit and try again
          setTimeout(initAccountsWhenReady, 100);
        }
      };

      initAccountsWhenReady();
    } else {
      // When the unlock request sent from external webpage,
      // it will open the extension popup below the uri "/unlock".
      // But, in this case, if the prefetching option is true, it will redirect
      // the page to the "/unlock" with **interactionInternal=true**
      // because prefetching will request the unlock from the internal.
      // To prevent this problem, just check the first uri is "#/unlcok" and
      // if it is "#/unlock", don't use the prefetching option.
    }

    this._disposers.push(
      autorun(() => {
        if (this.keyRingStore.status !== KeyRingStatus.UNLOCKED) {
          return;
        }

        const currentChainId = this.chainStore.current.chainId;
        if (!currentChainId) return;

        const account = this.accountStore.getAccount(currentChainId);
        if (account.walletStatus === WalletStatus.NotInit) {
          account.init();
        }
      })
    );

    this.priceStore = new CoinGeckoPriceStore(
      new ExtensionKVStore("store_prices"),
      FiatCurrencies.reduce<{
        [vsCurrency: string]: FiatCurrency;
      }>((obj, fiat) => {
        obj[fiat.currency] = fiat;
        return obj;
      }, {}),
      "usd",
      {
        baseURL: CoinGeckoAPIEndPoint,
        uri: CoinGeckoGetPrice,
      }
    );

    this.tokensStore = new TokensStore(
      window,
      this.chainStore,
      new InExtensionMessageRequester(),
      this.interactionStore
    );

    this.ibcCurrencyRegistrar =
      new IBCCurrencyRegsitrar<ChainInfoWithCoreTypes>(
        new ExtensionKVStore("store_ibc_curreny_registrar"),
        24 * 3600 * 1000,
        this.chainStore,
        this.accountStore,
        this.queriesStore,
        this.queriesStore
      );
    this.gravityBridgeCurrencyRegistrar =
      new GravityBridgeCurrencyRegsitrar<ChainInfoWithCoreTypes>(
        new ExtensionKVStore("store_gravity_bridge_currency_registrar"),
        this.chainStore,
        this.queriesStore
      );
    this.axelarEVMBridgeCurrencyRegistrar =
      new AxelarEVMBridgeCurrencyRegistrar<ChainInfoWithCoreTypes>(
        new ExtensionKVStore("store_axelar_evm_bridge_currency_registrar"),
        this.chainStore,
        this.queriesStore,
        "ethereum"
      );

    // XXX: Remember that userId would be set by `StoreProvider`
    this.analyticsStore = new AnalyticsStore(
      (() => {
        if (
          !AmplitudeApiKey ||
          localStorage.getItem("disable-analytics") === "true"
        ) {
          return new NoopAnalyticsClient();
        } else {
          return new ExtensionAnalyticsClient(AmplitudeApiKey);
        }
      })(),
      {
        logEvent: (eventName, eventProperties) => {
          if (eventProperties?.chainId || eventProperties?.toChainId) {
            eventProperties = {
              ...eventProperties,
            };

            if (eventProperties.chainId) {
              eventProperties.chainId = ChainIdHelper.parse(
                eventProperties.chainId
              ).identifier;
            }

            if (eventProperties.toChainId) {
              eventProperties.toChainId = ChainIdHelper.parse(
                eventProperties.toChainId
              ).identifier;
            }
          }

          return {
            eventName,
            eventProperties,
          };
        },
      }
    );

    router.listen(APP_PORT);
  }

  dispose(): void {
    this._addressCacheSyncManager.dispose();
    this._disposers.forEach((d) => d());
    this._disposers.length = 0;
  }
}

export function createRootStore() {
  setCacheManager(addressCacheStore);

  return new RootStore();
}
