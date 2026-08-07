import React, { FunctionComponent } from "react";
import { CardModal } from "modals/card";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { RectButton } from "components/rect-button";
import { TouchableOpacity } from "react-native-gesture-handler";
import { CheckIcon } from "components/new/icon/check";
import { EditIcon } from "components/new/icon/edit";
import { Button } from "components/button";
import { useStore } from "stores/index";
import {
  MultiKeyStoreInfoElem,
  MultiKeyStoreInfoWithSelectedElem,
} from "@keplr-wallet/background";
import { KeyRingStore } from "@keplr-wallet/stores";
import { BlurBackground } from "../blur-background/blur-background";
import { Bech32Address } from "@keplr-wallet/cosmos";
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
  onEditAccount?: () => void;
  onAddNewWallet?: () => void;
}> = ({
  close,
  title,
  isOpen,
  keyRingStore,
  onChangeAccount,
  onEditAccount,
  onAddNewWallet,
}) => {
  const style = useStyle();
  const { analyticsStore, accountStore, chainStore } = useStore();

  const chainId = chainStore.current.chainId;
  const accountInfo = accountStore.getAccount(chainId);

  if (!isOpen) {
    return null;
  }

  const socialIconStyle = {
    ...style.flatten([
      "border-width-1",
      "border-radius-4",
      "width-24",
      "height-20",
      "items-center",
      "justify-center",
      "margin-left-6",
    ]),
    borderColor: "#a1a3a3",
  } as ViewStyle;

  const getKeyStoreTypeLabel = (keyStore: MultiKeyStoreInfoElem) => {
    switch (keyStore.type) {
      case "ledger":
        return (
          <View
            style={
              {
                ...style.flatten([
                  "margin-left-6",
                  "border-width-1",
                  "border-radius-4",
                  "items-center",
                  "justify-center",
                ]),
                borderColor: "#a1a3a3",
              } as ViewStyle
            }
          >
            <Text
              style={
                [
                  style.flatten([
                    "font-medium",
                    "color-dark",
                    "margin-x-4",
                    "margin-y-1",
                    "text-center",
                  ]),
                  { fontSize: 10, textTransform: "uppercase" },
                ] as ViewStyle
              }
            >
              ledger
            </Text>
          </View>
        );

      case "privateKey":
        if (
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "apple"
        ) {
          return (
            <View style={socialIconStyle}>
              <SimpleAppleIcon />
            </View>
          );
        } else if (
          keyStore.meta?.["email"] &&
          keyStore.meta?.["socialType"] === "google"
        ) {
          return (
            <View style={socialIconStyle}>
              <SimpleGoogleIcon />
            </View>
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
            backgroundBlur={false}
            containerStyle={
              [
                style.flatten(["margin-bottom-6", "background-color-gray-5"]),
                keyStore.selected ? { backgroundColor: "#e0fedd" } : null,
              ] as ViewStyle
            }
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
                style.flatten([
                  "flex-row",
                  "items-center",
                  "padding-x-16",
                  "padding-y-18",
                  "border-radius-12",
                ]) as ViewStyle
              }
              underlayColor={style.flatten(["color-gray-50"]).color}
            >
              <View style={style.flatten(["flex-5"]) as ViewStyle}>
                <View
                  style={
                    style.flatten([
                      "flex-row",
                      "items-center",
                      "flex-1",
                    ]) as ViewStyle
                  }
                >
                  <Text
                    numberOfLines={1}
                    style={
                      [
                        style.flatten([
                          keyStore?.selected ? "h7" : "body3",
                          "color-dark",
                          "flex-shrink-1",
                        ]),
                      ] as ViewStyle
                    }
                  >
                    {(() => {
                      const nameByChain = keyStore.meta?.["nameByChain"]
                        ? JSON.parse(keyStore.meta["nameByChain"])
                        : {};
                      return (
                        nameByChain[chainId] ||
                        keyStore.meta?.["name"] ||
                        "Fetch Account"
                      );
                    })()}
                  </Text>
                  {getKeyStoreTypeLabel(keyStore)}
                </View>
                {keyStore.selected ? (
                  <Text
                    style={
                      style.flatten([
                        "text-caption2",
                        "color-gray-300",
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
              <View
                style={
                  style.flatten([
                    "flex-1",
                    "items-end",
                    "flex-row",
                    "justify-end",
                  ]) as ViewStyle
                }
              >
                {keyStore.selected ? (
                  <React.Fragment>
                    <CheckIcon size={16} />
                    {onEditAccount ? (
                      <TouchableOpacity
                        onPress={() => {
                          close();
                          onEditAccount();
                        }}
                        style={style.flatten(["margin-left-12"]) as ViewStyle}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <EditIcon size={16} />
                      </TouchableOpacity>
                    ) : null}
                  </React.Fragment>
                ) : null}
              </View>
            </RectButton>
          </BlurBackground>
        );
      })}
      {onAddNewWallet ? (
        <Button
          text="Add New Wallet"
          size="large"
          containerStyle={
            {
              ...style.flatten(["border-radius-32", "margin-top-12"]),
              backgroundColor: "#ffffff",
              borderWidth: 1,
              borderColor: "#DCDCE3",
            } as ViewStyle
          }
          textStyle={style.flatten(["color-dark", "body3"]) as ViewStyle}
          onPress={() => {
            close();
            onAddNewWallet();
          }}
        />
      ) : null}
    </CardModal>
  );
};
