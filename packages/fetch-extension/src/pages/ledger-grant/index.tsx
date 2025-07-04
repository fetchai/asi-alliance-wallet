import React, { ChangeEvent, FunctionComponent, useState } from "react";
import "../../styles/global.scss";

import style from "./style.module.scss";
import { FormattedMessage, useIntl } from "react-intl";
import classnames from "classnames";
import {
  NotificationProvider,
  NotificationStoreProvider,
  useNotification,
} from "@components/notification";
import { CosmosApp } from "@keplr-wallet/ledger-cosmos";
import {
  Ledger,
  LedgerApp,
  LedgerWebHIDIniter,
  LedgerWebUSBIniter,
} from "@keplr-wallet/background";
import delay from "delay";
import { StoreProvider, useStore } from "../../stores";
import ReactDOM from "react-dom";
import { observer } from "mobx-react-lite";
import { useAutoLockMonitoring } from "../../use-auto-lock-monitoring";

import { AppIntlProvider } from "../../languages";
import {
  AdditionalIntlMessages,
  LanguageToFiatCurrency,
} from "../../config.ui";
import { LoadingIndicatorProvider } from "@components/loading-indicator";
import { ConfirmProvider } from "@components/confirm";
import { ErrorBoundary } from "../../error-boundary";
import { HashRouter, Route, Routes } from "react-router-dom";
import { DropdownContextProvider } from "@components-v2/dropdown/dropdown-context";
import { ChatStoreProvider } from "@components/chat/store";

export const LedgerGrantPage: FunctionComponent = observer(() => {
  const intl = useIntl();
  const notification = useNotification();
  const { ledgerInitStore } = useStore();
  const [status, setStatus] = useState<"select" | "failed" | "success">(
    "select"
  );
  const [showWebHIDWarning, setShowWebHIDWarning] = useState(false);
  const [isLoading, setIsLoading] = useState<{
    cosmosLikeApp: string;
    loading: boolean;
  }>({
    cosmosLikeApp: "",
    loading: false,
  });

  const handlePermission = async (app: LedgerApp, cosmosLikeApp: string) => {
    setIsLoading({ cosmosLikeApp, loading: true });

    try {
      const transportIniter = ledgerInitStore.isWebHID
        ? LedgerWebHIDIniter
        : LedgerWebUSBIniter;
      const transport = await transportIniter();

      try {
        await CosmosApp.openApp(transport, cosmosLikeApp);
      } catch (e) {
        console.log(e);
      } finally {
        await delay(500);

        let ledger: Ledger | undefined;
        try {
          ledger = await Ledger.init(
            transportIniter,
            undefined,
            app,
            cosmosLikeApp
          );
        } finally {
          await ledger?.close();
        }

        setStatus("success");
      }
    } catch (e) {
      console.log(e);

      setStatus("failed");
    } finally {
      setIsLoading({ cosmosLikeApp: "", loading: false });
    }
  };

  const toggleWebHIDFlag = async (e: ChangeEvent) => {
    e.preventDefault();

    if (!ledgerInitStore.isWebHID && !(await Ledger.isWebHIDSupported())) {
      setShowWebHIDWarning(true);
      return;
    }
    setShowWebHIDWarning(false);

    await ledgerInitStore.setWebHID(!ledgerInitStore.isWebHID);
  };
  return (
    <div className={classnames(style["container"])}>
      <div className={style["logoContainer"]}>
        <div className={classnames(style["logoInnerContainer"])}>
          <img
            className={style["icon"]}
            src={require("@assets/png/ASI-Logo-Icon-black.png")}
            alt="logo"
          />
        </div>
      </div>
      <div className={style["ledgerWrapper"]}>
        <div className={style["ledgerInnerContainer"]}>
          <div className={style["pageTitle"]}>
            Allow Browser to Connect to Ledger
          </div>
          <div className={style["pageSubTitle"]}>
            You need to reapprove connection to your Ledger. Select the
            appropriate app, and after successfully connecting with your Ledger
            device, close this page and retry your previous transaction
            (signing).
          </div>
          {(() => {
            switch (status) {
              case "failed":
                return (
                  <button
                    className={style["buttonText"]}
                    style={{
                      opacity: isLoading.loading ? 0.5 : 1,
                      cursor: isLoading.loading ? "progress" : "pointer",
                    }}
                    onClick={(e) => {
                      e.preventDefault();

                      setStatus("select");
                    }}
                  >
                    {"Failed! Try Again"}
                    <div className={style["failureIconContainer"]}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="25"
                        fill="none"
                        viewBox="0 0 24 25"
                      >
                        <path
                          stroke={"#F0224B"}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12.563 5.75l6.75 6.75-6.75 6.75m5.812-6.75H4.687"
                        />
                      </svg>
                    </div>
                  </button>
                );
              case "success":
                return (
                  <div className={style["successMessage"]}>
                    Success! You can close this web page.
                  </div>
                );
              case "select":
                return (
                  <React.Fragment>
                    <div className="custom-control custom-checkbox">
                      <input
                        className={`custom-control-input ${style["ledgerCheckbox"]}`}
                        id="use-webhid"
                        type="checkbox"
                        checked={ledgerInitStore.isWebHID}
                        onChange={toggleWebHIDFlag}
                        disabled={isLoading.loading}
                      />
                      <label
                        className={`custom-control-label ${style["ledgerCheckboxLabel"]}`}
                        htmlFor="use-webhid"
                      >
                        <FormattedMessage id="ledger.option.webhid.checkbox" />
                      </label>
                    </div>
                    {showWebHIDWarning ? (
                      <div className={style["webIdWarning"]}>
                        <FormattedMessage
                          id="ledger.option.webhid.warning"
                          values={{
                            link: (
                              <a
                                href="chrome://flags/#enable-experimental-web-platform-features"
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                  navigator.clipboard
                                    .writeText(
                                      "chrome://flags/#enable-experimental-web-platform-features"
                                    )
                                    .then(() => {
                                      notification.push({
                                        placement: "top-center",
                                        type: "success",
                                        duration: 2,
                                        content: intl.formatMessage({
                                          id: "ledger.option.webhid.link.copied",
                                        }),
                                        canDelete: true,
                                        transition: {
                                          duration: 0.25,
                                        },
                                      });
                                    });
                                }}
                              >
                                chrome://flags/#enable-experimental-web-platform-features
                              </a>
                            ),
                          }}
                        />
                      </div>
                    ) : null}
                    <div style={{ flex: 1 }} />
                    <Instruction
                      icon={
                        <img
                          src={require("@assets/img/atom-o.svg")}
                          style={{ height: "30px" }}
                          alt="cosmos"
                        />
                      }
                      title={intl.formatMessage({ id: "ledger.cosmos" })}
                      paragraph={
                        "Click here to grant permission for Cosmos access."
                      }
                      isLoading={isLoading.cosmosLikeApp === "Cosmos"}
                      onClick={async () => {
                        if (!isLoading.loading) {
                          await handlePermission(LedgerApp.Cosmos, "Cosmos");
                        }
                      }}
                    />
                    <Instruction
                      icon={
                        <img
                          src={require("@assets//img/ethereum.svg")}
                          style={{ height: "36px" }}
                          alt="eth"
                        />
                      }
                      title={intl.formatMessage({ id: "ledger.ethereum" })}
                      paragraph={
                        "Click here to grant permission for Ethereum access."
                      }
                      isLoading={isLoading.cosmosLikeApp === "Ethereum"}
                      onClick={async () => {
                        if (!isLoading.loading) {
                          await handlePermission(
                            LedgerApp.Ethereum,
                            "Ethereum"
                          );
                        }
                      }}
                    />
                  </React.Fragment>
                );
            }
          })()}
        </div>
      </div>
    </div>
  );
});

const Instruction: FunctionComponent<{
  icon: React.ReactElement;
  title: string;
  paragraph: string;
  isLoading: boolean;
  onClick: () => void;
}> = ({ icon, title, paragraph, isLoading = false, children, onClick }) => {
  return (
    <div
      className={classnames(style["instruction"])}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <div className={style["icon"]}>{icon}</div>
      <div className={style["inner"]}>
        <h1>{title}</h1>
        {isLoading ? (
          <i className="fas fa-spinner fa-spin ml-2" />
        ) : (
          <p>{paragraph}</p>
        )}
        {children}
      </div>
    </div>
  );
};

const AutoLockMonitor: FunctionComponent = observer(() => {
  useAutoLockMonitoring();

  return null;
});

ReactDOM.render(
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
                        <Route path="/" element={<LedgerGrantPage />} />
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
  </StoreProvider>,
  document.getElementById("app")
);
