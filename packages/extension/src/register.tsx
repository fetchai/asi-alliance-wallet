// Shim ------------
require("setimmediate");
// Shim ------------

import React, { FunctionComponent } from "react";
import ReactDOM from "react-dom";
import { HashRouter, Route, Routes } from "react-router-dom";
import { StoreProvider } from "./stores";
import { GlobalStyle, ScrollBarStyle } from "./styles";
import { Keplr } from "@keplr-wallet/provider";
import manifest from "./manifest.v2.json";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { configure } from "mobx";
import { ModalRootProvider } from "./components/modal";
import { ConfirmProvider } from "./hooks/confirm";
import { RegisterPage } from "./pages/register";
import { WelcomePage } from "./pages/register/pages/welcome";
import { AppIntlProvider } from "./languages";
import { observer } from "mobx-react-lite";
import { useLoadFonts } from "./use-load-fonts";
import { useAutoLockMonitoring } from "./use-auto-lock-monitoring";
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
                <Route path="/" element={<RegisterPage />} />
                <Route path="/welcome" element={<WelcomePage />} />
              </Routes>
            </HashRouter>
          </AppIntlProvider>
        </ConfirmProvider>
      </ModalRootProvider>
    </StoreProvider>
  );
};

ReactDOM.render(<App />, document.getElementById("app"));
