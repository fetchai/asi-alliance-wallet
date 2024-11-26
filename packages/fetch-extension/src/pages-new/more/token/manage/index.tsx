import React, { FunctionComponent } from "react";
import { useNavigate } from "react-router";

import style from "./style.module.scss";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { useNotification } from "@components/notification";
import { useConfirm } from "@components/confirm";
import {
  CW20Currency,
  Erc20Currency,
  Secret20Currency,
} from "@keplr-wallet/types";
import { useIntl } from "react-intl";
import { ToolTip } from "@components/tooltip";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { Card } from "@components-v2/card";
import { NoToken } from "./no-token";
import { ButtonV2 } from "@components-v2/buttons/button";

export const ManageTokenPage: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const intl = useIntl();
  const notification = useNotification();
  const confirm = useConfirm();

  const { chainStore, tokensStore, analyticsStore } = useStore();

  const isSecretWasm =
    chainStore.current.features &&
    chainStore.current.features.includes("secretwasm");

  const appCurrencies = chainStore.current.currencies.filter((currency) => {
    if (isSecretWasm) {
      return "type" in currency && currency.type === "secret20";
    } else {
      return "type" in currency && ["cw20", "erc20"].includes(currency.type);
    }
  });

  const copyText = async (text: string, messageId: string) => {
    await navigator.clipboard.writeText(text);

    // TODO: Show success tooltip.
    notification.push({
      placement: "top-center",
      type: "success",
      duration: 2,
      content: intl.formatMessage({
        id: messageId,
      }),
      canDelete: true,
      transition: {
        duration: 0.25,
      },
    });
  };
  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      showBottomMenu={false}
      canChangeChainInfo={false}
      alternativeTitle={intl.formatMessage({
        id: "main.menu.token-list",
      })}
      onBackButton={() => {
        analyticsStore.logEvent("back_click", { pageName: "Token List" });
        navigate(-1);
      }}
      rightRenderer={
        <button
          className={style["plusIcon"]}
          onClick={() => {
            navigate("/more/token/add");
            analyticsStore.logEvent("add_token_icon_click", {
              pageName: "Manage Tokens",
            });
          }}
        >
          {" "}
          +
        </button>
      }
    >
      <div className={style["container"]}>
        {appCurrencies.length > 0 ? (
          appCurrencies.map((currency) => {
            const cosmwasmToken = currency as
              | CW20Currency
              | Secret20Currency
              | Erc20Currency;

            const icons: React.ReactElement[] = [];

            icons.push(
              <ToolTip
                trigger="hover"
                options={{
                  placement: "top-end",
                }}
                childrenStyle={{ display: "flex" }}
                tooltip={
                  <div>
                    {intl.formatMessage({
                      id: "setting.token.manage.notification.contract-address.copy.hover",
                    })}
                  </div>
                }
              >
                <i
                  key="copy"
                  className="fas fa-copy"
                  style={{
                    cursor: "pointer",
                  }}
                  onClick={async (e) => {
                    e.preventDefault();

                    await copyText(
                      cosmwasmToken.contractAddress,
                      "setting.token.manage.notification.contract-address.copy"
                    );
                  }}
                />
              </ToolTip>
            );

            if ("viewingKey" in cosmwasmToken) {
              icons.push(
                <ToolTip
                  trigger="hover"
                  options={{
                    placement: "top-end",
                  }}
                  childrenStyle={{ display: "flex" }}
                  tooltip={
                    <div>
                      {intl.formatMessage({
                        id: "setting.token.manage.notification.viewing-key.copy.hover",
                      })}
                    </div>
                  }
                >
                  <i
                    key="key"
                    className="fas fa-key"
                    style={{
                      cursor: "pointer",
                    }}
                    onClick={async (e) => {
                      e.preventDefault();

                      await copyText(
                        cosmwasmToken.viewingKey,
                        "setting.token.manage.notification.viewing-key.copy"
                      );
                    }}
                  />
                </ToolTip>
              );
            }
            cosmwasmToken.coinDenom !== "FET" &&
              icons.push(
                <i
                  key="trash"
                  className="fas fa-trash-alt"
                  style={{
                    cursor: "pointer",
                  }}
                  onClick={async (e) => {
                    e.preventDefault();

                    if (
                      await confirm.confirm({
                        paragraph: intl.formatMessage({
                          id: "setting.token.manage.confirm.remove-token",
                        }),
                      })
                    ) {
                      analyticsStore.logEvent("token_delete_click", {
                        action: confirm ? "Yes" : "No",
                      });
                      await tokensStore
                        .getTokensOf(chainStore.current.chainId)
                        .removeToken(cosmwasmToken);
                    }
                  }}
                />
              );

            return (
              <Card
                key={cosmwasmToken.contractAddress}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  width: "92%",
                }}
                heading={cosmwasmToken.coinDenom}
                subheading={Bech32Address.shortenAddress(
                  cosmwasmToken.contractAddress,
                  30,
                  cosmwasmToken.type === "erc20"
                )}
                rightContent={
                  <div className={style["edit"]} style={{ display: "flex" }}>
                    {icons}
                  </div>
                }
              />
            );
          })
        ) : (
          <div
            style={{
              width: "90%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
            }}
          >
            <NoToken />
            <ButtonV2
              styleProps={{
                height: "56px",
              }}
              text="Add Token"
              onClick={() => {
                navigate("/more/token/add");
                analyticsStore.logEvent("add_token_click", {
                  pageName: "Manage Tokens",
                });
              }}
            />
          </div>
        )}
      </div>
    </HeaderLayout>
  );
});
