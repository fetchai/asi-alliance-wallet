import {
  InjectedKeplr,
  BrowserInjectedFetchWallet,
} from "@keplr-wallet/provider";

import manifest from "../../manifest.v2.json";
import { injectFetchWalletToWindow } from "@keplr-wallet/provider/src/fetchai/inject";
// eslint-disable-next-line import/no-extraneous-dependencies
import { RpcProvider, WalletAccount } from "starknet";
// eslint-disable-next-line import/no-extraneous-dependencies
import { v4 as uuidv4 } from "uuid";

const keplr = new InjectedKeplr(
  process.env["KEPLR_EXT_PROVIDER_META_ID"]
    ? process.env["KEPLR_EXT_PROVIDER_META_ID"]
    : undefined,
  manifest.version,
  "extension",
  (state) => {
    // XXX: RpcProvider와 Account를 starknetjs에서 바로 가져와서 씀으로 인해서
    //      injected script의 크기가 커지는 문제가 있다.
    //      일단 webpack의 tree shaking 덕분에 아직은 어느정도 허용할만한 수준의 용량이다.
    //      이 코드에 의한 용량 문제에 대해서 고려해서 개발해야한다.
    if (state.rpc) {
      if (!keplr.starknet.provider) {
        keplr.starknet.provider = new RpcProvider({
          nodeUrl: state.rpc,
          specVersion: "0.9.0",
        });
      } else {
        keplr.starknet.provider.channel.nodeUrl = state.rpc;
      }
    }

    if (keplr.starknet.provider) {
      if (state.selectedAddress) {
        if (!keplr.starknet.account) {
          WalletAccount.connect(
            keplr.starknet.provider,
            keplr.generateStarknetProvider()
          )
            .then((account: any) => {
              keplr.starknet.account = account;
              if (state.selectedAddress && keplr.starknet.account) {
                keplr.starknet.account.address = state.selectedAddress;
              }
            })
            .catch((error: any) => {
              console.error("Failed to connect starknet account:", error);
              keplr.starknet.account = undefined;
            });
        } else {
          keplr.starknet.account.address = state.selectedAddress;
        }
      } else {
        keplr.starknet.account = undefined;
      }
    } else {
      keplr.starknet.account = undefined;
    }
  },
  (state) => {
    if (state.selectedAddress) {
      if (keplr.starknet.account) {
        keplr.starknet.account.address = state.selectedAddress;
      }
    }
  },
  {
    addMessageListener: (fn: (e: any) => void) =>
      window.addEventListener("message", fn),
    removeMessageListener: (fn: (e: any) => void) =>
      window.removeEventListener("message", fn),
    postMessage: (message) =>
      window.postMessage(message, window.location.origin),
  },
  undefined,
  {
    uuid: uuidv4(),
    name: process.env["KEPLR_EXT_EIP6963_PROVIDER_INFO_NAME"] || "",
    icon: process.env["KEPLR_EXT_EIP6963_PROVIDER_INFO_ICON"] || "",
    rdns: process.env["KEPLR_EXT_EIP6963_PROVIDER_INFO_RDNS"] || "",
  },
  {
    id: "keplr",
    name: "Keplr",
    icon: process.env["KEPLR_EXT_STARKNET_PROVIDER_INFO_ICON"] || "",
  }
);

const fetchWallet = new BrowserInjectedFetchWallet(keplr, manifest.version);

injectFetchWalletToWindow(fetchWallet);
