import React, { FunctionComponent } from "react";
import { CardModal } from "modals/card";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { RectButton } from "components/rect-button";
import { CheckIcon } from "components/new/icon/check";
import { useStore } from "stores/index";
import {
  MultiKeyStoreInfoElem,
  MultiKeyStoreInfoWithSelectedElem,
} from "@keplr-wallet/background";
import { KeyRingStore } from "@keplr-wallet/stores";
import { BlurBackground } from "../blur-background/blur-background";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { IconButton } from "../button/icon";
import { SimpleGoogleIcon } from "../icon/simple-google";
import { SimpleAppleIcon } from "../icon/simple-apple";

export const ChangeWalletCardModel: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  title: string;
  keyRingStore: KeyRingStore;
  onChangeAccount: (
    keyStore: MultiKeyStoreInfoWithSelectedElem
  ) => Promise<void>;
}> = ({ close, title, isOpen, keyRingStore, onChangeAccount }) => {
  const style = useStyle();
  const { analyticsStore, accountStore, chainStore } = useStore();

  const accountInfo = accountStore.getAccount(chainStore.current.chainId);

  if (!isOpen) {
    return null;
  }

  const getKeyStoreTypeLabel = (keyStore: MultiKeyStoreInfoElem) => {
    switch (keyStore.type) {
      case "ledger":
        return (
          <View
            style={
              style.flatten([
                "margin-left-6",
                "border-width-1",
                "border-color-new-gray-500",
                "border-radius-4",
                "items-center",
                "justify-center",
              ]) as ViewStyle
            }
          >
            <Text
              style={
                [
                  style.flatten([
                    "font-medium",
                    "color-white",
                    "margin-x-4",
                    "margin-y-1",
                    "text-center",
                  ]),
                  {
                    fontSize: 10,
                    textTransform: "uppercase",
                  },
                ] as ViewStyle
              }
            >
              ledger
            </Text>
          </View>
        );

      case "privateKey":
        // Torus key
        if (
          keyStore.meta &&
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "apple"
        ) {
          return (
            <IconButton
              icon={<SimpleAppleIcon />}
              backgroundBlur={false}
              iconStyle={
                style.flatten([
                  "border-width-1",
                  "border-radius-4",
                  "border-color-new-gray-500",
                  "width-24",
                  "height-20",
                  "items-center",
                  "justify-center",
                  "margin-left-6",
                ]) as ViewStyle
              }
            />
          );
        } else if (
          keyStore.meta &&
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "google"
        ) {
          return (
            <IconButton
              icon={<SimpleGoogleIcon />}
              backgroundBlur={false}
              iconStyle={
                style.flatten([
                  "border-width-1",
                  "border-radius-4",
                  "border-color-new-gray-500",
                  "width-24",
                  "height-20",
                  "items-center",
                  "justify-center",
                  "margin-left-6",
                ]) as ViewStyle
              }
            />
          );
        }
        return;
    }
  };

  return (
    <CardModal isOpen={isOpen} title={title} close={() => close()}>
      {keyRingStore.multiKeyStoreInfo.map((keyStore, i) => {
        return (
          <BlurBackground
            key={i.toString()}
            borderRadius={12}
            blurIntensity={15}
            containerStyle={style.flatten(["margin-bottom-6"]) as ViewStyle}
          >
            <RectButton
              onPress={async () => {
                if (!keyStore?.selected) {
                  close();

                  await onChangeAccount(keyStore);
                  analyticsStore.logEvent("select_account_click", {
                    pageName: "Home",
                  });
                }
              }}
              activeOpacity={0.5}
              style={
                style.flatten(
                  [
                    "flex-row",
                    "items-center",
                    "padding-x-16",
                    "padding-y-18",

                    "border-radius-12",
                  ],
                  [keyStore.selected && "background-color-indigo"]
                ) as ViewStyle
              }
              underlayColor={style.flatten(["color-gray-50"]).color}
            >
              <View style={style.flatten(["flex-5"]) as ViewStyle}>
                <View
                  style={
                    style.flatten(["flex-row", "items-center"]) as ViewStyle
                  }
                >
                  <Text
                    style={
                      style.flatten([
                        keyStore?.selected ? "h7" : "body3",
                        "color-white",
                      ]) as ViewStyle
                    }
                  >
                    {keyStore.meta?.["name"] || "Fetch Account"}
                  </Text>
                  {getKeyStoreTypeLabel(keyStore)}
                </View>
                {keyStore.selected ? (
                  <Text
                    style={
                      style.flatten([
                        "text-caption2",
                        "color-white",
                        "margin-top-2",
                      ]) as ViewStyle
                    }
                  >
                    {Bech32Address.shortenAddress(
                      accountInfo.bech32Address,
                      32
                    )}
                  </Text>
                ) : null}
              </View>
              <View style={style.flatten(["flex-1", "items-end"]) as ViewStyle}>
                {keyStore.selected ? <CheckIcon /> : null}
              </View>
            </RectButton>
          </BlurBackground>
        );
      })}
    </CardModal>
  );
};
