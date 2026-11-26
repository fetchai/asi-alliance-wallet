import React, { useEffect, useState } from "react";
import { PageWithViewInBottomTabView } from "components/page";
import { Platform, ScrollView, Text, ViewStyle } from "react-native";
import { useStyle } from "styles/index";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChipButton } from "components/new/chip";
import { FilterIcon } from "components/new/icon/filter-icon";
import { ActivityNativeTab } from "screens/activity/activity-transaction";
import { useStore } from "stores/index";
import { observer } from "mobx-react-lite";
import { isFeatureAvailable } from "utils/index";
import { TabBarView } from "components/new/tab-bar/tab-bar";
import { RouteProp, useRoute } from "@react-navigation/native";
import { GovProposalsTab } from "screens/activity/gov-proposals";
import { FilterItem } from "components/filter";
import { govOptions, txOptions } from "./utils";

export enum ActivityEnum {
  Transactions = "Transactions",
  GovProposals = "Gov Proposals",
}

export const ActivityScreen = observer(() => {
  const route = useRoute<
    RouteProp<
      Record<
        string,
        {
          tabId?: ActivityEnum;
        }
      >,
      string
    >
  >();

  const tabId = route?.params?.tabId || ActivityEnum.Transactions;

  const style = useStyle();
  const [selectedId, setSelectedId] = useState(tabId);
  const safeAreaInsets = useSafeAreaInsets();
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [govProposalsNodes, setGovProposalsNodes] = useState<any>({});
  const [activities, setActivities] = useState<unknown[]>([]);
  const [govFilters, setGovFilters] = useState<FilterItem[]>(govOptions);
  const [txnFilters, setTxnFilters] = useState<FilterItem[]>(txOptions);

  const { analyticsStore, chainStore, accountStore, activityStore } =
    useStore();
  const accountInfo = accountStore.getAccount(chainStore.current.chainId);

  const accountOrChainChanged =
    activityStore.getAddress !== accountInfo.bech32Address ||
    activityStore.getChainId !== chainStore.current.chainId;

  const logTabChange = (tabName: ActivityEnum) => {
    const eventName =
      tabName === ActivityEnum.Transactions
        ? "activity_transaction_tab_click"
        : "activity_gov_proposal_tab_click";
    analyticsStore.logEvent(eventName, {
      pageName: "Activity",
    });
  };

  useEffect(() => {
    setSelectedId(tabId);
  }, [route?.params, chainStore.current.chainId, accountInfo.bech32Address]);

  useEffect(() => {
    logTabChange(selectedId);
  }, [selectedId]);

  useEffect(() => {
    setTxnFilters(txOptions);
    setGovFilters(govOptions);
  }, [accountOrChainChanged]);

  return (
    <PageWithViewInBottomTabView
      backgroundMode={"image"}
      isTransparentHeader={true}
      style={{
        paddingTop: Platform.OS === "ios" ? safeAreaInsets.top + 10 : 48,
        flexGrow: 1,
      }}
    >
      {isFeatureAvailable(chainStore.current.chainId) && (
        <View
          style={style.flatten(["items-end", "margin-x-page"]) as ViewStyle}
        >
          <ChipButton
            text="Filter"
            icon={<FilterIcon />}
            iconStyle={style.get("padding-top-2") as ViewStyle}
            containerStyle={
              style.flatten([
                "border-width-1",
                "border-color-gray-300",
              ]) as ViewStyle
            }
            backgroundBlur={false}
            onPress={() => {
              setIsOpenModal(true);
              analyticsStore.logEvent("activity_filter_click", {
                tabName: selectedId.toString(),
                pageName: "Activity",
              });
            }}
          />
        </View>
      )}
      <Text
        style={
          style.flatten([
            "h1",
            "color-white",
            "margin-x-18",
            "margin-y-16",
            "font-normal",
          ]) as ViewStyle
        }
      >
        Activity
      </Text>
      <TabBarView
        listItem={ActivityEnum}
        selected={selectedId}
        setSelected={setSelectedId}
        containerStyle={style.flatten(["margin-x-20"]) as ViewStyle}
      />
      <ScrollView
        indicatorStyle={"white"}
        contentContainerStyle={
          style.flatten(["margin-y-16", "flex-grow-1"]) as ViewStyle
        }
      >
        <View
          style={style.flatten(["height-full", "justify-center"]) as ViewStyle}
        >
          {selectedId === ActivityEnum.Transactions ? (
            <ActivityNativeTab
              isOpenModal={isOpenModal}
              setIsOpenModal={setIsOpenModal}
              activities={activities}
              setActivities={setActivities}
              txnFilters={txnFilters}
              setTxnFilters={setTxnFilters}
            />
          ) : (
            <GovProposalsTab
              isOpenModal={isOpenModal}
              setIsOpenModal={setIsOpenModal}
              nodes={govProposalsNodes}
              setNodes={setGovProposalsNodes}
              govFilters={govFilters}
              setGovFilters={setGovFilters}
            />
          )}
        </View>
      </ScrollView>
    </PageWithViewInBottomTabView>
  );
});
