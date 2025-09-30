import React, { FunctionComponent } from "react";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import { useLoadingIndicator } from "@components/loading-indicator";
import { messageAndGroupListenerUnsubscribe } from "@graphQL/messages-api";
// import { MultiKeyStoreInfoWithSelectedElem } from "@keplr-wallet/background";
import { Card } from "@components-v2/card";
import { App, AppCoinType } from "@keplr-wallet/ledger-cosmos";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { formatAddress } from "@utils/format";
import style from "./style.module.scss";
import { CHAIN_ID_FETCHHUB } from "../../config.ui.var";

interface SetKeyRingProps {
  navigateTo?: any;
  onItemSelect?: () => void;
  setIsOptionsOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSelectWalletOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SetKeyRingPage: FunctionComponent<SetKeyRingProps> = observer(
  ({ navigateTo, onItemSelect, setIsOptionsOpen, setIsSelectWalletOpen }) => {
    const intl = useIntl();
    const navigate = useNavigate();
    const {
      chainStore,
      accountStore,
      keyRingStore,
      analyticsStore,
      chatStore,
      proposalStore,
    } = useStore();

    const accountInfo = accountStore.getAccount(chainStore.current.chainId);
    const loadingIndicator = useLoadingIndicator();

    const getOptionIcon = (keyStore: any) => {
      if (keyStore.type === "ledger") {
        return require("@assets/svg/wireframe/ledger-indicator.svg");
      }

      if (keyStore.type === "privateKey") {
        if (
          keyStore.meta &&
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "apple"
        ) {
          return require("@assets/svg/wireframe/apple-logo.svg");
        }

        if (
          keyStore.meta &&
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "google"
        ) {
          return require("@assets/svg/wireframe/google-logo.svg");
        }
      }
      return;
    };

    return (
      <div>
        {keyRingStore.multiKeyStoreInfo.map((keyStore, i) => {
          const bip44HDPath = keyStore.bip44HDPath
            ? keyStore.bip44HDPath
            : {
                account: 0,
                change: 0,
                addressIndex: 0,
              };
          let paragraph = keyStore.meta?.["email"]
            ? keyStore.meta["email"]
            : undefined;
          if (keyStore.type === "keystone") {
            paragraph = "Keystone";
          } else if (keyStore.type === "ledger") {
            const coinType = (() => {
              if (
                keyStore.meta &&
                keyStore.meta["__ledger__cosmos_app_like__"] &&
                keyStore.meta["__ledger__cosmos_app_like__"] !== "Cosmos"
              ) {
                return (
                  AppCoinType[
                    keyStore.meta["__ledger__cosmos_app_like__"] as App
                  ] || 118
                );
              }

              return 118;
            })();

            paragraph = `Ledger - m/44'/${coinType}'/${bip44HDPath.account}'${
              bip44HDPath.change !== 0 || bip44HDPath.addressIndex !== 0
                ? `/${bip44HDPath.change}/${bip44HDPath.addressIndex}`
                : ""
            }`;

            if (
              keyStore.meta &&
              keyStore.meta["__ledger__cosmos_app_like__"] &&
              keyStore.meta["__ledger__cosmos_app_like__"] !== "Cosmos"
            ) {
              paragraph += ` (${keyStore.meta["__ledger__cosmos_app_like__"]})`;
            }
          }
          console.log(paragraph);
          return (
            <Card
              key={i}
              heading={
                <React.Fragment>
                  {keyStore.meta?.["name"]
                    ? keyStore.meta["name"]
                    : intl.formatMessage({
                        id: "setting.keyring.unnamed-account",
                      })}
                  {getOptionIcon(keyStore) && (
                    <span className={style["rightIconContainer"]}>
                      <img
                        src={getOptionIcon(keyStore)}
                        alt="Right Section"
                        className={style["rightIcon"]}
                      />
                    </span>
                  )}
                </React.Fragment>
              }
              rightContent={
                keyStore.selected ? (
                  <div style={{ display: "flex", columnGap: "12px" }}>
                    <img
                      style={{
                        width: "16px",
                        height: "16px",
                      }}
                      src={require("@assets/svg/wireframe/check.svg")}
                      alt=""
                    />
                    <img
                      style={{
                        width: "16px",
                        height: "16px",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setIsSelectWalletOpen?.(false);
                        setIsOptionsOpen?.(true);
                      }}
                      src={require("@assets/svg/edit-icon.svg")}
                      alt=""
                    />
                  </div>
                ) : (
                  ""
                )
              }
              subheading={
                keyStore.selected
                  ? formatAddress(accountInfo.bech32Address)
                  : ""
              }
              style={{
                padding: keyStore.selected ? "18px 18px" : "18px 16px",
              }}
              isActive={keyStore.selected}
              onClick={
                keyStore.selected
                  ? undefined
                  : async (e: any) => {
                      e.preventDefault();
                      loadingIndicator.setIsLoading("keyring", true);
                      try {
                        await keyRingStore.changeKeyRing(i);
                        analyticsStore.logEvent("change_wallet_click");
                        
                        // Check if current chain is Cardano and new wallet doesn't support it
                        const isCardanoSupportedWallet =
                          keyStore?.meta["cardano"] === "true";
                        const isCurrentChainCardano = 
                          chainStore.current.chainId === "cardano-preview" ||
                          chainStore.current.chainId === "cardano-mainnet" ||
                          chainStore.current.chainId === "cardano-preprod";
                        
                        // Switch to fetchhub if current chain is Cardano but new wallet doesn't support it
                        if (isCurrentChainCardano && !isCardanoSupportedWallet) {
                          chainStore.selectChain(CHAIN_ID_FETCHHUB);
                          chainStore.saveLastViewChainId();
                        }
                        loadingIndicator.setIsLoading("keyring", false);
                        chatStore.userDetailsStore.resetUser();
                        proposalStore.resetProposals();
                        chatStore.messagesStore.resetChatList();
                        chatStore.messagesStore.setIsChatSubscriptionActive(
                          false
                        );
                        messageAndGroupListenerUnsubscribe();
                        navigate(navigateTo);
                        onItemSelect?.();
                      } catch (e: any) {
                        console.log(`Failed to change keyring: ${e.message}`);
                        loadingIndicator.setIsLoading("keyring", false);
                      }
                    }
              }
            />
          );
        })}
      </div>
    );
  }
);
