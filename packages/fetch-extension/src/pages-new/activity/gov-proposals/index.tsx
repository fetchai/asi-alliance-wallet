import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useEffect, useState } from "react";
import {
  CHAIN_ID_DORADO,
  CHAIN_ID_FETCHHUB,
  CHAIN_ID_GEMINI,
} from "../../../config.ui.var";
import { useStore } from "../../../stores";
import { FilterActivities, FilterDropdown } from "../filter";
import { NoActivity } from "../no-activity";
import { UnsupportedNetwork } from "../unsupported-network";
import { govOptions } from "../utils";
import { ActivityRow } from "./activity-row";

export const GovProposalsTab: FunctionComponent<{ latestBlock: any }> =
  observer(({}) => {
    const { chainStore, analyticsStore, accountStore, activityStore } =
      useStore();
    const current = chainStore.current;
    const accountInfo = accountStore.getAccount(current.chainId);
    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState<string[]>(
      govOptions.map((option) => option.value)
    );
    const [isSelectAll, setIsSelectAll] = useState(true);
    const [isSaveChangesButtonDisabled, setIsSaveChangesButtonDisabled] =
      useState(true);
    const proposalNodes = activityStore.sortedNodesProposals;
    const accountOrChainChanged =
      activityStore.getAddress !== accountInfo.bech32Address ||
      activityStore.getChainId !== current.chainId;

    useEffect(() => {
      if (accountOrChainChanged) {
        activityStore.setAddress(accountInfo.bech32Address);
        activityStore.setChainId(current.chainId);
      }

      /* accountInit is required because in case of a reload, proposalNodes 
        becomes empty and should be updated with KVstore's saved nodes */
      if (accountInfo.bech32Address !== "") {
        activityStore.accountInit();
      }
    }, [
      accountInfo.bech32Address,
      current.chainId,
      accountOrChainChanged,
      activityStore,
    ]);

    const handleFilterChange = (selectedFilter: string[]) => {
      setFilter(selectedFilter);
      analyticsStore.logEvent("activity_filter_click", {
        tabName: "Gov Proposal",
        pageName: "Activity",
      });
    };

    const handleCheckboxChange = (value: string) => {
      const newFilters = filter.slice();
      if (newFilters.includes(value)) {
        setIsSelectAll(false);
        setFilter(newFilters.filter((item) => item !== value));
      } else {
        setFilter([...newFilters, value]);
        setIsSelectAll(filter.length === govOptions.length);
      }
      setIsSaveChangesButtonDisabled(false);
    };

    const handleDeselectClicks = () => {
      setIsSelectAll(false);
      setFilter([]);
      setIsSaveChangesButtonDisabled(false);
    };

    const handleSelectClicks = () => {
      setIsSelectAll(true);
      setFilter(govOptions.map((option) => option.value));
      setIsSaveChangesButtonDisabled(false);
    };

    const handleSaveChanges = () => {
      setIsSaveChangesButtonDisabled(true);
      handleFilterChange(filter);
      setIsOpen(false);
    };

    const isSupportedNetwork =
      current.chainId === CHAIN_ID_FETCHHUB ||
      current.chainId === CHAIN_ID_DORADO ||
      current.chainId === CHAIN_ID_GEMINI ||
      current.chainId === "test" ||
      current.chainId === "test-local";

    return (
      <React.Fragment>
        <FilterDropdown
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          options={govOptions}
          selectedFilter={filter}
          handleCheckboxChange={handleCheckboxChange}
          handleSaveChanges={handleSaveChanges}
          isSelectAll={isSelectAll}
          handleSelectClicks={handleSelectClicks}
          handleDeselectClicks={handleDeselectClicks}
          isSaveChangesButtonDisabled={isSaveChangesButtonDisabled}
        />
        <FilterActivities
          onFilterChange={handleFilterChange}
          options={govOptions}
          selectedFilter={filter}
          setIsOpen={setIsOpen}
          isOpen={isOpen}
        />
        {isSupportedNetwork ? (
          proposalNodes.length > 0 &&
          proposalNodes.filter((node: any) => filter.includes(node.option))
            .length > 0 ? (
            <React.Fragment>
              {proposalNodes
                .filter((node: any) => filter.includes(node.option))
                .map((node: any, index: any) => (
                  <ActivityRow node={node} key={index} />
                ))}
            </React.Fragment>
          ) : (
            <NoActivity label="No Gov Proposal Activity Yet" />
          )
        ) : (
          <UnsupportedNetwork chainID={current.chainName} />
        )}

        {filter.length === 0 && (
          <NoActivity label="No Gov Proposal Activity Yet" />
        )}
      </React.Fragment>
    );
  });
