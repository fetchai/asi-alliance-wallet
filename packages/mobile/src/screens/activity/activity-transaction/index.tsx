import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ViewStyle,
  FlatList,
  ActivityIndicator,
} from "react-native";
import moment from "moment";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { CardDivider } from "components/card";
import { ActivityRow } from "./activity-row";
import { observer } from "mobx-react-lite";
import { NoActivityView } from "screens/activity/activity-transaction/no-activity-view";
import { processFilters, txOptions } from "screens/activity/utils";
import { FilterItem, FilterView } from "components/filter";
import { isFeatureAvailable } from "utils/index";

export const ActivityNativeTab: FunctionComponent<{
  isOpenModal: boolean;
  setIsOpenModal: any;
  activities: unknown[];
  setActivities: any;
  txnFilters: FilterItem[];
  setTxnFilters: any;
}> = observer(
  ({
    isOpenModal,
    setIsOpenModal,
    activities,
    setActivities,
    txnFilters,
    setTxnFilters,
  }) => {
    const style = useStyle();
    const { chainStore, activityStore } = useStore();
    const current = chainStore.current;

    const [_date, setDate] = useState("");

    const [isLoading, setIsLoading] = useState(true);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    function autoRefreshActivities() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (activities.length == 0) {
        if (activityStore.sortedNodes.length > 0) {
          setIsLoading(true);
          setActivities(activityStore.sortedNodes);
        } else {
          setIsLoading(false);
        }
      }

      intervalRef.current = setInterval(() => {
        if (activityStore.sortedNodes.length > 0) {
          setActivities(activityStore.sortedNodes);
        } else {
          setActivities([]);
        }
      }, 3000);
      // Clean up the interval on component unmount
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }

    useEffect(() => {
      autoRefreshActivities();
    }, [activityStore.sortedNodes]);

    const handleFilterChange = (selectedFilters: FilterItem[]) => {
      setTxnFilters(selectedFilters);
      setIsOpenModal(false);
    };

    const renderList = (nodes: [s: string] | unknown[]) => {
      return (
        <FlatList
          data={nodes}
          scrollEnabled={false}
          renderItem={({ item, index }: { item: any; index: number }) => {
            const isLastPos = index == nodes.length - 1;
            const currentDate = moment(item.block.timestamp).format(
              "MMMM DD, YYYY"
            );
            const previousNode: any = index > 0 ? nodes[index - 1] : null;
            const previousDate = previousNode
              ? moment(previousNode.block.timestamp).format("MMMM DD, YYYY")
              : null;
            const shouldDisplayDate = currentDate !== previousDate;

            return (
              <React.Fragment key={index}>
                {!shouldDisplayDate && (
                  <View style={style.flatten(["height-1"]) as ViewStyle} />
                )}
                {shouldDisplayDate && (
                  <Text
                    style={
                      style.flatten([
                        "color-gray-300",
                        "margin-left-16",
                        "body3",
                        "margin-bottom-12",
                      ]) as ViewStyle
                    }
                  >
                    {currentDate}
                  </Text>
                )}
                <ActivityRow setDate={setDate} node={item} />
                {isLastPos && (
                  <View style={style.get("height-page-pad") as ViewStyle} />
                )}
              </React.Fragment>
            );
          }}
          keyExtractor={(_item, index) => index.toString()}
          ItemSeparatorComponent={() => (
            <CardDivider style={style.flatten(["margin-y-16"]) as ViewStyle} />
          )}
        />
      );
    };

    const data = activities.filter((node: any) =>
      processFilters(txnFilters).includes(
        node.transaction.messages.nodes[0].typeUrl
      )
    );

    return (
      <React.Fragment>
        {isFeatureAvailable(current.chainId) &&
        data.length > 0 &&
        activities.length > 0 ? (
          renderList(data)
        ) : activities.length == 0 && isLoading ? (
          <ActivityIndicator
            size="large"
            color={style.get("color-white").color}
          />
        ) : (
          <NoActivityView />
        )}
        <FilterView
          isOpen={isOpenModal}
          filters={txnFilters}
          handleFilterChange={handleFilterChange}
          close={() => setIsOpenModal(false)}
          options={txOptions}
        />
      </React.Fragment>
    );
  }
);
