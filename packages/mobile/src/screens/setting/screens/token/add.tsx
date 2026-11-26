import React, { FunctionComponent, useState } from "react";
import { PageWithScrollView } from "components/page";
import { View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { Button } from "components/button";
import { useRecipientConfig } from "@keplr-wallet/hooks";
import { useStore } from "stores/index";
import { InputCardView } from "components/new/card-view/input-card";
import { TokenAddressInput } from "components/new/input/token-address";
import { useSmartNavigation } from "navigation/smart-navigation";
import { observer } from "mobx-react-lite";

export const SettingAddTokenScreen: FunctionComponent = observer(() => {
  const { chainStore, queriesStore, tokensStore, analyticsStore } = useStore();
  const [loading, setIsLoading] = useState(false);

  const smartNavigation = useSmartNavigation();

  const style = useStyle();

  const recipientConfig = useRecipientConfig(
    chainStore,
    chainStore.current.chainId
  );

  const queryTokenInfo = queriesStore
    .get(chainStore.current.chainId)
    .cosmwasm.querycw20ContractInfo.getQueryContract(recipientConfig.recipient);

  return (
    <PageWithScrollView
      backgroundMode="image"
      contentContainerStyle={style.get("flex-grow-1")}
      style={style.flatten(["padding-x-page"]) as ViewStyle}
    >
      <TokenAddressInput
        label="Contract Address"
        recipientConfig={recipientConfig}
        queryTokenInfo={queryTokenInfo}
        containerStyle={style.flatten(["margin-y-4"]) as ViewStyle}
      />
      <InputCardView
        label="Name"
        editable={false}
        value={queryTokenInfo.tokenInfo?.name ?? ""}
        containerStyle={style.flatten(["margin-y-4"]) as ViewStyle}
      />
      <InputCardView
        label="Symbol"
        editable={false}
        value={queryTokenInfo.tokenInfo?.symbol ?? ""}
        containerStyle={style.flatten(["margin-y-4"]) as ViewStyle}
      />
      <InputCardView
        label="Decimals"
        editable={false}
        value={queryTokenInfo.tokenInfo?.decimals.toString() ?? ""}
        containerStyle={style.flatten(["margin-y-2"]) as ViewStyle}
      />
      <View style={style.get("flex-1")} />
      <Button
        text="Save"
        size="large"
        containerStyle={
          style.flatten(["border-radius-32", "margin-top-20"]) as ViewStyle
        }
        textStyle={style.flatten(["body2", "font-normal"]) as ViewStyle}
        disabled={!queryTokenInfo.tokenInfo || queryTokenInfo.error != null}
        loading={!queryTokenInfo.tokenInfo && loading}
        onPress={async () => {
          setIsLoading(true);
          if (queryTokenInfo.tokenInfo) {
            await tokensStore.getTokensOf(chainStore.current.chainId).addToken({
              type: "cw20",
              contractAddress: recipientConfig.recipient,
              coinMinimalDenom: queryTokenInfo.tokenInfo.name,
              coinDenom: queryTokenInfo.tokenInfo.symbol,
              coinDecimals: queryTokenInfo.tokenInfo.decimals,
            });

            analyticsStore.logEvent("save_click", {
              pageName: "More",
            });
            if (smartNavigation.canGoBack()) {
              smartNavigation.goBack();
            }
          }
          setIsLoading(false);
        }}
      />
      <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
    </PageWithScrollView>
  );
});
