import TransportBLE from "@ledgerhq/react-native-hw-transport-ble";
import { Ledger, LedgerApp, PlainObject } from "@keplr-wallet/background";
import { serializeSignDoc, SignDocWrapper } from "@keplr-wallet/cosmos";
import { KeplrError as WalletError } from "@keplr-wallet/router";
import {
  ErrModuleLedgerSign,
  ErrPublicKeyUnmatched,
} from "@keplr-wallet/background/build/ledger/types";
import { getLastUsedLedgerDeviceId } from "utils/ledger";
import { Buffer } from "buffer/";

export const signWithLedger = async (
  keyInsensitive: PlainObject,
  signDocWrapper: SignDocWrapper
): Promise<Uint8Array> => {
  const deviceId = await getLastUsedLedgerDeviceId();
  if (!deviceId) {
    throw new Error("Please connect your Ledger device");
  }
  const bip44Path = keyInsensitive["bip44Path"] as {
    account: number;
    change: number;
    addressIndex: number;
  };
  const ledger = await Ledger.init(
    () => TransportBLE.open(deviceId),
    undefined,
    LedgerApp.Cosmos,
    "Cosmos"
  );
  try {
    const pubKey = await ledger.getPublicKey(LedgerApp.Cosmos, bip44Path);
    const expected = (
      keyInsensitive["Cosmos"] as { pubKey?: string } | undefined
    )?.pubKey;
    if (expected && Buffer.from(pubKey).toString("hex") !== expected) {
      throw new WalletError(
        ErrModuleLedgerSign,
        ErrPublicKeyUnmatched,
        "Unmatched public key"
      );
    }
    return await ledger.sign(
      bip44Path,
      serializeSignDoc(signDocWrapper.aminoSignDoc)
    );
  } finally {
    await ledger.close();
  }
};
