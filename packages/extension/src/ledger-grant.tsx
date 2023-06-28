// Shim ------------
import { Box } from "./components/box";

require("setimmediate");
// Shim ------------

import React, { FunctionComponent, useState } from "react";
import ReactDOM from "react-dom";
import { HashRouter, Route, Routes } from "react-router-dom";
import { StoreProvider, useStore } from "./stores";
import { ColorPalette, GlobalStyle, ScrollBarStyle } from "./styles";
import { Keplr } from "@keplr-wallet/provider";
import manifest from "./manifest.v2.json";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { configure } from "mobx";
import { ModalRootProvider } from "./components/modal";
import { ConfirmProvider, useConfirm } from "./hooks/confirm";
import { AppIntlProvider } from "./languages";
import { observer } from "mobx-react-lite";
import { useLoadFonts } from "./use-load-fonts";
import { useAutoLockMonitoring } from "./use-auto-lock-monitoring";
import { Gutter } from "./components/gutter";
import { RegisterH2 } from "./pages/register/components/typography";
import { Body1, H3, Subtitle2 } from "./components/typography";
import { Button } from "./components/button";
import { Columns } from "./components/column";
import { XAxis } from "./components/axis";
import { Checkbox } from "./components/checkbox";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { LedgerUtils } from "./utils";
import { CosmosApp } from "@keplr-wallet/ledger-cosmos";
import Transport from "@ledgerhq/hw-transport";
import Eth from "@ledgerhq/hw-app-eth";
import "simplebar-react/dist/simplebar.min.css";

configure({
  enforceActions: "always", // Make mobx to strict mode.
});

window.keplr = new Keplr(
  manifest.version,
  "core",
  new InExtensionMessageRequester()
);

const AutoLockMonitor: FunctionComponent = observer(() => {
  useAutoLockMonitoring();

  return null;
});

const LedgerGrantPage: FunctionComponent = observer(() => {
  const { uiConfigStore } = useStore();

  const confirm = useConfirm();

  const [appIsLoading, setAppIsLoading] = useState("");

  const [status, setStatus] = useState<"select" | "failed" | "success">(
    "select"
  );

  return (
    <Box width="100vw" height="100vh" alignX="center" alignY="center">
      <Box maxWidth="47.75rem">
        <img
          src={require("./public/assets/img/intro-logo.png")}
          alt="Keplr logo"
          style={{
            width: "10.625rem",
            aspectRatio: "453 / 153",
          }}
        />
        <Gutter size="2.25rem" />
        <RegisterH2 color={ColorPalette["gray-50"]}>
          Allow Browser to Connect to Ledger
        </RegisterH2>
        <Gutter size="1rem" />
        <H3 color={ColorPalette["gray-300"]}>
          You need to reapprove connection to your Ledger. Select the
          appropriate app, and after successfully connecting with your Ledger
          device, close this page and retry your previous transaction (signing).
        </H3>

        <Gutter size="1.625rem" />
        {(() => {
          switch (status) {
            case "failed":
              return (
                <Box
                  cursor="pointer"
                  onClick={(e) => {
                    e.preventDefault();

                    setStatus("select");
                  }}
                >
                  <XAxis alignY="center">
                    <Body1 color={ColorPalette["red-400"]}>
                      Failed! Try Again
                    </Body1>
                    <Gutter size="0.25rem" />
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="1.5rem"
                      height="1.5rem"
                      fill="none"
                      viewBox="0 0 24 25"
                    >
                      <path
                        stroke={ColorPalette["red-400"]}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12.563 5.75l6.75 6.75-6.75 6.75m5.812-6.75H4.687"
                      />
                    </svg>
                  </XAxis>
                </Box>
              );
            case "success":
              return (
                <Body1 color={ColorPalette["green-400"]}>
                  Success! You can close this web page.
                </Body1>
              );
            case "select":
              return (
                <React.Fragment>
                  <XAxis alignY="center">
                    <Checkbox
                      checked={uiConfigStore.useWebHIDLedger}
                      onChange={async (checked) => {
                        if (checked && !window.navigator.hid) {
                          await confirm.confirm(
                            "Unable to use Web HID",
                            "Please enable ‘experimental web platform features’ to use Web HID",
                            {
                              forceYes: true,
                            }
                          );
                          await browser.tabs.create({
                            url: "chrome://flags/#enable-experimental-web-platform-features",
                          });
                          window.close();
                          return;
                        }

                        uiConfigStore.setUseWebHIDLedger(checked);
                      }}
                    />
                    <Gutter size="0.5rem" />
                    <Subtitle2 color={ColorPalette["gray-300"]}>
                      Use alternative USB connection method(HID)
                    </Subtitle2>
                  </XAxis>

                  <Gutter size="1.625rem" />
                  <Columns sum={1} gutter="1rem">
                    <Button
                      color="secondary"
                      text="Cosmos App"
                      isLoading={appIsLoading === "Cosmos"}
                      disabled={!!appIsLoading && appIsLoading !== "Cosmos"}
                      onClick={async () => {
                        if (appIsLoading) {
                          return;
                        }
                        setAppIsLoading("Cosmos");

                        let transport: Transport | undefined = undefined;
                        try {
                          transport = uiConfigStore.useWebHIDLedger
                            ? await TransportWebHID.create()
                            : await TransportWebUSB.create();

                          let app = new CosmosApp("Cosmos", transport);

                          if ((await app.getAppInfo()).app_name === "Cosmos") {
                            setStatus("success");
                            return;
                          }

                          transport = await LedgerUtils.tryAppOpen(
                            transport,
                            "Cosmos"
                          );
                          app = new CosmosApp("Cosmos", transport);

                          if ((await app.getAppInfo()).app_name === "Cosmos") {
                            setStatus("success");
                            return;
                          }

                          setStatus("failed");
                        } catch (e) {
                          console.log(e);

                          setStatus("failed");
                        } finally {
                          transport?.close().catch(console.log);

                          setAppIsLoading("");
                        }
                      }}
                    />
                    <Button
                      color="secondary"
                      text="Terra App"
                      isLoading={appIsLoading === "Terra"}
                      disabled={!!appIsLoading && appIsLoading !== "Terra"}
                      onClick={async () => {
                        if (appIsLoading) {
                          return;
                        }
                        setAppIsLoading("Terra");

                        let transport: Transport | undefined = undefined;
                        try {
                          transport = uiConfigStore.useWebHIDLedger
                            ? await TransportWebHID.create()
                            : await TransportWebUSB.create();

                          let app = new CosmosApp("Terra", transport);

                          if ((await app.getAppInfo()).app_name === "Terra") {
                            setStatus("success");
                            return;
                          }

                          transport = await LedgerUtils.tryAppOpen(
                            transport,
                            "Terra"
                          );
                          app = new CosmosApp("Terra", transport);

                          if ((await app.getAppInfo()).app_name === "Terra") {
                            setStatus("success");
                            return;
                          }

                          setStatus("failed");
                        } catch (e) {
                          console.log(e);

                          setStatus("failed");
                        } finally {
                          transport?.close().catch(console.log);

                          setAppIsLoading("");
                        }
                      }}
                    />
                    <Button
                      color="secondary"
                      text="Ethereum App"
                      isLoading={appIsLoading === "Ethereum"}
                      disabled={!!appIsLoading && appIsLoading !== "Ethereum"}
                      onClick={async () => {
                        if (appIsLoading) {
                          return;
                        }
                        setAppIsLoading("Ethereum");

                        let transport: Transport | undefined = undefined;
                        try {
                          transport = uiConfigStore.useWebHIDLedger
                            ? await TransportWebHID.create()
                            : await TransportWebUSB.create();

                          let app = new Eth(transport);

                          try {
                            // Ensure that the keplr can connect to ethereum app on ledger.
                            // getAppConfiguration() works even if the ledger is on screen saver mode.
                            // To detect the screen saver mode, we should request the address before using.
                            await app.getAddress("m/44'/60'/0'/0/0");
                            setStatus("success");
                            return;
                          } catch (e) {
                            console.log(e);
                            // noop
                          }

                          transport = await LedgerUtils.tryAppOpen(
                            transport,
                            "Ethereum"
                          );
                          app = new Eth(transport);

                          // Ensure that the keplr can connect to ethereum app on ledger.
                          // getAppConfiguration() works even if the ledger is on screen saver mode.
                          // To detect the screen saver mode, we should request the address before using.
                          await app.getAddress("m/44'/60'/0'/0/0");
                          setStatus("success");
                          return;
                        } catch (e) {
                          console.log(e);

                          setStatus("failed");
                        } finally {
                          transport?.close().catch(console.log);

                          setAppIsLoading("");
                        }
                      }}
                    />
                  </Columns>
                </React.Fragment>
              );
          }
        })()}
      </Box>
    </Box>
  );
});

const App: FunctionComponent = () => {
  useLoadFonts();

  return (
    <StoreProvider>
      <ModalRootProvider>
        <ConfirmProvider>
          <GlobalStyle />
          <ScrollBarStyle />
          <AutoLockMonitor />
          <AppIntlProvider>
            <HashRouter>
              <Routes>
                <Route path="/" element={<LedgerGrantPage />} />
              </Routes>
            </HashRouter>
          </AppIntlProvider>
        </ConfirmProvider>
      </ModalRootProvider>
    </StoreProvider>
  );
};

ReactDOM.render(<App />, document.getElementById("app"));
