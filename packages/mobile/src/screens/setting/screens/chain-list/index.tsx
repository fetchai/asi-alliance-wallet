import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "stores/index";
import { StyleSheet, Switch, Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import FastImage from "react-native-fast-image";
import { VectorCharacter } from "components/vector-character";
import { BlurBackground } from "components/new/blur-background/blur-background";
import { PageWithScrollView } from "components/page";
import { SearchIcon } from "components/new/icon/search-icon";
import { EmptyView } from "components/new/empty";
import { titleCase } from "utils/format/format";
import { InputCardView } from "components/new/card-view/input-card";

export const SettingChainListScreen: FunctionComponent = observer(() => {
  const { chainStore } = useStore();
  const style = useStyle();

  const isTestnetEnabled = useCallback(() => {
    const testnetList = chainStore.chainInfosWithUIConfig.filter(
      (item) => item.chainInfo.isTestnet
    );
    const testnetDisabledList = testnetList.filter((item) => !item.disabled);
    return testnetList.length === testnetDisabledList.length;
  }, [chainStore.chainInfosWithUIConfig]);

  const [isEnabled, setIsEnabled] = useState(isTestnetEnabled);
  const [search, setSearch] = useState("");
  const [filterChainInfos, setFilterChainInfos] = useState(
    chainStore.chainInfosWithUIConfig
  );

  useEffect(() => {
    setIsEnabled(isTestnetEnabled);
  }, [isTestnetEnabled]);

  useEffect(() => {
    const searchTrim = search.trim();
    const newChainInfos = chainStore.chainInfosWithUIConfig.filter(
      (chainInfoUI) => {
        return chainInfoUI.chainInfo.chainName
          .toLowerCase()
          .includes(searchTrim.toLowerCase());
      }
    );
    setFilterChainInfos(newChainInfos);
  }, [chainStore.chainInfosWithUIConfig, search]);

  return (
    <PageWithScrollView
      backgroundMode="secondary"
      contentContainerStyle={StyleSheet.flatten([
        style.flatten(["flex-grow-1"]),
        filterChainInfos.length === 0 ? { height: "100%" as const } : null,
      ])}
      hasFloatingHeader={true}
      style={style.flatten(["padding-x-page", "padding-y-page"]) as ViewStyle}
    >
      <View
        style={
          style.flatten([
            "flex-row",
            "items-center",
            "justify-between",
            "margin-bottom-24",
          ]) as ViewStyle
        }
      >
        <Text
          style={StyleSheet.flatten([
            style.flatten([
              "body3",
              "color-dark",
              "margin-right-18",
            ]) as ViewStyle,
          ])}
        >
          Show testnets
        </Text>
        <Switch
          trackColor={{
            false: "#DCDCE3",
            true: "#DCDCE3",
          }}
          thumbColor={isEnabled ? "#73A271" : "#9A9AA2"}
          onValueChange={(isToggleOn) => {
            chainStore.toggleMultipleChainInfoInUI(
              filterChainInfos
                .filter((chainInfoUI) => {
                  return chainInfoUI.chainInfo.isTestnet;
                })
                .map((chainInfoUI) => chainInfoUI.chainInfo.chainId),
              isToggleOn
            );
            setIsEnabled(isToggleOn);
          }}
          value={isEnabled}
        />
      </View>
      <InputCardView
        placeholder="Search"
        value={search}
        onChangeText={(text: string) => {
          setSearch(text);
        }}
        rightIcon={<SearchIcon size={12} color="black" />}
        containerStyle={style.flatten(["margin-bottom-24"]) as ViewStyle}
      />
      {/* <FlatList
        renderItem={({ item }) => <SettingChainListScreenElement {...item} />}
        keyExtractor={(item) => item.key}
        data={chainStore.chainInfosWithUIConfig.map((chainInfoUI, index) => {
          return {
            key: chainInfoUI.chainInfo.chainId,
            isFirst: index === 0,
            isLast: index === chainStore.chainInfosWithUIConfig.length - 1,
            chainId: chainInfoUI.chainInfo.chainId,
            chainName: chainInfoUI.chainInfo.chainName,
            chainSymbolImageUrl: chainInfoUI.chainInfo.raw.chainSymbolImageUrl,
            disabled: chainInfoUI.disabled,
          };
        })}
        scrollEnabled={false}
      /> */}
      {filterChainInfos.length === 0 ? (
        <EmptyView />
      ) : (
        filterChainInfos.map((chainInfoUI, index) => {
          return (
            <SettingChainListScreenElement
              key={chainInfoUI.chainInfo.chainId}
              isFirst={index === 0}
              isLast={index === chainStore.chainInfosWithUIConfig.length - 1}
              chainId={chainInfoUI.chainInfo.chainId}
              chainName={chainInfoUI.chainInfo.chainName}
              chainSymbolImageUrl={
                chainInfoUI.chainInfo.raw.chainSymbolImageUrl
              }
              disabled={chainInfoUI.disabled}
            />
          );
        })
      )}
      <View style={style.flatten(["height-page-double-pad"]) as ViewStyle} />
    </PageWithScrollView>
  );
});

export const SettingChainListScreenElement: FunctionComponent<{
  isFirst: boolean;
  isLast: boolean;

  chainId: string;
  chainName: string;
  chainSymbolImageUrl: string | undefined;
  disabled: boolean;
}> = observer(({ chainId, chainName, chainSymbolImageUrl, disabled }) => {
  const { chainStore } = useStore();

  const style = useStyle();

  return (
    <BlurBackground
      backgroundBlur={false}
      borderRadius={12}
      containerStyle={
        style.flatten([
          "flex-row",
          "height-62",
          "items-center",
          "margin-y-2",
          "padding-x-12",
          "background-color-gray-5",
        ]) as ViewStyle
      }
    >
      <BlurBackground
        backgroundBlur={false}
        containerStyle={
          {
            ...style.flatten([
              "width-32",
              "height-32",
              "border-radius-64",
              "items-center",
              "justify-center",
              "margin-right-12",
            ]),
            backgroundColor: "#dddfdf",
          } as ViewStyle
        }
      >
        {chainSymbolImageUrl ? (
          <FastImage
            style={{
              width: 22,
              height: 22,
            }}
            resizeMode={FastImage.resizeMode.contain}
            source={
              typeof chainSymbolImageUrl === "number"
                ? chainSymbolImageUrl
                : { uri: chainSymbolImageUrl }
            }
          />
        ) : (
          <VectorCharacter char={chainName[0]} color="#151a1a" height={15} />
        )}
      </BlurBackground>
      <View style={style.flatten(["justify-center"]) as ViewStyle}>
        <Text style={style.flatten(["subtitle3", "color-dark"]) as ViewStyle}>
          {titleCase(chainName)}
        </Text>
      </View>
      <View style={style.get("flex-1")} />
      <View>
        <Switch
          trackColor={{
            false: "#DCDCE3",
            true: "#DCDCE3",
          }}
          thumbColor={!disabled ? "#73A271" : "#9A9AA2"}
          onValueChange={(_) => {
            chainStore.toggleChainInfoInUI(chainId);
          }}
          value={!disabled}
        />
      </View>
    </BlurBackground>
  );
});
