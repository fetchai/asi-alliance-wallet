import React, { FunctionComponent, useEffect, useState } from "react";
import styleWelcome from "./welcome.module.scss";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useStore } from "../../stores";
import { useIntl } from "react-intl";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { GetSidePanelIsSupportedMsg } from "@keplr-wallet/background";
import { toggleSidePanel } from "@utils/side-panel";
import { ToolTip } from "@components/tooltip";

export const WelcomePage: FunctionComponent = () => {
  const { analyticsStore } = useStore();
  const intl = useIntl();
  const [sidePanelSupported, setSidePanelSupported] = useState(false);

  useEffect(() => {
    const msg = new GetSidePanelIsSupportedMsg();
    new InExtensionMessageRequester()
      .sendMessage(BACKGROUND_PORT, msg)
      .then((res) => {
        setSidePanelSupported(res.supported);
      });
  }, []);

  return (
    <div className={styleWelcome["welcomePageContainer"]}>
      <img
        className={styleWelcome["pinWalletArrow"]}
        src={require("@assets/svg/wireframe/pin-arrow.svg")}
        alt=""
      />
      <img
        className={styleWelcome["pinWallet"]}
        src={require("@assets/svg/wireframe/welcome-frame.svg")}
        alt=""
      />
      <div className={styleWelcome["content"]}>
        <img src={require("@assets/svg/wireframe/rocket.svg")} alt="" />
        <div className={styleWelcome["title"]}>
          {intl.formatMessage({
            id: "register.welcome.title",
          })}
        </div>
        <div className={styleWelcome["description"]}>
          Your ASI Alliance Wallet journey now begins.
        </div>
      </div>
      <ToolTip
        tooltip={
          sidePanelSupported
            ? "Opens the wallet in the side panel"
            : "Closes the welcome page"
        }
        trigger="hover"
        options={{
          placement: "top-end",
          modifiers: {
            arrow: {
              enabled: true,
              element: "[data-arrow]",
            },
          },
        }}
      >
        <ButtonV2
          variant="dark"
          styleProps={{
            height: "56px",
          }}
          onClick={async () => {
            analyticsStore.logEvent("start_using_your_wallet_click", {
              pageName: "Register",
            });
            if (typeof browser !== "undefined") {
              const tab = await browser.tabs.getCurrent();
              if (tab.windowId != null) {
                const tabs = await browser.tabs.query({
                  windowId: tab.windowId,
                });
                if (tabs.length === 1) {
                  await browser.tabs.create({ windowId: tab.windowId });
                }
              }

              if (sidePanelSupported) {
                await toggleSidePanel(false);
              } else {
                if (tab.id != null) {
                  await browser.tabs.remove(tab.id);
                } else {
                  window.close();
                }
              }
            } else {
              window.close();
            }
          }}
          text={""}
        >
          Start using your wallet
        </ButtonV2>
      </ToolTip>
    </div>
  );
};
