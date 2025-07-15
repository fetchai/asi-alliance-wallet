// popup.tsx

async function startApp() {
  console.log('[DEBUG] Start popup.tsx/startApp');

  // MobX strict mode (if needed)
  const { configure } = await import('mobx');
  configure({ enforceActions: "always" });

  // Import only actually used elements
  const React = (await import('react')).default;
  const ReactDOM = (await import('react-dom')).default;
  const { AppIntlProvider } = await import('./languages');
  await import('./styles/global.scss');
  // HashRouter, Route, Routes, observer are used explicitly below
  const { HashRouter, Route, Routes } = await import('react-router-dom');
  const { observer } = await import('mobx-react-lite');
  const Modal = (await import('react-modal')).default;
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { StoreProvider, useStore } = await import('./stores');
  const { AdditionalIntlMessages, LanguageToFiatCurrency } = await import('./config.ui');
  const { LoadingIndicatorProvider } = await import('@components/loading-indicator');
  const { NotificationProvider, NotificationStoreProvider } = await import('@components/notification');
  const { ConfirmProvider } = await import('@components/confirm');
  const { DropdownContextProvider } = await import('@components-v2/dropdown/dropdown-context');
  const { ChatStoreProvider } = await import('@components/chat/store');
  const { useAutoLockMonitoring } = await import('./use-auto-lock-monitoring');
  const manifest = (await import('./manifest.v2.json')).default;
  const { Keplr } = await import('@keplr-wallet/provider');
  const { InExtensionMessageRequester } = await import('@keplr-wallet/router-extension');
  const { BACKGROUND_PORT } = await import('@keplr-wallet/router');
  const { Banner } = await import('@components/banner');
  const { MainPage } = await import('./pages-new/main');
  const { LockPage } = await import('./pages-new/lock');
  const { RegisterPage } = await import('./pages-new/register');
  const { SendPage } = await import('./pages-new/send');
  const { SetKeyRingPage } = await import('./pages/setting/keyring');
  const { ActivityPage } = await import('./pages-new/activity');
  const { ActivityDetails } = await import('./pages-new/activity/activity-details');
  const { IBCTransferPage } = await import('./pages-new/more/ibc-transfer');
  const { AccessPage, Secret20ViewingKeyAccessPage } = await import('./pages/access');
  const { BridgePage } = await import('./pages-new/bridge');
  const { BridgeHistoryView } = await import('./pages-new/bridge/bridge-history');
  const { SettingPage } = await import('./pages/setting');
  const { KeystoneImportPubkeyPage } = await import('./pages/keystone');
  const { KeystoneSignPage } = await import('./pages/keystone/sign');
  const { MorePage } = await import('./pages-new/more');
  const { MoreLanguagePage } = await import('./pages-new/more/language');
  const { ExportPage } = await import('./pages-new/more/view-mnemonic-seed');
  const { CurrencyPge } = await import('./pages-new/more/currency');
  const { SettingConnectionsPage, SettingSecret20ViewingKeyConnectionsPage } = await import('./pages-new/more/security-privacy/connections');
  const { AddressBookPage } = await import('./pages-new/more/address-book');
  const { ExportToMobilePage } = await import('./pages-new/more/export-to-mobile');
  const { FetchnameService } = await import('./pages/fetch-name-service');
  const { DomainDetails } = await import('./pages/fetch-name-service/domain-details');
  const { DeleteWallet } = await import('./pages-new/keyring-dev/delete');
  const { ChangeNamePageV2 } = await import('./pages-new/keyring-dev/change');
  const { AddTokenPage } = await import('./pages-new/more/token/add');
  const { BuySellTokenPage } = await import('./pages-new/more/token/moonpay');
  const { ManageTokenPage } = await import('./pages-new/more/token/manage');
  const { SettingEndpointsPage } = await import('./pages/setting/endpoints');
  const { AutoLockPage } = await import('./pages-new/more/security-privacy/autolock');
  const { SecurityPrivacyPage } = await import('./pages-new/more/security-privacy');
  const { SignPageV2 } = await import('./pages-new/sign');
  const { ICNSAdr36SignPage } = await import('./pages/icns/sign');
  const { ApproveAddChainByNetworkPage } = await import('./pages/approveAddChainByNetwork');
  const { ApproveSwitchChainPage } = await import('./pages/approveSwitchChainPage');
  const { ApproveSwitchAccountByAddressPage } = await import('./pages/approveSwitchAccountPage');
  const { AxelarBridgeEVM } = await import('./pages/axelar-bridge/axelar-bridge-evm');
  const { AxelarBridgeCosmos } = await import('./pages/axelar-bridge/axelar-bridge-cosmos');
  const { GrantGlobalPermissionGetChainInfosPage } = await import('./pages/permission/grant');
  const { PermissionsGetChainInfosPage } = await import('./pages-new/more/security-privacy/permissions/get-chain-infos');
  const { ChainActivePage } = await import('./pages/setting/chain-active');
  const { AuthZPage } = await import('./pages/authz');
  const { NotificationPage } = await import('./pages/notification');
  const { NotificationOrganizations } = await import('./pages-new/more/notification/notiphy-notification/notification-organizations');
  const { NotificationTopics } = await import('./pages-new/more/notification/notiphy-notification/notification-topics');
  const { ReviewNotification } = await import('./pages-new/more/notification/notiphy-notification/review-notification');
  const { ChatPage } = await import('./pages/chat');
  const { ChatSection } = await import('./pages/chat-section');
  const { NewChat } = await import('./pages/new-chat');
  const { CreateGroupChat } = await import('./pages/group-chat/create-group-chat');
  const { AddMember } = await import('./pages/group-chat/add-member');
  const { EditMember } = await import('./pages/group-chat/edit-member');
  const { ReviewGroupChat } = await import('./pages/group-chat/review-details');
  const { GroupChatSection } = await import('./pages/group-chat/chat-section');
  const { AgentChatSection } = await import('./pages/agent-chat-section');
  const { MoreNotifications } = await import('./pages-new/more/notification');
  const { ChatSettings } = await import('./pages/setting/chat');
  const { BlockList } = await import('./pages/setting/chat/block');
  const { Privacy } = await import('./pages/setting/chat/privacy');
  const { ReadRecipt } = await import('./pages/setting/chat/readRecipt');
  const { Validator } = await import('./pages-new/validator');
  const { Proposals } = await import('./pages-new/more/proposals');
  const { ProposalDetail } = await import('./pages-new/more/proposals/proposal-details');
  const { AddEvmChain } = await import('./pages/setting/addEvmChain');
  const { Receive } = await import('./pages-new/receive');
  const { Portfolio } = await import('./pages-new/portfolio');
  const { AssetView } = await import('./pages-new/asset-view');
  const { ManageNetworks } = await import('./pages-new/more/manage-networks');
  const { Stake } = await import('./pages-new/stake');
  const { ValidatorListPage } = await import('./pages-new/validator-list');
  const { Delegate } = await import('./pages-new/validator/delegate');
  const { Redelegate } = await import('./pages-new/validator/redelegate');
  const { Unstake } = await import('./pages-new/validator/unstake');
  const { KeyRingStatus } = await import('@keplr-wallet/background/src/keyring/keyring');
  const { StartAutoLockMonitoringMsg } = await import('@keplr-wallet/background/src/auto-lock-account/messages');
  const { ErrorBoundary } = await import('./error-boundary');

  window.keplr = new Keplr(
    manifest.version,
    "core",
    new InExtensionMessageRequester()
  );

  Modal.setAppElement("#app");
  Modal.defaultStyles = {
    content: {
      ...Modal.defaultStyles.content,
      minWidth: "300px",
      maxWidth: "600px",
      minHeight: "250px",
      maxHeight: "500px",
      left: "50%",
      right: "auto",
      top: "50%",
      bottom: "auto",
      transform: "translate(-50%, -50%)",
    },
    overlay: {
      zIndex: 1000,
      ...Modal.defaultStyles.overlay,
    },
  };

  console.log('[DEBUG] After Keplr initialization and Modal setup');

  // Logging all fetch requests to .wasm for debugging
  const origFetch = window.fetch;
  window.fetch = function(...args) {
    if (args[0] && typeof args[0] === 'string' && args[0].endsWith('.wasm')) {
      console.log('[DEBUG] WASM fetch:', args[0]);
    }
    return origFetch.apply(this, args);
  };

              // Extract StateRenderer and AutoLockMonitor into separate components
    const StateRenderer = observer(() => {
    const { keyRingStore } = useStore();
    
    // Add initialization debugging
    React.useEffect(() => {
      console.log('[DEBUG] StateRenderer mounted, status:', keyRingStore.status);
      
      // Force initialize status if it's undefined
      if (keyRingStore.status === undefined) {
        console.log('[DEBUG] Status is undefined, waiting for initialization...');
        // Don't call restore() directly as it's protected
        // Instead wait for status to initialize
      }
    }, []);

    React.useEffect(() => {
      console.log('[DEBUG] Status changed to:', keyRingStore.status);
      if (keyRingStore.status === KeyRingStatus.UNLOCKED) {
        // Add delay to ensure wallet is fully unlocked
        setTimeout(() => {
          const msg = new StartAutoLockMonitoringMsg();
          const requester = new InExtensionMessageRequester();
          requester.sendMessage(BACKGROUND_PORT, msg).catch((error) => {
            console.warn('Failed to start auto-lock monitoring:', error);
          });
        }, 100);
      }
    }, [keyRingStore.status]);

    console.log('[DEBUG] KeyRing status in render:', keyRingStore.status);
    
    // Handle undefined status and NOTLOADED
    if (keyRingStore.status === undefined || keyRingStore.status === KeyRingStatus.NOTLOADED) {
      console.log('[DEBUG] Status is undefined or NOTLOADED, showing loading...');
      return (
        <div style={{ height: "100%", backgroundColor: "#030e3b", backgroundSize: "cover", backgroundImage: `url(${require("@assets/svg/wireframe/bg-onboarding.svg")})` }}>
          <Banner icon={require("@assets/png/ASI-Logo-Icon-white.png")} logo="" />
        </div>
      );
    }
    
    // Handle NOTLOADED status first
    if ((keyRingStore.status as any) === 0) { // KeyRingStatus.NOTLOADED
      return (
        <div style={{ height: "100%", backgroundColor: "#030e3b", backgroundSize: "cover", backgroundImage: `url(${require("@assets/svg/wireframe/bg-onboarding.svg")})` }}>
          <Banner icon={require("@assets/png/ASI-Logo-Icon-white.png")} logo="" />
        </div>
      );
    }

    switch (keyRingStore.status) {
      case KeyRingStatus.UNLOCKED:
        return <MainPage />;
      case KeyRingStatus.LOCKED:
        return <LockPage />;
      case KeyRingStatus.EMPTY:
        console.log('[DEBUG] Redirecting to register page');
        browser.tabs.create({ url: "/popup.html#/register" });
        window.close();
        return <Banner icon={require("@assets/logo-256.svg")} logo={require("@assets/brand-text.png")} />;
      default:
        return <div>Unknown status</div>;
    }
  });
  const AutoLockMonitor = observer(() => {
    useAutoLockMonitoring();
    return null;
  });

  const queryClient = new QueryClient();

  // Before rendering the React application
  console.log('[DEBUG] Before ReactDOM.render');
  ReactDOM.render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        StoreProvider,
        null,
        React.createElement(
          AppIntlProvider,
          {
            additionalMessages: AdditionalIntlMessages,
            languageToFiatCurrency: LanguageToFiatCurrency,
          },
          React.createElement(
            LoadingIndicatorProvider,
            null,
            React.createElement(
              NotificationStoreProvider,
              null,
              React.createElement(
                NotificationProvider,
                null,
                React.createElement(
                  ConfirmProvider,
                  null,
                  React.createElement(
                    ErrorBoundary,
                    null,
                    React.createElement(AutoLockMonitor, null),
                    React.createElement(
                      HashRouter,
                      null,
                      React.createElement(
                        DropdownContextProvider,
                        null,
                        React.createElement(
                          ChatStoreProvider,
                          null,
                          React.createElement(
                            Routes,
                            null,
                            React.createElement(Route, { path: '/', element: React.createElement(StateRenderer) }),
                            React.createElement(Route, { path: '/unlock', element: React.createElement(LockPage) }),
                            React.createElement(Route, { path: '/access', element: React.createElement(AccessPage) }),
                            React.createElement(Route, { path: '/access/viewing-key', element: React.createElement(Secret20ViewingKeyAccessPage) }),
                            React.createElement(Route, { path: '/activity-details', element: React.createElement(ActivityDetails) }),
                            React.createElement(Route, { path: '/register', element: React.createElement(RegisterPage) }),
                            React.createElement(Route, { path: '/send', element: React.createElement(SendPage) }),
                            React.createElement(Route, { path: '/ibc-transfer', element: React.createElement(IBCTransferPage) }),
                            React.createElement(Route, { path: '/bridge', element: React.createElement(BridgePage) }),
                            React.createElement(Route, { path: '/bridge-history', element: React.createElement(BridgeHistoryView) }),
                            React.createElement(Route, { path: '/setting', element: React.createElement(SettingPage) }),
                            React.createElement(Route, { path: '/keystone/import-pubkey', element: React.createElement(KeystoneImportPubkeyPage) }),
                            React.createElement(Route, { path: '/keystone/sign', element: React.createElement(KeystoneSignPage) }),
                            React.createElement(Route, { path: '/more', element: React.createElement(MorePage) }),
                            React.createElement(Route, { path: '/more/language', element: React.createElement(MoreLanguagePage) }),
                            React.createElement(Route, { path: '/more/export/:index', element: React.createElement(ExportPage) }),
                            React.createElement(Route, { path: '/more/currency', element: React.createElement(CurrencyPge) }),
                            React.createElement(Route, { path: 'more/security-privacy/connections', element: React.createElement(SettingConnectionsPage) }),
                            React.createElement(Route, { path: '/more/connections/viewing-key/:contractAddress', element: React.createElement(SettingSecret20ViewingKeyConnectionsPage) }),
                            React.createElement(Route, { path: '/more/address-book', element: React.createElement(AddressBookPage) }),
                            React.createElement(Route, { path: '/activity', element: React.createElement(ActivityPage) }),
                            React.createElement(Route, { path: '/more/export-to-mobile', element: React.createElement(ExportToMobilePage) }),
                            React.createElement(Route, { path: '/fetch-name-service/:tab', element: React.createElement(FetchnameService) }),
                            React.createElement(Route, { path: '/fetch-name-service/domain-details/:domain', element: React.createElement(DomainDetails) }),
                            React.createElement(Route, { path: '/setting/set-keyring', element: React.createElement(SetKeyRingPage) }),
                            React.createElement(Route, { path: '/setting/clear/:index', element: React.createElement(DeleteWallet) }),
                            React.createElement(Route, { path: '/setting/keyring/change/name/:index', element: React.createElement(ChangeNamePageV2) }),
                            React.createElement(Route, { path: '/more/token/add', element: React.createElement(AddTokenPage) }),
                            React.createElement(Route, { path: '/more/token/moonpay', element: React.createElement(BuySellTokenPage) }),
                            React.createElement(Route, { path: '/more/token/manage', element: React.createElement(ManageTokenPage) }),
                            React.createElement(Route, { path: '/setting/endpoints', element: React.createElement(SettingEndpointsPage) }),
                            React.createElement(Route, { path: '/more/security-privacy/autolock', element: React.createElement(AutoLockPage) }),
                            React.createElement(Route, { path: '/more/security-privacy', element: React.createElement(SecurityPrivacyPage) }),
                            React.createElement(Route, { path: '/sign', element: React.createElement(SignPageV2) }),
                            React.createElement(Route, { path: '/icns/adr36-signatures', element: React.createElement(ICNSAdr36SignPage) }),
                            React.createElement(Route, { path: '/suggest-chain', element: React.createElement(ChainActivePage) }),
                            React.createElement(Route, { path: '/add-chain-by-network', element: React.createElement(ApproveAddChainByNetworkPage) }),
                            React.createElement(Route, { path: '/switch-chain-by-chainid', element: React.createElement(ApproveSwitchChainPage) }),
                            React.createElement(Route, { path: '/switch-account-by-address', element: React.createElement(ApproveSwitchAccountByAddressPage) }),
                            React.createElement(Route, { path: '/axl-bridge-evm', element: React.createElement(AxelarBridgeEVM) }),
                            React.createElement(Route, { path: '/axl-bridge-cosmos', element: React.createElement(AxelarBridgeCosmos) }),
                            React.createElement(Route, { path: '/permissions/grant/get-chain-infos', element: React.createElement(GrantGlobalPermissionGetChainInfosPage) }),
                            React.createElement(Route, { path: '/more/permissions/get-chain-infos', element: React.createElement(PermissionsGetChainInfosPage) }),
                            React.createElement(Route, { path: '/setting/chain-active', element: React.createElement(ChainActivePage) }),
                            React.createElement(Route, { path: '/authz', element: React.createElement(AuthZPage) }),
                            React.createElement(Route, { path: '/notification', element: React.createElement(NotificationPage) }),
                            React.createElement(Route, { path: '/notification/organisations/:type', element: React.createElement(NotificationOrganizations) }),
                            React.createElement(Route, { path: '/notification/topics/:type', element: React.createElement(NotificationTopics) }),
                            React.createElement(Route, { path: '/notification/review', element: React.createElement(ReviewNotification) }),
                            React.createElement(Route, { path: '/chat', element: React.createElement(ChatPage) }),
                            React.createElement(Route, { path: '/chat/:name', element: React.createElement(ChatSection) }),
                            React.createElement(Route, { path: '/new-chat', element: React.createElement(NewChat) }),
                            React.createElement(Route, { path: '/chat/group-chat/create', element: React.createElement(CreateGroupChat) }),
                            React.createElement(Route, { path: '/chat/group-chat/add-member', element: React.createElement(AddMember) }),
                            React.createElement(Route, { path: '/chat/group-chat/edit-member', element: React.createElement(EditMember) }),
                            React.createElement(Route, { path: '/chat/group-chat/review-details', element: React.createElement(ReviewGroupChat) }),
                            React.createElement(Route, { path: '/chat/group-chat-section/:name', element: React.createElement(GroupChatSection) }),
                            React.createElement(Route, { path: '/chat/agent/:name', element: React.createElement(AgentChatSection) }),
                            React.createElement(Route, { path: '/more/notifications', element: React.createElement(MoreNotifications) }),
                            React.createElement(Route, { path: '/setting/chat', element: React.createElement(ChatSettings) }),
                            React.createElement(Route, { path: '/setting/chat/block', element: React.createElement(BlockList) }),
                            React.createElement(Route, { path: '/setting/chat/privacy', element: React.createElement(Privacy) }),
                            React.createElement(Route, { path: '/setting/chat/readRecipt', element: React.createElement(ReadRecipt) }),
                            React.createElement(Route, { path: '/validators/:validator_address/:operation', element: React.createElement(Validator) }),
                            React.createElement(Route, { path: '/proposal', element: React.createElement(Proposals) }),
                            React.createElement(Route, { path: '/proposal-detail/:id', element: React.createElement(ProposalDetail) }),
                            React.createElement(Route, { path: '/setting/addEvmChain', element: React.createElement(AddEvmChain) }),
                            React.createElement(Route, { path: '/receive', element: React.createElement(Receive) }),
                            React.createElement(Route, { path: '/portfolio', element: React.createElement(Portfolio) }),
                            React.createElement(Route, { path: '/asset', element: React.createElement(AssetView) }),
                            React.createElement(Route, { path: '/manage-networks', element: React.createElement(ManageNetworks) }),
                            React.createElement(Route, { path: '/stake', element: React.createElement(Stake) }),
                            React.createElement(Route, { path: '/validator/:validator_address/', element: React.createElement(Validator) }),
                            React.createElement(Route, { path: '/validator/:validator_address/redelegate', element: React.createElement(Redelegate) }),
                            React.createElement(Route, { path: '/validator/validator-list', element: React.createElement(ValidatorListPage) }),
                            React.createElement(Route, { path: '/validator/:validator_address/delegate', element: React.createElement(Delegate) }),
                            React.createElement(Route, { path: '/validator/:validator_address/unstake', element: React.createElement(Unstake) }),
                            React.createElement(Route, { path: '*', element: React.createElement(StateRenderer) })
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    ),
    document.getElementById("app")
  );
}

// Dynamic import of WASM and application startup
(async () => {
  await startApp();
})(); 