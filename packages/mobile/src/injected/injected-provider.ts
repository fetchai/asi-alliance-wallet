import { InjectedKeplr } from "@keplr-wallet/provider";
import { KeplrMode } from "@keplr-wallet/types";

export class RNInjectedKeplr extends InjectedKeplr {
  static parseWebviewMessage(message: any): any {
    if (message && typeof message === "string") {
      try {
        return JSON.parse(message);
      } catch {
        // noop
      }
    }

    return message;
  }

  constructor(version: string, mode: KeplrMode) {
    super(
      // Meta id
      undefined,
      version,
      mode,
      // Starknet state/account change handlers. Starknet dApps are not supported on mobile.
      () => {
        // noop
      },
      () => {
        // noop
      },
      {
        addMessageListener: (fn: (e: any) => void) =>
          window.addEventListener("message", fn),
        removeMessageListener: (fn: (e: any) => void) =>
          window.removeEventListener("message", fn),
        postMessage: (message: any) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        },
      },
      RNInjectedKeplr.parseWebviewMessage,
      // EIP-6963 provider info. The EVM provider is not announced on mobile.
      undefined,
      {
        id: "keplr",
        name: "Keplr",
        icon: "",
      }
    );
  }
}
