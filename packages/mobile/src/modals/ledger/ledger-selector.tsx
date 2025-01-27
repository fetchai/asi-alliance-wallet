import { Ledger, LedgerApp } from "@keplr-wallet/background";
import React, { FunctionComponent, useState } from "react";
import { useStyle } from "styles/index";
import { BluetoothMode } from ".";
import { ViewStyle } from "react-native";
import { BlurButton } from "components/new/button/blur-button";
import TransportBLE from "@ledgerhq/react-native-hw-transport-ble";
import { WalletError } from "@keplr-wallet/router";
import {
  ErrCodeAppNotInitialised,
  ErrCodeDeviceLocked,
  ErrFailedInit,
  ErrModuleLedgerSign,
} from "@keplr-wallet/background/build/ledger/types";

export const LedgerNanoBLESelector: FunctionComponent<{
  deviceId: string;
  name: string;
  setMainContent: any;
  setBluetoothMode: any;
  setIsPairingText: any;
  setIsPaired: any;

  onCanResume: () => void;
}> = ({
  deviceId,
  name,
  onCanResume,
  setMainContent,
  setBluetoothMode,
  setIsPairingText,
  setIsPaired,
}) => {
  const style = useStyle();

  const [isConnecting, setIsConnecting] = useState(false);

  const testLedgerConnection = async () => {
    try {
      setIsPaired(false);
      setIsConnecting(true);
      setMainContent("");
      setBluetoothMode(BluetoothMode.Connecting);
      setIsPairingText(`Connecting to ${name}`);
      const ledger = await Ledger.init(
        () => TransportBLE.open(deviceId),
        undefined,
        LedgerApp.Cosmos,
        "Cosmos"
      );
      setMainContent(
        "Open Cosmos app on your ledger and pair with ASI Alliance Wallet"
      );
      setBluetoothMode(BluetoothMode.Pairing);
      setIsPairingText("Waiting to pair...");
      setTimeout(function () {
        setIsPaired(true);
        setBluetoothMode(BluetoothMode.Paired);
        setIsPairingText(`Paired with ${name}`);
      }, 2000);
      await ledger.close();
      onCanResume();
    } catch (e) {
      if (e instanceof WalletError && e.module === ErrModuleLedgerSign) {
        setBluetoothMode(BluetoothMode.Device);
        if (e.code === ErrFailedInit) {
          setMainContent(
            "press and hold two buttons at the same time and enter your pin"
          );
          setIsConnecting(false);
        } else if (e.code === ErrCodeAppNotInitialised) {
          setMainContent(
            "Open Cosmos app on your ledger and pair with ASI Alliance Wallet"
          );
          setIsConnecting(false);
        } else if (e.code === ErrCodeDeviceLocked) {
          setMainContent("Please unlock ledger nano X");
          setIsConnecting(false);
        }
      } else {
        setMainContent("Please unlock ledger nano X");
        setIsConnecting(false);
      }
      await TransportBLE.disconnect(deviceId);
    }
  };

  return !isConnecting ? (
    <BlurButton
      text={name}
      blurIntensity={25}
      borderRadius={12}
      containerStyle={
        style.flatten(["padding-12", "margin-bottom-6"]) as ViewStyle
      }
      onPress={async () => {
        await testLedgerConnection();
      }}
    />
  ) : null;
};
