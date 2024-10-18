import React, { FunctionComponent } from "react";
import { ChainInfo } from "@keplr-wallet/types";
import { useStyle } from "styles/index";
import * as WebBrowser from "expo-web-browser";
import { Image, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import Skeleton from "react-native-reanimated-skeleton";
import { BlurBackground } from "components/new/blur-background/blur-background";
import FastImage from "react-native-fast-image";
import { VectorCharacter } from "components/vector-character";
import { DotIcon } from "components/icon/dot";
import { BlurButton } from "components/new/button/blur-button";
import { GithubIcon } from "components/icon/github";

export const CommunityInfo: FunctionComponent<{
  isNotReady: boolean;
  chainInfo: ChainInfo;
  onPress?: () => void;
  communityChainInfoUrl?: string;
}> = ({ chainInfo, isNotReady, communityChainInfoUrl }) => {
  const style = useStyle();
  const chainSymbolImageUrl = chainInfo.chainSymbolImageUrl;

  const openWebView = () => {
    if (communityChainInfoUrl) {
      WebBrowser.openBrowserAsync(communityChainInfoUrl);
    }
  };
  return (
    <React.Fragment>
      <View style={style.flatten(["flex-row", "padding-y-8"]) as ViewStyle}>
        <Skeleton isLoading={isNotReady}>
          <BlurBackground
            backgroundBlur={true}
            containerStyle={
              style.flatten([
                "width-44",
                "height-44",
                "border-radius-64",
                "items-center",
                "justify-center",
                "margin-right-12",
              ]) as ViewStyle
            }
          >
            {chainSymbolImageUrl ? (
              <FastImage
                style={{ width: 32, height: 32 }}
                resizeMode={FastImage.resizeMode.contain}
                source={{ uri: chainSymbolImageUrl }}
              />
            ) : (
              <VectorCharacter
                char={chainInfo.chainName[0]}
                color="white"
                height={20}
              />
            )}
          </BlurBackground>
        </Skeleton>
        <View style={style.flatten(["flex-row", "items-center"]) as ViewStyle}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[...Array(3)].map((_, index) => (
              <DotIcon key={index} />
            ))}
          </View>
        </View>
        <Skeleton isLoading={isNotReady}>
          <BlurBackground
            backgroundBlur={true}
            containerStyle={
              style.flatten([
                "width-38",
                "height-38",
                "border-radius-64",
                "items-center",
                "justify-center",
                "margin-right-12",
              ]) as ViewStyle
            }
          >
            <Image
              source={require("assets/logo/app-icon.png")}
              style={{ width: 50, height: 50 }}
              resizeMode="cover"
            />
          </BlurBackground>
        </Skeleton>
      </View>
      <Text
        style={
          style.flatten([
            "flex-row",
            "color-white",
            "text-center",
            "h6",
          ]) as ViewStyle
        }
      >
        {`Add ${chainInfo.chainName}`}
      </Text>
      <TouchableOpacity
        style={style.flatten(["items-center", "margin-y-12"]) as ViewStyle}
        onPress={openWebView}
      >
        <BlurButton
          backgroundBlur={true}
          blurIntensity={12}
          rightIcon={<GithubIcon />}
          containerStyle={
            style.flatten([
              "padding-x-12",
              "margin-top-18",
              "border-radius-32",
            ]) as ViewStyle
          }
          textStyle={style.flatten(["h7", "color-white@70%"]) as ViewStyle}
          text="Community driven"
        />
      </TouchableOpacity>

      <Skeleton isLoading={isNotReady}>
        <Text
          style={style.flatten(["color-white@70%", "text-center"]) as ViewStyle}
        >
          {`ASI Wallet would like to add blockchain ${chainInfo.chainName}`}
        </Text>
      </Skeleton>
    </React.Fragment>
  );
};
