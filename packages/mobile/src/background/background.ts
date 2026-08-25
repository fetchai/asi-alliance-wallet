import { init } from "@keplr-wallet/background";
import {
  RNEnv,
  RNMessageRequesterInternalToUI,
  RNRouterBackground,
} from "../router";
import { AsyncKVStore } from "../common";
import scrypt from "react-native-scrypt";
import { Buffer } from "buffer/";
import { Platform } from "react-native";

import TransportBLE from "@ledgerhq/react-native-hw-transport-ble";

import { BACKGROUND_PORT } from "@keplr-wallet/router";

import { CommunityChainInfoRepo, EmbedChainInfos } from "../config";
import {
  getLastUsedLedgerDeviceId,
  setLastUsedLedgerDeviceId,
} from "utils/ledger";

const router = new RNRouterBackground(RNEnv.produceEnv);

const { initFn } = init(
  router,
  (prefix: string) => new AsyncKVStore(prefix),
  new RNMessageRequesterInternalToUI(),
  undefined,
  EmbedChainInfos,
  [
    "https://app.osmosis.zone",
    "https://www.stargaze.zone",
    "https://app.umee.cc",
    "https://junoswap.com",
    "https://frontier.osmosis.zone",
  ],
  ["https://wallet.keplr.app"],
  [],
  {},
  [],
  CommunityChainInfoRepo,
  {
    create: (params: {
      iconRelativeUrl?: string;
      title: string;
      message: string;
    }) => {
      console.log(`Notification: ${params.title}, ${params.message}`);
    },
  },
  () => {
    // TODO
  },
  "",
  {
    commonCrypto: {
      scrypt: async (
        text: string,
        params: { dklen: number; salt: string; n: number; r: number; p: number }
      ) => {
        return Buffer.from(
          await scrypt(
            Buffer.from(text).toString("hex"),
            // Salt is expected to be encoded as Hex
            params.salt,
            params.n,
            params.r,
            params.p,
            params.dklen,
            "hex"
          ),
          "hex"
        );
      },
    },
    getDisabledChainIdentifiers: async () => {
      const kvStore = new AsyncKVStore("store_chain_config");
      const legacy = await kvStore.get<{ disabledChains: string[] }>(
        "chain_info_in_ui_config"
      );
      if (!legacy) {
        return [];
      }
      return legacy.disabledChains ?? [];
    },
  },
  {
    platform: "mobile",
    mobileOS: Platform.OS,
  },
  true,
  "",
  undefined,
  undefined,
  {
    defaultMode: "ble",
    platform: "mobile",
    transportIniters: {
      ble: async (deviceId?: string) => {
        const lastDeviceId = await getLastUsedLedgerDeviceId();

        if (!deviceId && !lastDeviceId) {
          throw new Error("Device id is empty");
        }

        if (!deviceId) {
          deviceId = lastDeviceId;
        }

        if (deviceId && deviceId !== lastDeviceId) {
          await setLastUsedLedgerDeviceId(deviceId);
        }

        return await TransportBLE.open(deviceId);
      },
    },
  }
);

const initFnWithLogs = async (markReady?: () => void) => {
  const started = Date.now();
  console.log("[background] init start");
  try {
    await initFn(markReady);
    console.log(`[background] init done in ${Date.now() - started}ms`);
  } catch (e) {
    console.error(
      `[background] init failed after ${Date.now() - started}ms`,
      e
    );
    throw e;
  }
};

router.listen(BACKGROUND_PORT, initFnWithLogs).catch((e) => {
  console.error("BACKGROUND INIT FAILED", e);
});
