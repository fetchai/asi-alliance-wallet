import React, { FunctionComponent, useState } from "react";
import { FullScreenCameraView } from "components/camera";
import { useSmartNavigation } from "navigation/smart-navigation";
import { useStore } from "stores/index";
import { RouteProp, useRoute } from "@react-navigation/native";
import {
  AddressBookConfigMap,
  AddressBookData,
  RegisterConfig,
} from "@keplr-wallet/hooks";
import {
  parseQRCodeDataForImportFromExtension,
  importFromExtension,
  registerExportedAddressBooks,
  registerExportedKeyRingDatas,
} from "utils/import-from-extension";
import { AsyncKVStore } from "../../../common";
import { BarcodeScanningResult } from "expo-camera/src/Camera.types";

export * from "./intro";
export * from "./set-password";

export interface QRCodeSharedData {
  // The uri for the wallet connect
  wcURI: string;
  // The temporary password for encrypt/descrypt the key datas.
  // This must not be shared the other than the extension and mobile.
  sharedPassword: string;
}

export interface WCExportKeyRingDatasResponse {
  encrypted: {
    // ExportKeyRingData[]
    // Json format and hex encoded
    ciphertext: string;
    // Hex encoded
    iv: string;
  };
  addressBooks: { [chainId: string]: AddressBookData[] | undefined };
}

export const ImportFromExtensionScreen: FunctionComponent = () => {
  const { chainStore, keyRingStore, analyticsStore } = useStore();

  const [addressBookConfigMap] = useState(
    () => new AddressBookConfigMap(new AsyncKVStore("address_book"), chainStore)
  );

  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          registerConfig: RegisterConfig;
        }
      >,
      string
    >
  >();

  const smartNavigation = useSmartNavigation();

  const [isLoading, setIsLoading] = useState(false);

  const onBarcodeScanned = async ({ data }: { data: string }) => {
    if (isLoading) {
      return;
    }

    try {
      const sharedData = parseQRCodeDataForImportFromExtension(data);

      setIsLoading(true);

      const imported = await importFromExtension(
        sharedData,
        chainStore.chainInfosInUI.map((chainInfo) => chainInfo.chainId)
      );
      analyticsStore.setUserProperties({
        registerType: "qr",
        accountType: imported.KeyRingDatas[0].type,
      });

      analyticsStore.logEvent("register_done_click", {
        pageName: "Register",
      });

      if (keyRingStore.multiKeyStoreInfo.length > 0) {
        // If already has accounts,
        await registerExportedKeyRingDatas(
          keyRingStore,
          route.params.registerConfig,
          imported.KeyRingDatas,
          ""
        );

        await registerExportedAddressBooks(
          addressBookConfigMap,
          imported.addressBooks
        );

        smartNavigation.reset({
          index: 0,
          routes: [
            {
              name: "Register.End",
              params: {},
            },
          ],
        });
      } else {
        // If there is no account,
        // should set the password.
        smartNavigation.replaceSmart(
          "Register.ImportFromExtension.SetPassword",
          {
            registerConfig: route.params.registerConfig,
            exportKeyRingDatas: imported.KeyRingDatas,
            addressBooks: imported.addressBooks,
          }
        );
      }
    } catch (e) {
      console.log(e);
      setIsLoading(false);
      smartNavigation.goBack();
    }
  };

  return (
    <FullScreenCameraView
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={(scanningResult: BarcodeScanningResult) =>
        onBarcodeScanned(scanningResult)
      }
      scannerBottomText={
        "Connect to ASI Alliance Wallet\nbrowser extension by scanning a QR code"
      }
      isLoading={isLoading}
    />
  );
};
