import "./src/background/background";

import { Keplr } from "@keplr-wallet/provider";
import { RNMessageRequesterInternal } from "./src/router";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
window.keplr = new Keplr("0.13.11", "core", new RNMessageRequesterInternal());
