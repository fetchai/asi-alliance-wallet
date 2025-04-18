import { ChainStore } from "./chain";
import { CommunityChainInfoRepo, EmbedChainInfos } from "../config";
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
  ICNSQueries,
  GeneralPermissionStore,
  FNSQueries,
  EthereumAccount,
  ChatStore,
  ProposalStore,
  ActivityStore,
  TokenGraphStore,
} from "@keplr-wallet/stores";
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
      ICNSQueries,
      FNSQueries,
      EvmQueries
    ]
  >;
  public readonly accountStore: AccountStore<
    [CosmosAccount, CosmwasmAccount, SecretAccount, EthereumAccount]
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
        },
      },
      "scrypt",
      this.chainStore,
      new InExtensionMessageRequester(),
      this.interactionStore
    );

    this.ibcChannelStore = new IBCChannelStore(
      new ExtensionKVStore("store_ibc_channel")
    );

    this.permissionStore = new PermissionStore(
      this.interactionStore,
      new InExtensionMessageRequester()
    );
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
      ICNSQueries.use(),
      FNSQueries.use(),
      EvmQueries.use()
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

    this.accountStore = new AccountStore(
      window,
      this.chainStore,
      this.activityStore,
      this.tokenGraphStore,
      this.accountBaseStore,
      () => {
        return {
          suggestChain: false,
          autoInit: true,
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
      })
    );

    if (!window.location.href.includes("#/unlock")) {
      // Start init for registered chains so that users can see account address more quickly.
      for (const chainInfo of this.chainStore.chainInfos) {
        const account = this.accountStore.getAccount(chainInfo.chainId);
        // Because {autoInit: true} is given as the default option above,
        // initialization for the account starts at this time just by using getAccount().
        // However, run safe check on current status and init if status is not inited.
        if (account.walletStatus === WalletStatus.NotInit) {
          account.init();
        }
      }
    } else {
      // When the unlock request sent from external webpage,
      // it will open the extension popup below the uri "/unlock".
      // But, in this case, if the prefetching option is true, it will redirect
      // the page to the "/unlock" with **interactionInternal=true**
      // because prefetching will request the unlock from the internal.
      // To prevent this problem, just check the first uri is "#/unlcok" and
      // if it is "#/unlock", don't use the prefetching option.
    }

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
}

export function createRootStore() {
  return new RootStore();
}
