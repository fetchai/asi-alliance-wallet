import React, { FunctionComponent, useEffect } from "react";
import { View, ViewStyle, FlatList, ActivityIndicator } from "react-native";
import { useStore } from "stores/index";
import { useStyle } from "styles/index";
import { CardDivider } from "components/card";
import { NoActivityView } from "screens/activity/activity-transaction/no-activity-view";
import { observer } from "mobx-react-lite";
import { GovActivityRow } from "screens/activity/gov-proposals/activity-row";
import { govOptions, processFilters } from "screens/activity/utils";
import { FilterItem, FilterView } from "components/filter";
import { isFeatureAvailable } from "utils/index";

export const GovProposalsTab: FunctionComponent<{
  isOpenModal: boolean;
  setIsOpenModal: any;
  nodes: any;
  setNodes: any;
  govFilters: FilterItem[];
  setGovFilters: any;
}> = observer(
  ({
    isOpenModal,
    setIsOpenModal,
    nodes,
    setNodes,
    govFilters,
    setGovFilters,
  }) => {
    const style = useStyle();
    const { chainStore, queriesStore, activityStore } = useStore();
    const current = chainStore.current;

    const queries = queriesStore.get(chainStore.current.chainId);
    const proposalLoading = queries.cosmos.queryGovernance.isFetching;

    const proposalNodes = activityStore.sortedNodesProposals;

    useEffect(() => {
      const timeout = setTimeout(() => {
        setNodes(proposalNodes);
      }, 3000);
      return () => {
        clearTimeout(timeout);
      };
    }, [proposalNodes]);

    useEffect(() => {
      setNodes(
        proposalNodes.filter((node: any) =>
          processFilters(govFilters).includes(node.option)
        )
      );
    }, [govFilters]);

    const handleFilterChange = (selectedFilters: FilterItem[]) => {
      setGovFilters(selectedFilters);
      setIsOpenModal(false);
    };

    const renderList = (nodes: [s: string] | unknown[]) => {
      return (
        <FlatList
          data={nodes}
          scrollEnabled={false}
          renderItem={({ item, index }: { item: any; index: number }) => {
            const isLastPos = index == nodes.length - 1;
            return (
              <React.Fragment key={index}>
                <GovActivityRow node={item} />
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
          // onEndReached={() => handleLoadMore()}
        />
      );
    };

    return (
      <React.Fragment>
        {isFeatureAvailable(current.chainId) &&
        nodes.length > 0 &&
        !proposalLoading ? (
          renderList(nodes)
        ) : proposalLoading ? (
          <ActivityIndicator
            size="large"
            color={style.get("color-white").color}
          />
        ) : (
          <NoActivityView />
        )}
        <FilterView
          isOpen={isOpenModal}
          filters={govFilters}
          handleFilterChange={handleFilterChange}
          close={() => setIsOpenModal(false)}
          options={govOptions}
        />
      </React.Fragment>
    );
  }
);
