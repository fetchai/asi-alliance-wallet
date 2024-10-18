import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { useStore } from "stores/index";
import {
  DrawerActions,
  StackActions,
  useNavigation,
} from "@react-navigation/native";
import { Platform, Text, View, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "components/new/button/icon";
import { XmarkIcon } from "components/new/icon/xmark";
import { SearchIcon } from "components/new/icon/search-icon";
import { EmptyView } from "components/new/empty";
import { Button } from "components/button";
import { InputCardView } from "components/new/card-view/input-card";
import { TabBarView } from "components/new/tab-bar/tab-bar";
import { ChainInfosView } from "components/drawer/chain-infos-view";

export enum NetworkEnum {
  Cosmos = "Cosmos",
  EVM = "EVM",
}

export const DrawerContent: FunctionComponent<DrawerContentComponentProps> =
  observer((props) => {
    const { chainStore, analyticsStore } = useStore();
    const navigation = useNavigation();
    const [selectedTab, setSelectedTab] = useState(NetworkEnum.Cosmos);
    const safeAreaInsets = useSafeAreaInsets();
    const { ...rest } = props;
    const style = useStyle();
    const [search, setSearch] = useState("");
    const [filterChainInfos, setFilterChainInfos] = useState(
      chainStore.chainInfosInUI
    );
    const mainChainList = chainStore.chainInfos.filter(
      (chainInfo) => !chainInfo.beta && !chainInfo.features?.includes("evm")
    );
    const evmChainList = chainStore.chainInfos.filter((chainInfo) =>
      chainInfo.features?.includes("evm")
    );

    useEffect(() => {
      const searchTrim = search.trim().toLowerCase();
      const filteredChains =
        selectedTab == NetworkEnum.Cosmos
          ? mainChainList.filter((chainInfo) =>
              chainInfo.chainName.toLowerCase().includes(searchTrim)
            )
          : evmChainList.filter((chainInfo) =>
              chainInfo.chainName.toLowerCase().includes(searchTrim)
            );
      setFilterChainInfos(filteredChains);
    }, [chainStore.chainInfosInUI, search, selectedTab]);

    return (
      <DrawerContentScrollView
        style={
          style.flatten([
            "background-color-indigo-900",
            "dark:background-color-platinum-600",
            "padding-x-page",
          ]) as ViewStyle
        }
        contentContainerStyle={{
          paddingTop: Platform.OS === "ios" ? safeAreaInsets.top + 10 : 48,
          height: filterChainInfos.length === 0 ? "100%" : undefined,
        }}
        {...rest}
      >
        <View style={{ marginBottom: safeAreaInsets.bottom }}>
          <View
            style={
              style.flatten([
                "items-center",
                "height-32",
                "flex-row",
              ]) as ViewStyle
            }
          >
            <Text
              style={style.flatten(["subtitle2", "color-white"]) as ViewStyle}
            >
              Change Network
            </Text>
            <View style={style.get("flex-1")} />
            <IconButton
              icon={<XmarkIcon color={"white"} />}
              onPress={() => {
                setSearch("");
                navigation.dispatch(DrawerActions.closeDrawer());
              }}
              iconStyle={
                style.flatten([
                  "padding-8",
                  "border-width-1",
                  "border-color-gray-400",
                ]) as ViewStyle
              }
            />
          </View>
          <TabBarView
            listItem={NetworkEnum}
            selected={selectedTab}
            setSelected={setSelectedTab}
            containerStyle={style.flatten(["margin-y-20"]) as ViewStyle}
          />
          <InputCardView
            placeholder="Search"
            placeholderTextColor={"white"}
            value={search}
            onChangeText={setSearch}
            rightIcon={<SearchIcon size={12} />}
            containerStyle={style.flatten(["margin-top-24"]) as ViewStyle}
          />
          <Button
            containerStyle={
              style.flatten([
                "border-radius-32",
                "border-color-white@40%",
                "margin-y-24",
              ]) as ViewStyle
            }
            mode="outline"
            textStyle={style.flatten(["color-white", "body3"]) as ViewStyle}
            text="Manage networks"
            onPress={() => {
              navigation.dispatch(
                StackActions.push("ChainList", {
                  screen: "Setting.ChainList",
                  params: { selectedTab: selectedTab },
                })
              );
              analyticsStore.logEvent("manage_networks_click", {
                pageName: "Home",
              });
            }}
          />
          {filterChainInfos.length === 0 ? (
            <EmptyView />
          ) : (
            <ChainInfosView
              chainInfos={filterChainInfos}
              onPress={(chainInfo) => {
                setSearch("");
                chainStore.selectChain(chainInfo.chainId);
                chainStore.saveLastViewChainId();
                navigation.dispatch(DrawerActions.closeDrawer());
              }}
            />
          )}
        </View>
        <View style={style.flatten(["height-page-pad"]) as ViewStyle} />
      </DrawerContentScrollView>
    );
  });
