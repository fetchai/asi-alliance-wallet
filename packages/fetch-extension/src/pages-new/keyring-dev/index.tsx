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
import { dispatchGlobalEventExceptSelf } from "@utils/global-events";

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

    const chainId = chainStore.current.chainId;
    const accountInfo = accountStore.getAccount(chainStore.current.chainId);
    const loadingIndicator = useLoadingIndicator();

    const getOptionIcon = (keyStore: any) => {
      if (keyStore.type === "ledger") {
        return require("@assets/svg/wireframe/ledger-indicator.svg");
      }

      if (keyStore.type === "privateKey") {
        if (
          keyStore.insensitive &&
          keyStore.insensitive?.["email"] &&
          keyStore.insensitive?.["socialType"] === "apple"
        ) {
          return require("@assets/svg/wireframe/apple-logo.svg");
        }

        if (
          keyStore.insensitive &&
          keyStore.insensitive?.["email"] &&
          keyStore.insensitive?.["socialType"] === "google"
        ) {
          return require("@assets/svg/wireframe/google-logo.svg");
        }
      }
      return;
    };

    console.log({ keyRingStore: keyRingStore.keyInfos });

    return (
      <div>
        {keyRingStore.keyInfos.map((keyStore, i) => {
          const bip44HDPath: any = keyStore.insensitive["bip44HDPath"]
            ? keyStore.insensitive["bip44HDPath"]
            : {
                account: 0,
                change: 0,
                addressIndex: 0,
              };
          let paragraph = keyStore.insensitive?.["email"]
            ? keyStore.insensitive["email"]
            : undefined;
          if (keyStore.type === "keystone") {
            paragraph = "Keystone";
          } else if (keyStore.type === "ledger") {
            const coinType = (() => {
              if (
                keyStore.insensitive &&
                keyStore.insensitive["__ledger__cosmos_app_like__"] &&
                keyStore.insensitive["__ledger__cosmos_app_like__"] !== "Cosmos"
              ) {
                return (
                  AppCoinType[
                    keyStore.insensitive["__ledger__cosmos_app_like__"] as App
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
              keyStore.insensitive &&
              keyStore.insensitive["__ledger__cosmos_app_like__"] &&
              keyStore.insensitive["__ledger__cosmos_app_like__"] !== "Cosmos"
            ) {
              paragraph += ` (${keyStore.insensitive["__ledger__cosmos_app_like__"]})`;
            }
          }
          console.log(paragraph);

          const keyRingMeta = keyStore.insensitive["keyRingMeta"] as any;

          const nameByChain = keyRingMeta?.nameByChain
            ? JSON.parse(keyRingMeta?.nameByChain)
            : {};

          const accountName =
            nameByChain?.[chainId] ||
            keyStore.name ||
            intl.formatMessage({
              id: "setting.keyring.unnamed-account",
            });

          return (
            <Card
              key={i}
              heading={
                <React.Fragment>
                  {accountName}
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
                keyStore.isSelected ? (
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
                keyStore.isSelected
                  ? formatAddress(accountInfo.bech32Address)
                  : ""
              }
              style={{
                padding: keyStore.isSelected ? "18px 18px" : "18px 16px",
              }}
              isActive={keyStore.isSelected}
              onClick={
                keyStore.isSelected
                  ? undefined
                  : async (e: any) => {
                      e.preventDefault();
                      loadingIndicator.setIsLoading("keyring", true);
                      try {
                        await keyRingStore.selectKeyRing(keyStore.id);
                        dispatchGlobalEventExceptSelf("keplr_keyring_changed");
                        analyticsStore.logEvent("change_wallet_click");
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
