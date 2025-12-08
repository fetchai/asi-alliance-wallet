import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { SetSidePanelEnabledMsg } from "@keplr-wallet/background";

export const isRunningInSidePanel = (): boolean => {
  // If you look at the webpack and manifest,
  // popup.html and sidePanel.html are completely identical,
  // but to know whether the code is running in the popup or the side panel,
  // they are separated using different file names.
  return new URL(window.location.href).pathname === "/sidePanel.html";
};

export const toggleSidePanel = async (
  sidePanelEnabled: boolean,
  setSidePanelEnabled?: (enabled: boolean) => void
) => {
  const msg = new SetSidePanelEnabledMsg(!sidePanelEnabled);
  new InExtensionMessageRequester()
    .sendMessage(BACKGROUND_PORT, msg)
    .then((res) => {
      setSidePanelEnabled?.(res.enabled);

      if (res.enabled) {
        if (
          typeof chrome !== "undefined" &&
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          typeof chrome.sidePanel !== "undefined"
        ) {
          (async () => {
            const selfCloseId = Math.random() * 100000;
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            window.__self_id_for_closing_view_side_panel = selfCloseId;
            // After opening the side panel, we need to clear all of the existing popup view
            const viewsBefore = browser.extension.getViews();

            try {
              const activeTabs = await browser.tabs.query({
                active: true,
                currentWindow: true,
              });
              if (activeTabs.length > 0) {
                const id = activeTabs[0].id;
                if (id != null) {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  await chrome.sidePanel.open({
                    tabId: id,
                  });
                }
              }
            } catch (e) {
              console.log(e);
            } finally {
              for (const view of viewsBefore) {
                if (
                  // We need to exclude the current one.
                  // It must not close itself before closing the others.
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  window.__self_id_for_closing_view_side_panel !== selfCloseId
                ) {
                  view.window.close();
                }
              }

              window.close();
            }
          })();
        } else {
          window.close();
        }
      } else {
        const selfCloseId = Math.random() * 100000;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        window.__self_id_for_closing_view_side_panel = selfCloseId;
        // All side panels must be closed.
        const views = browser.extension.getViews();

        for (const view of views) {
          if (
            // We need to exclude the current one.
            // It must not close itself before closing the others.
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            window.__self_id_for_closing_view_side_panel !== selfCloseId
          ) {
            view.window.close();
          }
        }

        window.close();
      }
    });
};
