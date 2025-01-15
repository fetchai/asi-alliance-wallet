import {
  Ledger,
  LedgerApp,
  LedgerInitError,
  LedgerInitErrorOn,
} from "@keplr-wallet/background";
import React, { FunctionComponent, useState } from "react";
import { useStyle } from "styles/index";
import { BluetoothMode } from ".";
import { ViewStyle } from "react-native";
import { BlurButton } from "components/new/button/blur-button";
import TransportBLE from "@ledgerhq/react-native-hw-transport-ble";

export const LedgerNanoBLESelector: FunctionComponent<{
  deviceId: string;
  name: string;
  setMainContent: any;
  setBluetoothMode: any;
  setIsPairingText: any;
  setReconnecting: any;
  setIsPaired: any;

  onCanResume: () => void;
}> = ({
  deviceId,
  name,
  onCanResume,
  setMainContent,
  setBluetoothMode,
  setIsPairingText,
  setReconnecting,
  setIsPaired,
}) => {
  const style = useStyle();

  // const [pairingText, setIsPairingText] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);

  const testLedgerConnection = async () => {
    let initErrorOn: LedgerInitErrorOn | undefined;

    try {
      setReconnecting(false);
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
      setTimeout(function () {
        onCanResume();
        setBluetoothMode(BluetoothMode.Ledger);
        setIsPairingText("Waiting for bluetooth signal...");
        setMainContent(
          "press and hold two buttons at the same time and enter your pin"
        );
        setIsPaired(false);
      }, 6000);
    } catch (e) {
      console.log(
        "Ledger-Selector:",
        e,
        e.errorOn,
        e instanceof LedgerInitError
      );
      if (e.errorOn != null) {
        initErrorOn = e.errorOn;
        if (initErrorOn === LedgerInitErrorOn.App) {
          setBluetoothMode(BluetoothMode.Device);
          setMainContent(
            "Open Cosmos app on your ledger and pair with ASI Alliance Wallet"
          );
          setIsConnecting(false);
        } else if (initErrorOn === LedgerInitErrorOn.Transport) {
          setMainContent("Please unlock ledger nano X");
          setIsConnecting(false);
        }
      } else {
        setMainContent("Please unlock ledger nano X");
        setIsConnecting(false);
      }
      setReconnecting(true);

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
