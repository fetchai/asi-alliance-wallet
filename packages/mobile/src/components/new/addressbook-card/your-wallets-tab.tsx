import React, { FunctionComponent, useEffect, useState } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { RectButton } from "components/rect-button";
import { useStore } from "stores/index";
import { Bech32Address } from "@keplr-wallet/cosmos";
import { observer } from "mobx-react-lite";
import { SkeletonRow } from "./skeleton-row";
import {
  GetCosmosKeysForEachVaultSettledMsg,
  KeyInfo,
} from "@keplr-wallet/background";
import { SimpleAppleIcon } from "../icon/simple-apple";
import { SimpleGoogleIcon } from "../icon/simple-google";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { RNMessageRequesterInternal } from "../../../router";

const getKeyRingMeta = (keyInfo: KeyInfo): Record<string, any> => {
  return (keyInfo.insensitive?.["keyRingMeta"] as Record<string, any>) ?? {};
};

const getOptionIcon = (keyInfo: KeyInfo, style: any) => {
  const meta = getKeyRingMeta(keyInfo);
  const socialType = meta["socialType"] || meta["web3Auth"]?.["type"];
  const email = meta["email"] || meta["web3Auth"]?.["email"];
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

  if (keyInfo.type === "ledger") {
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

  if (keyInfo.type === "private-key" || keyInfo.type === "privateKey") {
    if (email && socialType === "apple") {
      return (
        <View style={socialIconStyle}>
          <SimpleAppleIcon />
        </View>
      );
    }
    if (email && socialType === "google") {
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
  onSelectRecipient: (address: string) => void;
  close: () => void;
}> = observer(({ onSelectRecipient, close }) => {
  const style = useStyle();
  const { chainStore, keyRingStore } = useStore();
  const chainId = chainStore.current.chainId;
  const isEvm = chainId.startsWith("eip155:");

  const [addressByVaultId, setAddressByVaultId] = useState<
    Record<string, string>
  >({});
  const [isLoadingWallets, setIsLoadingWallets] = useState(true);

  const otherWallets = keyRingStore.keyInfos.filter((k) => !k.isSelected);

  useEffect(() => {
    let cancelled = false;

    const fetchAddresses = async () => {
      if (keyRingStore.keyInfos.length === 0) {
        if (!cancelled) {
          setAddressByVaultId({});
          setIsLoadingWallets(false);
        }
        return;
      }

      setIsLoadingWallets(true);
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
      } finally {
        if (!cancelled) {
          setIsLoadingWallets(false);
        }
      }
    };

    void fetchAddresses();

    return () => {
      cancelled = true;
    };
  }, [chainId, isEvm, keyRingStore.keyInfos.length]);

  if (isLoadingWallets) {
    return (
      <View>
        {[0, 1].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </View>
    );
  }

  if (otherWallets.length === 0) {
    return (
      <Text
        style={
          style.flatten([
            "body3",
            "text-center",
            "color-gray-400",
            "margin-y-24",
          ]) as ViewStyle
        }
      >
        You don't have any other wallets added
      </Text>
    );
  }

  return (
    <View>
      {otherWallets.map((keyInfo) => {
        const meta = getKeyRingMeta(keyInfo);
        const nameByChain = meta["nameByChain"]
          ? JSON.parse(meta["nameByChain"])
          : {};
        const accountName =
          nameByChain?.[chainId] || keyInfo.name || "Fetch Account";
        const address = addressByVaultId[keyInfo.id];
        const optionIcon = getOptionIcon(keyInfo, style);

        return (
          <BlurBackground
            key={keyInfo.id}
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
              enabled={!!address}
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
                  {Bech32Address.shortenAddress(address, 32, isEvm)}
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
});
