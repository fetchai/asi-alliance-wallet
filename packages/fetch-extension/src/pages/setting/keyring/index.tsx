import React, { FunctionComponent, useState } from "react";

import { HeaderLayout } from "@layouts/index";

import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";

import { useNavigate } from "react-router";
import { Button, Popover, PopoverBody } from "reactstrap";

import style from "./style.module.scss";
import { useLoadingIndicator } from "@components/loading-indicator";
import { PageButton } from "../page-button";
import { MultiKeyStoreInfoWithSelectedElem } from "@keplr-wallet/background";
import { FormattedMessage, useIntl } from "react-intl";
import { App, AppCoinType } from "@keplr-wallet/ledger-cosmos";

import { messageAndGroupListenerUnsubscribe } from "@graphQL/messages-api";

export const SetKeyRingPage: FunctionComponent = observer(() => {
  const intl = useIntl();

  const { keyRingStore, analyticsStore, chatStore, proposalStore } = useStore();
  const navigate = useNavigate();

  const loadingIndicator = useLoadingIndicator();

  return (
    <HeaderLayout
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={intl.formatMessage({ id: "setting.keyring" })}
      onBackButton={() => {
        analyticsStore.logEvent("back_click", {
          pageName: "Select Account",
        });
        navigate(-1);
      }}
    >
      <div className={style["container"]}>
        <div className={style["innerTopContainer"]}>
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <Button
              color="primary"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                analyticsStore.logEvent("add_additional_account_click");
                browser.tabs.create({
                  url: "/popup.html#/register",
                });
              }}
            >
              <i
                className="fas fa-plus"
                style={{ marginRight: "4px", fontSize: "8px" }}
              />
              <FormattedMessage id="setting.keyring.button.add" />
            </Button>
          </div>
        </div>
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

          return (
            <PageButton
              key={i.toString()}
              title={`${
                keyStore.meta?.["name"]
                  ? keyStore.meta["name"]
                  : intl.formatMessage({
                      id: "setting.keyring.unnamed-account",
                    })
              } ${
                keyStore.selected
                  ? intl.formatMessage({
                      id: "setting.keyring.selected-account",
                    })
                  : ""
              }`}
              paragraph={paragraph}
              onClick={
                keyStore.selected
                  ? undefined
                  : async (e) => {
                      e.preventDefault();
                      loadingIndicator.setIsLoading("keyring", true);
                      try {
                        await keyRingStore.changeKeyRing(i);
                        analyticsStore.logEvent("select_account_click");
                        loadingIndicator.setIsLoading("keyring", false);
                        chatStore.userDetailsStore.resetUser();
                        proposalStore.resetProposals();
                        chatStore.messagesStore.resetChatList();
                        chatStore.messagesStore.setIsChatSubscriptionActive(
                          false
                        );
                        messageAndGroupListenerUnsubscribe();
                        navigate("/");
                      } catch (e: any) {
                        console.log(`Failed to change keyring: ${e.message}`);
                        loadingIndicator.setIsLoading("keyring", false);
                      }
                    }
              }
              style={keyStore.selected ? { cursor: "default" } : undefined}
              icons={[
                <KeyRingToolsIcon key="tools" index={i} keyStore={keyStore} />,
              ]}
            />
          );
        })}
      </div>
    </HeaderLayout>
  );
});

const KeyRingToolsIcon: FunctionComponent<{
  index: number;
  keyStore: MultiKeyStoreInfoWithSelectedElem;
}> = ({ index, keyStore }) => {
  const { analyticsStore } = useStore();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const toggleOpen = () => setIsOpen((isOpen) => !isOpen);

  const navigate = useNavigate();

  const [tooltipId] = useState(() => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return `tools-${Buffer.from(bytes).toString("hex")}`;
  });

  return (
    <React.Fragment>
      <Popover
        target={tooltipId}
        isOpen={isOpen}
        toggle={toggleOpen}
        placement="bottom"
      >
        <PopoverBody
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();

            navigate("");
          }}
        >
          {keyStore.type === "mnemonic" || keyStore.type === "privateKey" ? (
            <div
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                analyticsStore.logEvent(
                  keyStore.type === "mnemonic"
                    ? "view_mnemonics_seed_click"
                    : "view_private_key_click"
                );

                navigate(`/more/export/${index}?type=${keyStore.type}`);
              }}
            >
              <FormattedMessage
                id={
                  keyStore.type === "mnemonic"
                    ? "setting.export"
                    : "setting.export.private-key"
                }
              />
            </div>
          ) : null}
          <div
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              analyticsStore.logEvent("change_account_name_click");
              navigate(`/setting/keyring/change/name/${index}`);
            }}
          >
            <FormattedMessage id="setting.keyring.change.name" />
          </div>
          <div
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              analyticsStore.logEvent("delete_account_click", {
                action: "Cancel",
              });
              navigate(`/setting/clear/${index}`);
            }}
          >
            <FormattedMessage id="setting.clear" />
          </div>
        </PopoverBody>
      </Popover>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: "100%",
          padding: "0 8px",
          cursor: "pointer",
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          setIsOpen(true);
        }}
      >
        <i id={tooltipId} className="fas fa-ellipsis-h" />
      </div>
    </React.Fragment>
  );
};
