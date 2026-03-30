/* eslint-disable react/no-deprecated */
// Shim ------------

import { ErrorBoundary } from "./error-boundary";

require("setimmediate");
// Shim ------------
import React, { FunctionComponent, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { AppIntlProvider } from "./languages";

import "./styles/global.scss";

import { HashRouter, Route, Routes } from "react-router-dom";

import { IBCTransferPage } from "./pages-new/more/ibc-transfer";
import { AccessPage /*, Secret20ViewingKeyAccessPage*/ } from "./pages/access";
import { NotificationPage } from "./pages/notification";

import { Banner } from "@components/banner";
import { ConfirmProvider } from "@components/confirm";
import { LoadingIndicatorProvider } from "@components/loading-indicator";
import {
  NotificationProvider,
  NotificationStoreProvider,
} from "@components/notification";
import { LockPage } from "./pages-new/lock";
import { MainPage } from "./pages-new/main";
import { RegisterPage } from "./pages-new/register";
import { SendPage } from "./pages-new/send";
import { SetKeyRingPage } from "./pages/setting/keyring";

import { configure } from "mobx";
import { observer } from "mobx-react-lite";

import { StartAutoLockMonitoringMsg } from "@keplr-wallet/background";
import Modal from "react-modal";
import { AddressBookPage } from "./pages-new/more/address-book";
import { CurrencyPge } from "./pages-new/more/currency";
import {
  SettingConnectionsPage,
  /*SettingSecret20ViewingKeyConnectionsPage,*/
} from "./pages-new/more/security-privacy/connections";
import { AddTokenPage } from "./pages-new/more/token/add";
import { ManageTokenPage } from "./pages-new/more/token/manage";
import { SettingPage } from "./pages/setting";
import { StoreProvider, useStore } from "./stores";

import { AdditionalIntlMessages, LanguageToFiatCurrency } from "./config.ui";

import { ChatStoreProvider } from "@components/chat/store";
import { Keplr } from "@keplr-wallet/provider";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import manifest from "./manifest.v2.json";
import { ActivityPage } from "./pages-new/activity";
import { ActivityDetails } from "./pages-new/activity/activity-details";
import { AssetView } from "./pages-new/asset-view";

import { DropdownContextProvider } from "@components-v2/dropdown/dropdown-context";
import { BridgePage } from "./pages-new/bridge";
import { BridgeHistoryView } from "./pages-new/bridge/bridge-history";
import { ChangeNamePageV2 } from "./pages-new/keyring-dev/change";
import { DeleteWallet } from "./pages-new/keyring-dev/delete";
import { MorePage } from "./pages-new/more";
import { ExportToMobilePage } from "./pages-new/more/export-to-mobile";
import { MoreLanguagePage } from "./pages-new/more/language";
import { ManageNetworks } from "./pages-new/more/manage-networks";
import { MoreNotifications } from "./pages-new/more/notification";
import { NotificationOrganizations } from "./pages-new/more/notification/notiphy-notification/notification-organizations";
import { NotificationTopics } from "./pages-new/more/notification/notiphy-notification/notification-topics";
import { Proposals } from "./pages-new/more/proposals";
import { ProposalDetail } from "./pages-new/more/proposals/proposal-details";
import { SecurityPrivacyPage } from "./pages-new/more/security-privacy";
import { AutoLockPage } from "./pages-new/more/security-privacy/autolock";
import { PermissionsGetChainInfosPage } from "./pages-new/more/security-privacy/permissions/get-chain-infos";
import { ExportPage } from "./pages-new/more/view-mnemonic-seed";
import { Portfolio } from "./pages-new/portfolio";
import { Receive } from "./pages-new/receive";
import { SignPageV2 } from "./pages-new/sign";
import { Stake } from "./pages-new/stake";
import { Validator } from "./pages-new/validator";
import { ValidatorListPage } from "./pages-new/validator-list";
import { Delegate } from "./pages-new/validator/delegate";
import { Redelegate } from "./pages-new/validator/redelegate";
import { Unstake } from "./pages-new/validator/unstake";
import { AxelarBridgeCosmos } from "./pages/axelar-bridge/axelar-bridge-cosmos";
import { AxelarBridgeEVM } from "./pages/axelar-bridge/axelar-bridge-evm";
import { AgentChatSection } from "./pages/agent-chat-section";
// import { ApproveAddChainByNetworkPage } from "./pages/approveAddChainByNetwork";
import { ApproveSwitchAccountByAddressPage } from "./pages/approveSwitchAccountPage";
import { ApproveSwitchChainPage } from "./pages/approveSwitchChainPage";
import { AuthZPage } from "./pages/authz";
import { ChainSuggestedPage } from "./pages/chain/suggest";
import { ChatPage } from "./pages/chat";
import { ChatSection } from "./pages/chat-section";
import { FetchnameService } from "./pages/fetch-name-service";
import { DomainDetails } from "./pages/fetch-name-service/domain-details";
import { AddMember } from "./pages/group-chat/add-member";
import { GroupChatSection } from "./pages/group-chat/chat-section";
import { CreateGroupChat } from "./pages/group-chat/create-group-chat";
import { EditMember } from "./pages/group-chat/edit-member";
import { ReviewGroupChat } from "./pages/group-chat/review-details";
import { ICNSAdr36SignPage } from "./pages/icns/sign";
import { KeystoneImportPubkeyPage } from "./pages/keystone";
import { KeystoneSignPage } from "./pages/keystone/sign";
import { NewChat } from "./pages/new-chat";
import { ReviewNotification } from "./pages/notiphy-notification/review-notification";
import { GrantGlobalPermissionGetChainInfosPage } from "./pages/permission/grant";
import { AddEvmChain } from "./pages/setting/addEvmChain";
import { ChainActivePage } from "./pages/setting/chain-active";
import { ChatSettings } from "./pages/setting/chat";
import { BlockList } from "./pages/setting/chat/block";
import { Privacy } from "./pages/setting/chat/privacy";
import { ReadRecipt } from "./pages/setting/chat/readRecipt";
import { SettingEndpointsPage } from "./pages/setting/endpoints";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAutoLockMonitoring } from "./use-auto-lock-monitoring";
import { BuySellTokenPage } from "./pages-new/more/token/moonpay";
import { AddCosmosChain } from "./pages/setting/addCosmosChain";
import { ChangePassword } from "./pages-new/more/security-privacy/change-password";
import { SignManualTxn } from "./pages-new/sign-manual-txn";
import { WalletStatus } from "@keplr-wallet/stores";
import { SignEthereumPage } from "./pages-new/sign/eth-sign";
import { Secret20ViewingKeyAccessPage } from "./pages/access/viewing-key";

const queryClient = new QueryClient();

window.keplr = new Keplr(
  manifest.version,
  "core",
  new InExtensionMessageRequester()
);

// Make sure that icon file will be included in bundle
require("@assets/svg/wireframe/LogoV2.svg");
require("@assets/icon/icon-16.png");
require("@assets/icon/icon-48.png");
require("@assets/icon/icon-128.png");

configure({
  enforceActions: "always", // Make mobx to strict mode.
});

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

const StateRenderer: FunctionComponent<{
  initAccountsOnce: React.MutableRefObject<boolean>;
}> = observer(({ initAccountsOnce }) => {
  const { keyRingStore, accountStore, chainStore } = useStore();

  useEffect(() => {
    if (keyRingStore.status === "unlocked" && !initAccountsOnce.current) {
      initAccountsOnce.current = true;

      // XXX: Below logic not observe state changes on account store and it's inner state.
      //      This is intended because this logic is only for the first time and avoid global re-rendering.
      // Start init for registered chains so that users can see account address more quickly.
      for (const modularChainInfo of chainStore.modularChainInfos) {
        const account = accountStore.getAccount(modularChainInfo.chainId);
        // Because {autoInit: true} is given as the option on account store,
        // initialization for the account starts at this time just by using getAccount().
        // However, run safe check on current status and init if status is not inited.
        if (account.walletStatus === WalletStatus.NotInit) {
          account.init();
        }
      }
    }
  }, [
    keyRingStore.status,
    chainStore.modularChainInfos,
    accountStore,
    initAccountsOnce,
  ]);

  useEffect(() => {
    // Notify to auto lock service to start activation check whenever the keyring is unlocked.
    if (keyRingStore.status === "unlocked") {
      const msg = new StartAutoLockMonitoringMsg();
      const requester = new InExtensionMessageRequester();
      requester.sendMessage(BACKGROUND_PORT, msg);
    }
    chainStore.updateChainInfosFromBackground();
    chainStore.updateEnabledChainIdentifiersFromBackground();
  }, [keyRingStore.status]);

  if (keyRingStore.status === "unlocked") {
    return <MainPage />;
  } else if (keyRingStore.status === "locked") {
    return <LockPage />;
  } else if (keyRingStore.status === "empty") {
    browser.tabs.create({
      url: "/popup.html#/register",
    });
    window.close();
    return (
      <div style={{ height: "100%" }}>
        <Banner
          icon={require("@assets/png/ASI-Logo-Icon-black.png")}
          logo={""}
        />
      </div>
    );
  } else if (keyRingStore.status === "not-loaded") {
    return (
      <div
        style={{
          height: "100%",
          backgroundColor: "white",
        }}
      >
        <Banner
          icon={require("@assets/png/ASI-Logo-Icon-black.png")}
          logo={""}
        />
      </div>
    );
  } else {
    return <div>Unknown status</div>;
  }
});

const AutoLockMonitor: FunctionComponent = observer(() => {
  useAutoLockMonitoring();

  return null;
});

// const AccountChangeMonitor = observer(() => {
//   useAccountChangeMonitoring();
//   return null;
// });

const App = observer(() => {
  const initAccountsOnce = useRef(false);
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <AppIntlProvider
          additionalMessages={AdditionalIntlMessages}
          languageToFiatCurrency={LanguageToFiatCurrency}
        >
          <LoadingIndicatorProvider>
            <NotificationStoreProvider>
              <NotificationProvider>
                <ConfirmProvider>
                  <ErrorBoundary>
                    <AutoLockMonitor />
                    <HashRouter>
                      <DropdownContextProvider>
                        <ChatStoreProvider>
                          <Routes>
                            <Route
                              path="/"
                              element={
                                <StateRenderer
                                  initAccountsOnce={initAccountsOnce}
                                />
                              }
                            />
                            <Route path="/unlock" element={<LockPage />} />
                            <Route path="/access" element={<AccessPage />} />
                            <Route
                              path="/access/viewing-key"
                              element={<Secret20ViewingKeyAccessPage />}
                            />
                            <Route
                              path="/activity-details"
                              element={<ActivityDetails />}
                            />
                            <Route
                              path="/register"
                              element={<RegisterPage />}
                            />
                            <Route path="/send" element={<SendPage />} />
                            <Route
                              path="/ibc-transfer"
                              element={<IBCTransferPage />}
                            />
                            <Route path="/bridge" element={<BridgePage />} />
                            <Route
                              path="/bridge-history"
                              element={<BridgeHistoryView />}
                            />
                            <Route path="/setting" element={<SettingPage />} />
                            <Route
                              path="/keystone/import-pubkey"
                              element={<KeystoneImportPubkeyPage />}
                            />
                            <Route
                              path="/keystone/sign"
                              element={<KeystoneSignPage />}
                            />
                            <Route path="/more" element={<MorePage />} />
                            <Route
                              path="/more/language"
                              element={<MoreLanguagePage />}
                            />
                            <Route
                              path="/more/export/:index"
                              element={<ExportPage />}
                            />
                            <Route
                              path="/more/currency"
                              element={<CurrencyPge />}
                            />
                            <Route
                              path="more/security-privacy/connections"
                              element={<SettingConnectionsPage />}
                            />
                            {/* TODO: fix the background handler */}
                            {/* <Route
                              path="/more/connections/viewing-key/:contractAddress"
                              element={
                                <SettingSecret20ViewingKeyConnectionsPage />
                              }
                            /> */}
                            <Route
                              path="/more/address-book"
                              element={<AddressBookPage />}
                            />
                            <Route
                              path="/activity"
                              element={<ActivityPage />}
                            />

                            <Route
                              path="/more/export-to-mobile"
                              element={<ExportToMobilePage />}
                            />
                            <Route
                              path="/fetch-name-service/:tab"
                              element={<FetchnameService />}
                            />
                            <Route
                              path="/fetch-name-service/domain-details/:domain"
                              element={<DomainDetails />}
                            />
                            <Route
                              path="/setting/set-keyring"
                              element={<SetKeyRingPage />}
                            />
                            <Route
                              path="/setting/clear/:index"
                              element={<DeleteWallet />}
                            />
                            <Route
                              path="/setting/keyring/change/name/:index"
                              element={<ChangeNamePageV2 />}
                            />
                            <Route
                              path="/more/token/add"
                              element={<AddTokenPage />}
                            />
                            <Route
                              path="/more/token/moonpay"
                              element={<BuySellTokenPage />}
                            />
                            <Route
                              path="/more/token/manage"
                              element={<ManageTokenPage />}
                            />
                            <Route
                              path="/more/security-privacy/change-password"
                              element={<ChangePassword />}
                            />
                            <Route
                              path="/setting/endpoints"
                              element={<SettingEndpointsPage />}
                            />
                            <Route
                              path="/more/security-privacy/autolock"
                              element={<AutoLockPage />}
                            />
                            <Route
                              path="/more/security-privacy"
                              element={<SecurityPrivacyPage />}
                            />
                            <Route path="/sign" element={<SignPageV2 />} />
                            <Route
                              path="/sign-ethereum"
                              element={<SignEthereumPage />}
                            />

                            <Route
                              path="/icns/adr36-signatures"
                              element={<ICNSAdr36SignPage />}
                            />
                            <Route
                              path="/suggest-chain"
                              element={<ChainSuggestedPage />}
                            />
                            {/* TODO: fix the background handler */}
                            {/* <Route
                              path="/add-chain-by-network"
                              element={<ApproveAddChainByNetworkPage />}
                            /> */}
                            <Route
                              path="/switch-chain-by-chainid"
                              element={<ApproveSwitchChainPage />}
                            />
                            <Route
                              path="/switch-account-by-address"
                              element={<ApproveSwitchAccountByAddressPage />}
                            />
                            <Route
                              path="/axl-bridge-evm"
                              element={<AxelarBridgeEVM />}
                            />
                            <Route
                              path="/axl-bridge-cosmos"
                              element={<AxelarBridgeCosmos />}
                            />
                            <Route
                              path="/permissions/grant/get-chain-infos"
                              element={
                                <GrantGlobalPermissionGetChainInfosPage />
                              }
                            />
                            <Route
                              path="/more/permissions/get-chain-infos"
                              element={<PermissionsGetChainInfosPage />}
                            />
                            <Route
                              path="/more/sign-manual-txn"
                              element={<SignManualTxn />}
                            />
                            <Route
                              path="/setting/chain-active"
                              element={<ChainActivePage />}
                            />
                            <Route path="/authz" element={<AuthZPage />} />
                            <Route
                              path="/notification"
                              element={<NotificationPage />}
                            />
                            <Route
                              path="/notification/organisations/:type"
                              element={<NotificationOrganizations />}
                            />
                            <Route
                              path="/notification/topics/:type"
                              element={<NotificationTopics />}
                            />
                            <Route
                              path="/notification/review"
                              element={<ReviewNotification />}
                            />
                            <Route path="/chat" element={<ChatPage />} />
                            <Route
                              path="/chat/:name"
                              element={<ChatSection />}
                            />
                            <Route path="/new-chat" element={<NewChat />} />
                            <Route
                              path="/chat/group-chat/create"
                              element={<CreateGroupChat />}
                            />
                            <Route
                              path="/chat/group-chat/add-member"
                              element={<AddMember />}
                            />
                            <Route
                              path="/chat/group-chat/edit-member"
                              element={<EditMember />}
                            />
                            <Route
                              path="/chat/group-chat/review-details"
                              element={<ReviewGroupChat />}
                            />
                            <Route
                              path="/chat/group-chat-section/:name"
                              element={<GroupChatSection />}
                            />
                            <Route
                              path="/chat/agent/:name"
                              element={<AgentChatSection />}
                            />
                            <Route
                              path="/more/notifications"
                              element={<MoreNotifications />}
                            />
                            <Route
                              path="/setting/chat"
                              element={<ChatSettings />}
                            />
                            <Route
                              path="/setting/chat/block"
                              element={<BlockList />}
                            />
                            <Route
                              path="/setting/chat/privacy"
                              element={<Privacy />}
                            />
                            <Route
                              path="/setting/chat/readRecipt"
                              element={<ReadRecipt />}
                            />
                            <Route
                              path="/validators/:validator_address/:operation"
                              element={<Validator />}
                            />
                            <Route path="/proposal" element={<Proposals />} />
                            <Route
                              path="/proposal-detail/:id"
                              element={<ProposalDetail />}
                            />
                            <Route
                              path="/setting/addEvmChain"
                              element={<AddEvmChain />}
                            />
                            <Route
                              path="/setting/addCosmosChain"
                              element={<AddCosmosChain />}
                            />
                            <Route path="/receive" element={<Receive />} />
                            <Route path="/portfolio" element={<Portfolio />} />
                            <Route path="/asset" element={<AssetView />} />
                            <Route
                              path="/manage-networks"
                              element={<ManageNetworks />}
                            />
                            <Route path="/stake" element={<Stake />} />
                            <Route
                              path="/validator/:validator_address/"
                              element={<Validator />}
                            />
                            <Route
                              path="/validator/:validator_address/redelegate"
                              element={<Redelegate />}
                            />
                            <Route
                              path="/validator/validator-list"
                              element={<ValidatorListPage />}
                            />
                            <Route
                              path="/validator/:validator_address/delegate"
                              element={<Delegate />}
                            />
                            <Route
                              path="/validator/:validator_address/unstake"
                              element={<Unstake />}
                            />
                            <Route
                              path="*"
                              element={
                                <StateRenderer
                                  initAccountsOnce={initAccountsOnce}
                                />
                              }
                            />
                          </Routes>
                        </ChatStoreProvider>
                      </DropdownContextProvider>
                    </HashRouter>
                  </ErrorBoundary>
                </ConfirmProvider>
              </NotificationProvider>
            </NotificationStoreProvider>
          </LoadingIndicatorProvider>
        </AppIntlProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
});

const appElement = document.getElementById("app");
if (!appElement) throw new Error("Failed to find the app element");

const root = createRoot(appElement);
root.render(<App />);
