import React, { FunctionComponent } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { RectButton } from "components/rect-button";
import { useStore } from "stores/index";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { observer } from "mobx-react-lite";
import { SkeletonRow } from "./skeleton-row";
import { MultiKeyStoreInfoElem } from "@keplr-wallet/background";
import { SimpleAppleIcon } from "../icon/simple-apple";
import { SimpleGoogleIcon } from "../icon/simple-google";

const getOptionIcon = (keyStore: MultiKeyStoreInfoElem, style: any) => {
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

  if (keyStore.type === "ledger") {
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
  }

  if (keyStore.type === "privateKey") {
    if (keyStore.meta?.["email"] && keyStore.meta?.["socialType"] === "apple") {
      return (
        <View style={socialIconStyle}>
          <SimpleAppleIcon />
        </View>
      );
    }
    if (
      keyStore.meta?.["email"] &&
      keyStore.meta?.["socialType"] === "google"
    ) {
      return (
        <View style={socialIconStyle}>
          <SimpleGoogleIcon />
        </View>
      );
    }
  }

  return null;
};

export const YourWalletsTab: FunctionComponent<{
  isLoadingWallets: boolean;
  walletAddresses: string[];
  onSelectRecipient: (address: string) => void;
  close: () => void;
}> = observer(
  ({ isLoadingWallets, walletAddresses, onSelectRecipient, close }) => {
    const style = useStyle();
    const { chainStore, keyRingStore } = useStore();
    const chainId = chainStore.current.chainId;

    const otherWallets = keyRingStore.multiKeyStoreInfo.filter(
      (k) => !k.selected
    );

    if (isLoadingWallets) {
      return (
        <View>
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      );
    }

    return (
      <View>
        {otherWallets.map((keyStore, i) => {
          const nameByChain = keyStore.meta?.["nameByChain"]
            ? JSON.parse(keyStore.meta["nameByChain"])
            : {};
          const accountName =
            nameByChain?.[chainId] ||
            keyStore.meta?.["name"] ||
            "Fetch Account";
          const address = walletAddresses[i];
          const optionIcon = getOptionIcon(keyStore, style);

          return (
            <BlurBackground
              key={i.toString()}
              borderRadius={12}
              blurIntensity={0}
              containerStyle={
                [
                  style.flatten(["margin-bottom-4", "background-color-gray-5"]),
                ] as ViewStyle
              }
            >
              <RectButton
                onPress={() => {
                  if (address) {
                    onSelectRecipient(address);
                    close();
                  }
                }}
                activeOpacity={0.5}
                style={
                  style.flatten(["padding-12", "border-radius-12"]) as ViewStyle
                }
                underlayColor={"#e0e0e0"}
              >
                <View
                  style={
                    style.flatten([
                      "flex-row",
                      "items-center",
                      "padding-bottom-10",
                    ]) as ViewStyle
                  }
                >
                  <Text
                    style={style.flatten(["body3", "color-dark"]) as ViewStyle}
                  >
                    {accountName}
                  </Text>
                  {optionIcon}
                </View>
                {address ? (
                  <Text
                    style={
                      style.flatten([
                        "text-caption2",
                        "color-gray-300",
                      ]) as ViewStyle
                    }
                  >
                    {Bech32Address.shortenAddress(address, 32)}
                  </Text>
                ) : (
                  <View
                    style={{
                      height: 14,
                      width: 100,
                      borderRadius: 4,
                      backgroundColor: "#E0E0E0",
                    }}
                  />
                )}
              </RectButton>
            </BlurBackground>
          );
        })}
      </View>
    );
  }
);
