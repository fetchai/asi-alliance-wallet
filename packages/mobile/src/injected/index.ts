import { RNInjectedKeplr } from "./injected-provider";
import {
  BrowserInjectedFetchWallet,
  injectKeplrToWindow,
} from "@keplr-wallet/provider";

const keplr = new RNInjectedKeplr("0.13.11", "mobile-web");
const fetchWallet = new BrowserInjectedFetchWallet(keplr, "0.13.11");

injectKeplrToWindow(keplr, fetchWallet);
