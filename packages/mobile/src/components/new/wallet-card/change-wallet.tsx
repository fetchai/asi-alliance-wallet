import React, { FunctionComponent, useEffect, useState } from "react";
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
  GetCosmosKeysForEachVaultSettledMsg,
  KeyInfo,
} from "@keplr-wallet/background";
import { KeyRingStore } from "@keplr-wallet/stores-core";
import { BlurBackground } from "../blur-background/blur-background";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { SimpleGoogleIcon } from "../icon/simple-google";
import { SimpleAppleIcon } from "../icon/simple-apple";
import { observer } from "mobx-react-lite";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { RNMessageRequesterInternal } from "../../../router";

const getKeyRingMeta = (keyInfo: KeyInfo): Record<string, any> => {
  return (keyInfo.insensitive?.["keyRingMeta"] as Record<string, any>) ?? {};
};

export const ChangeWalletCardModel: FunctionComponent<{
  isOpen: boolean;
  close: () => void;
  title: string;
  keyRingStore: KeyRingStore;
  onChangeAccount: (keyInfo: KeyInfo) => Promise<void>;
  onEditAccount?: () => void;
  onAddNewWallet?: () => void;
}> = observer(
  ({
    close,
    title,
    isOpen,
    keyRingStore,
    onChangeAccount,
    onEditAccount,
    onAddNewWallet,
  }) => {
    const style = useStyle();
    const { analyticsStore, chainStore } = useStore();

    const chainId = chainStore.current.chainId;
    const isEvm = chainId.startsWith("eip155:");
    const [addressByVaultId, setAddressByVaultId] = useState<
      Record<string, string>
    >({});

    useEffect(() => {
      if (!isOpen) {
        return;
      }

      let cancelled = false;

      const fetchAddresses = async () => {
        if (keyRingStore.keyInfos.length === 0) {
          if (!cancelled) {
            setAddressByVaultId({});
          }
          return;
        }

        try {
          const requester = new RNMessageRequesterInternal();
          const settledResponse = await requester.sendMessage(
            BACKGROUND_PORT,
            new GetCosmosKeysForEachVaultSettledMsg(
              chainId,
              keyRingStore.keyInfos.map((item) => item.id)
            )
          );

          if (cancelled) {
            return;
          }

          const next: Record<string, string> = {};
          for (const item of settledResponse) {
            if (item.status === "fulfilled" && item.value) {
              const address = isEvm
                ? item.value.ethereumHexAddress?.trim()
                : item.value.bech32Address?.trim();
              if (address) {
                next[item.value.vaultId] = address;
              }
            }
          }
          setAddressByVaultId(next);
        } catch {
          if (!cancelled) {
            setAddressByVaultId({});
          }
        }
      };

      void fetchAddresses();

      return () => {
        cancelled = true;
      };
    }, [isOpen, chainId, isEvm, keyRingStore.keyInfos.length]);

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

    const getKeyStoreTypeLabel = (keyInfo: KeyInfo) => {
      const meta = getKeyRingMeta(keyInfo);
      const socialType = meta["socialType"] || meta["web3Auth"]?.["type"];
      const email = meta["email"] || meta["web3Auth"]?.["email"];

      switch (keyInfo.type) {
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

        case "private-key":
        case "privateKey":
          if (email && socialType === "apple") {
            return (
              <View style={socialIconStyle}>
                <SimpleAppleIcon />
              </View>
            );
          } else if (email && socialType === "google") {
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
        {keyRingStore.keyInfos.map((keyInfo) => {
          const address = addressByVaultId[keyInfo.id];

          return (
            <BlurBackground
              key={keyInfo.id}
              borderRadius={12}
              backgroundBlur={false}
              containerStyle={
                [
                  style.flatten(["margin-bottom-6", "background-color-gray-5"]),
                  keyInfo.isSelected ? { backgroundColor: "#e0fedd" } : null,
                ] as ViewStyle
              }
            >
              <RectButton
                onPress={async () => {
                  if (!keyInfo.isSelected) {
                    close();

                    await onChangeAccount(keyInfo);
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
                            keyInfo.isSelected ? "h7" : "body3",
                            "color-dark",
                            "flex-shrink-1",
                          ]),
                        ] as ViewStyle
                      }
                    >
                      {(() => {
                        const meta = getKeyRingMeta(keyInfo);
                        const nameByChain = meta["nameByChain"]
                          ? JSON.parse(meta["nameByChain"])
                          : {};
                        return (
                          nameByChain[chainId] ||
                          keyInfo.name ||
                          "Fetch Account"
                        );
                      })()}
                    </Text>
                    {getKeyStoreTypeLabel(keyInfo)}
                  </View>
                  {address ? (
                    <Text
                      style={
                        style.flatten([
                          "text-caption2",
                          "color-gray-300",
                          "margin-top-2",
                        ]) as ViewStyle
                      }
                    >
                      {Bech32Address.shortenAddress(address, 32, isEvm)}
                    </Text>
                  ) : (
                    <View
                      style={{
                        height: 14,
                        width: 100,
                        borderRadius: 4,
                        backgroundColor: "#E0E0E0",
                        marginTop: 2,
                      }}
                    />
                  )}
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
                  {keyInfo.isSelected ? (
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
  }
);
