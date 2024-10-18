import React, { FunctionComponent, useEffect, useState } from "react";
import { InteractionWaitingData } from "@keplr-wallet/background";
import { ChainInfo } from "@keplr-wallet/types";
import { observer } from "mobx-react-lite";
import { useStyle } from "styles/index";
import { useStore } from "stores/index";
import { View, ViewStyle } from "react-native";
import { CommunityInfo } from "modals/chain-suggestion/community-info";
import { BlurButton } from "components/new/button/blur-button";

export const SuggestChainPageImpl: FunctionComponent<{
  waitingData: InteractionWaitingData<{
    chainInfo: ChainInfo;
    origin: string;
  }>;
}> = observer(({ waitingData }) => {
  const style = useStyle();
  const { chainSuggestStore } = useStore();
  const [isLoadingPlaceholder, setIsLoadingPlaceholder] = useState(true);
  const queryCommunityChainInfo = chainSuggestStore.getCommunityChainInfo(
    waitingData?.data.chainInfo.chainId
  );
  const communityChainInfo = queryCommunityChainInfo.chainInfo;

  useEffect(() => {
    if (!queryCommunityChainInfo.isLoading) {
      setIsLoadingPlaceholder(false);
    }
  }, [queryCommunityChainInfo.isLoading]);

  useEffect(() => {
    setTimeout(() => {
      setIsLoadingPlaceholder(false);
    }, 3000);
  }, []);

  const reject = async () => {
    await chainSuggestStore.reject();
  };

  const approve = async () => {
    const chainInfo = communityChainInfo || waitingData.data.chainInfo;
    console.log("Hey", waitingData.data.chainInfo);
    console.log("Hey2", communityChainInfo);
    await chainSuggestStore.approve({
      ...chainInfo,
      updateFromRepoDisabled: false,
    });
  };

  return (
    <View style={[style.flatten(["flex-column"])] as ViewStyle}>
      <CommunityInfo
        isNotReady={isLoadingPlaceholder}
        chainInfo={waitingData.data.chainInfo}
        communityChainInfoUrl={chainSuggestStore.getCommunityChainInfoUrl(
          waitingData.data.chainInfo.chainId,
          waitingData?.data.chainInfo?.features?.includes("evm")
        )}
      />
      <View
        style={
          style.flatten([
            "flex-row",
            "justify-between",
            "padding-y-12",
            "margin-y-8",
          ]) as ViewStyle
        }
      >
        <BlurButton
          text="Reject"
          backgroundBlur={false}
          borderRadius={32}
          onPress={reject}
          containerStyle={
            style.flatten([
              "border-width-1",
              "padding-y-6",
              "margin-y-2",
              "border-color-gray-300",
              "width-160",
              "justify-center",
            ]) as ViewStyle
          }
          textStyle={style.flatten(["body3", "color-white"]) as ViewStyle}
        />
        <BlurButton
          text={"Approve"}
          backgroundBlur={false}
          borderRadius={32}
          onPress={approve}
          containerStyle={
            style.flatten([
              "border-width-1",
              "border-color-gray-300",
              "padding-x-20",
              "padding-y-6",
              "margin-y-2",
              "width-160",
              "justify-center",
            ]) as ViewStyle
          }
          textStyle={style.flatten(["body3", "color-white"]) as ViewStyle}
        />
      </View>
    </View>
  );
});
