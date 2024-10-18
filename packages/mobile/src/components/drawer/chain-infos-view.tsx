import React, { FunctionComponent, useState } from "react";
import { Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { RectButton } from "components/rect-button";
import FastImage from "react-native-fast-image";
import { VectorCharacter } from "components/vector-character";
import { titleCase } from "utils/format/format";
import { CheckIcon } from "components/new/icon/check";
import { ChainInfoWithCoreTypes } from "@keplr-wallet/background";
import { ChainInfoInner } from "@keplr-wallet/stores";
import { useStore } from "stores/index";
import { XmarkIcon } from "components/new/icon/xmark";
import Toast from "react-native-toast-message";
import { ConfirmCardModel } from "components/new/confirm-modal";

interface ChainInfosViewProps {
  chainInfos: ChainInfoInner<ChainInfoWithCoreTypes>[];
  onPress: (chainInfo: ChainInfoInner<ChainInfoWithCoreTypes>) => void;
}

export const ChainInfosView: FunctionComponent<ChainInfosViewProps> = ({
  chainInfos,
  onPress,
}) => {
  const style = useStyle();
  const { chainStore } = useStore();
  const betaChainList = chainStore.chainInfosInUI.filter(
    (chainInfo) => chainInfo.beta
  );
  const [showConfirmModal, setConfirmModal] = useState(false);
  const [removedChain, setRemovedChain] =
    useState<ChainInfoInner<ChainInfoWithCoreTypes> | null>(null);
  const renderTokenIcon = (
    chainInfo: ChainInfoInner<ChainInfoWithCoreTypes>
  ) => {
    const { chainSymbolImageUrl, chainName } = chainInfo.raw;
    return chainSymbolImageUrl && chainSymbolImageUrl.startsWith("http") ? (
      <FastImage
        style={{ width: 22, height: 22 }}
        resizeMode={FastImage.resizeMode.contain}
        source={{ uri: chainSymbolImageUrl }}
      />
    ) : (
      <VectorCharacter char={chainName[0]} color="white" height={12} />
    );
  };

  const handleRemoveChain = async (
    chainInfo: ChainInfoInner<ChainInfoWithCoreTypes>
  ) => {
    try {
      await chainStore.removeChainInfo(chainInfo.chainId);
      Toast.show({
        type: "success",
        text1: "Chain removed successfully!",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Failed to remove chain.",
        text2: error?.message || "An unexpected error occurred.",
      });
    }
    setConfirmModal(false);
  };

  const handleConfirmRemove = (
    chainInfo: ChainInfoInner<ChainInfoWithCoreTypes>
  ) => {
    setRemovedChain(chainInfo);
    setConfirmModal(true);
  };

  return (
    <React.Fragment>
      {chainInfos.map((chainInfo) => {
        const selected = chainStore.current.chainId === chainInfo.chainId;
        const isBeta = betaChainList.some(
          (betaChain) => betaChain.chainId === chainInfo.chainId
        );

        return (
          <BlurBackground
            key={chainInfo.chainId}
            borderRadius={12}
            blurIntensity={15}
            containerStyle={style.flatten(["margin-y-2"]) as ViewStyle}
          >
            <RectButton
              onPress={() => onPress(chainInfo)}
              style={
                style.flatten(
                  [
                    "flex-row",
                    "height-62",
                    "items-center",
                    "padding-x-12",
                    "justify-between",
                  ],
                  [selected && "background-color-indigo", "border-radius-12"]
                ) as ViewStyle
              }
              activeOpacity={0.5}
              underlayColor={
                style.flatten(["color-gray-50", "dark:color-platinum-500"])
                  .color
              }
            >
              <View
                style={style.flatten(["flex-row", "items-center"]) as ViewStyle}
              >
                <BlurBackground
                  containerStyle={
                    style.flatten([
                      "width-32",
                      "height-32",
                      "border-radius-64",
                      "items-center",
                      "justify-center",
                      "margin-right-12",
                    ]) as ViewStyle
                  }
                >
                  {renderTokenIcon(chainInfo)}
                </BlurBackground>
                <Text
                  style={
                    style.flatten(["subtitle3", "color-white"]) as ViewStyle
                  }
                >
                  {titleCase(chainInfo.chainName)}
                </Text>
              </View>
              <View style={style.flatten(["flex-row", "items-center"])}>
                {selected ? (
                  <CheckIcon />
                ) : (
                  isBeta && (
                    <BlurBackground
                      borderRadius={50}
                      blurIntensity={40}
                      blurType="dark"
                      containerStyle={
                        style.flatten([
                          "width-24",
                          "height-24",
                          "items-center",
                          "justify-center",
                          "border-width-1",
                          "border-color-white@20%",
                        ]) as ViewStyle
                      }
                      onPress={() => handleConfirmRemove(chainInfo)}
                    >
                      <XmarkIcon color="white" size={10} />
                    </BlurBackground>
                  )
                )}
              </View>
            </RectButton>
          </BlurBackground>
        );
      })}
      {removedChain && (
        <ConfirmCardModel
          isOpen={showConfirmModal}
          close={() => setConfirmModal(false)}
          title="Remove Chain"
          subtitle={`Are you sure you want to remove ${removedChain.chainName}?`}
          select={async (confirm: boolean) => {
            if (confirm && removedChain) {
              await handleRemoveChain(removedChain);
            }
          }}
        />
      )}
    </React.Fragment>
  );
};
