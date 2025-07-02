import React, { FunctionComponent, useEffect, useRef, useState } from "react";

import { HeaderLayout } from "@layouts-v2/header-layout";

import { ButtonV2 } from "@components-v2/buttons/button";
import { Dropdown } from "@components-v2/dropdown";
import { useConfirm } from "@components/confirm";
import { getWalletConfig } from "@graphQL/config-api";
import { ChainList } from "@layouts-v2/header/chain-list";
import { getJWT } from "@utils/auth";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import { LineGraphView } from "../../components-v2/line-graph";
import { AUTH_SERVER } from "../../config.ui.var";
import { useStore } from "../../stores";
import { SetKeyRingPage } from "../keyring-dev";
import { LedgerAppModal } from "./ledger-app-modal";
import { WalletDetailsView } from "./wallet-details";
import { WalletOptions } from "./wallet-options";

export const MainPage: FunctionComponent = observer(() => {
  const [isSelectNetOpen, setIsSelectNetOpen] = useState(false);
  const [isSelectWalletOpen, setIsSelectWalletOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState<boolean>(false);
  const [tokenState, setTokenState] = useState({});
  const intl = useIntl();
  const { chainStore, accountStore, keyRingStore, analyticsStore, chatStore } =
    useStore();

  const userState = chatStore.userDetailsStore;
  useEffect(() => {
    analyticsStore.logEvent("home_tab_click");
    analyticsStore.setUserProperties({
      totalAccounts: keyRingStore.multiKeyStoreInfo.length,
    });
  }, [analyticsStore, keyRingStore.multiKeyStoreInfo.length]);

  const confirm = useConfirm();

  const current = chainStore.current;
  const currentChainId = current.chainId;

  const prevChainId = useRef<string | undefined>();
  useEffect(() => {
    if (!chainStore.isInitializing && prevChainId.current !== currentChainId) {
      (async () => {
        try {
          await chainStore.tryUpdateChain(chainStore.current.chainId);
        } catch (e) {
          console.log(e);
        }
      })();

      prevChainId.current = currentChainId;
    }
  }, [chainStore, confirm, chainStore.isInitializing, currentChainId, intl]);

  const accountInfo = accountStore.getAccount(chainStore.current.chainId);

  /// Fetching wallet config info
  useEffect(() => {
    if (keyRingStore.keyRingType === "ledger") {
      return;
    }
    getJWT(chainStore.current.chainId, AUTH_SERVER).then((res) => {
      chatStore.userDetailsStore.setAccessToken(res);
      getWalletConfig(userState.accessToken)
        .then((config) => chatStore.userDetailsStore.setWalletConfig(config))
        .catch((error) => {
          console.log(error);
        });
    });
  }, [
    chainStore,
    chainStore.current.chainId,
    accountInfo.bech32Address,
    keyRingStore.keyRingType,
  ]);

  return (
    <HeaderLayout
      innerStyle={{
        marginBottom: "0px",
      }}
    >
      <LedgerAppModal />
      <WalletDetailsView
        setIsSelectNetOpen={setIsSelectNetOpen}
        setIsSelectWalletOpen={setIsSelectWalletOpen}
        tokenState={tokenState}
      />
      <LineGraphView
        setTokenState={setTokenState}
        tokenName={chainStore.current.feeCurrencies[0].coinGeckoId}
        tokenState={tokenState}
      />

      <Dropdown
        styleProp={{ height: "595px", maxHeight: "595px" }}
        setIsOpen={setIsSelectNetOpen}
        isOpen={isSelectNetOpen}
        title="Change Network"
        closeClicked={() => setIsSelectNetOpen(false)}
      >
        <ChainList setIsSelectNetOpen={setIsSelectNetOpen} />
      </Dropdown>
      <Dropdown
        isOpen={isSelectWalletOpen}
        setIsOpen={setIsSelectWalletOpen}
        title="Change Wallet"
        closeClicked={() => {
          setIsSelectWalletOpen(false);
          analyticsStore.logEvent("change_wallet_click", {
            pageName: "Home",
          });
        }}
      >
        <SetKeyRingPage
          onItemSelect={() => setIsOptionsOpen(false)}
          setIsSelectWalletOpen={setIsSelectWalletOpen}
          setIsOptionsOpen={setIsOptionsOpen}
        />
        <ButtonV2
          text="Add New Wallet"
          styleProps={{
            height: "56px",
            background: "white",
            fontSize: "14px",
            paddingBottom: "14px",
            paddingTop: "14px",
          }}
          onClick={(e: any) => {
            e.preventDefault();
            analyticsStore.logEvent("add_new_wallet_click", {
              pageName: "Home",
            });
            setIsSelectWalletOpen(false);
            browser.tabs.create({
              url: "/popup.html#/register",
            });
          }}
        />
      </Dropdown>
      <Dropdown
        setIsOpen={setIsOptionsOpen}
        isOpen={isOptionsOpen}
        title={"Manage Wallet"}
        closeClicked={() => setIsOptionsOpen(false)}
      >
        <WalletOptions />
      </Dropdown>
    </HeaderLayout>
  );
});
