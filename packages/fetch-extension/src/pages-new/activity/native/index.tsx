import { observer } from "mobx-react-lite";
import moment from "moment";
import React, { useEffect, useState } from "react";

import { useStore } from "../../../stores";
import { FilterActivities, FilterDropdown } from "../filter";
import style from "../style.module.scss";
import { ActivityRow } from "./activity-row";
import styles from "./style.module.scss";
import { NoActivity } from "../no-activity";
import { UnsupportedNetwork } from "../unsupported-network";

const options = [
  {
    icon: require("@assets/svg/wireframe/arrow-down.svg"),
    value: "/cosmos.bank.v1beta1.MsgSend",
    label: "Funds transfers",
  },
  {
    icon: require("@assets/svg/wireframe/stake.svg"),
    value: "/cosmos.staking.v1beta1.MsgDelegate",
    label: "Staked Funds",
  },
  {
    icon: require("@assets/svg/wireframe/hand-holding-seedling.svg"),
    value: "/cosmos.staking.v1beta1.MsgUndelegate",
    label: "Unstaked Funds",
  },
  {
    icon: require("@assets/svg/wireframe/rename.svg"),
    value: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
    label: "Redelegate Funds",
  },
  {
    icon: require("@assets/svg/wireframe/contract-integration-transparent.svg"),
    value:
      "/cosmos.authz.v1beta1.MsgExec,/cosmwasm.wasm.v1.MsgExecuteContract,/cosmos.authz.v1beta1.MsgRevoke",
    label: "Contract Interactions",
  },
  {
    icon: require("@assets/svg/wireframe/gem.svg"),
    value: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
    label: "Claim Rewards",
  },
  {
    icon: require("@assets/svg/wireframe/arrow-down-up-across-line.svg"),
    value: "/ibc.applications.transfer.v1.MsgTransfer",
    label: "IBC transfers",
  },
];

const processFilters = (filters: string[]) => {
  let result: string[] = [];
  filters.map((value) => {
    result = result.concat(value.split(","));
  });
  return result;
};

export const NativeTab = observer(() => {
  const { chainStore, accountStore, analyticsStore, activityStore } =
    useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);
  const isActivitySupported = !(current.features?.includes("evm") ?? false);
  const [isOpen, setIsOpen] = useState(false);
  const [_date, setDate] = useState("");
  const [activities, setActivities] = useState<unknown[]>([]);
  const [isSelectAll, setIsSelectAll] = useState(true);
  const [isSaveChangesButtonDisabled, setIsSaveChangesButtonDisabled] =
    useState(true);
  const [filter, setFilter] = useState<string[]>(
    options.map((option) => option.value)
  );

  const [selectedFilter, setSelectedFilter] = useState<string[]>(
    options.map((option) => option.value)
  );

  // const [isError, setIsError] = useState(false);

  const accountOrChainChanged =
    activityStore.getAddress !== accountInfo.bech32Address ||
    activityStore.getChainId !== current.chainId;

  useEffect(() => {
    // this is required because accountInit sets the nodes on reload, so we wait for accountInit to set the node and then setActivities
    // else activityStore.getNodes will be empty
    const timeout = setTimeout(() => {
      setActivities(activityStore.sortedNodes);
    }, 100);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (activityStore.checkIsNodeUpdated === true) {
      setActivities(activityStore.sortedNodes);
      activityStore.setIsNodeUpdated(false);
    }
  }, [activityStore.checkIsNodeUpdated]);

  useEffect(() => {
    if (accountOrChainChanged) {
      activityStore.setAddress(accountInfo.bech32Address);
      activityStore.setChainId(current.chainId);
    }

    //accountInit is required because in case of a reload, this.nodes becomes empty and should be updated with KVstore's saved nodes
    if (accountInfo.bech32Address !== "") {
      activityStore.accountInit();
    }
  }, [
    accountInfo.bech32Address,
    current.chainId,
    accountOrChainChanged,
    activityStore,
  ]);

  // const handleClick = () => {
  //   analyticsStore.logEvent("activity_transactions_click", {
  //     pageName: "Transactions",
  //   });
  //   setLoadingRequest(true);
  //   fetchNodes(activityStore.getPageInfo.endCursor, "");
  // };

  const handleFilterChange = (selectedFilter: string[]) => {
    setFilter(selectedFilter);
    setSelectedFilter(selectedFilter);
    analyticsStore.logEvent("activity_filter_click", {
      tabName: "Transactions",
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
      setIsSelectAll(filter.length === options.length);
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
    setFilter(options.map((option) => option.value));
    setIsSaveChangesButtonDisabled(false);
  };

  const handleSaveChanges = () => {
    setIsSaveChangesButtonDisabled(true);
    handleFilterChange(filter);
    setIsOpen(false);
  };
  const renderNodes = (nodes: any) => {
    const renderedNodes: JSX.Element[] = [];
    Object.values(nodes).forEach(async (node: any, index) => {
      const currentDate = moment(node.block.timestamp).format("MMMM DD, YYYY");
      const previousNode: any =
        index > 0 ? Object.values(nodes)[index - 1] : null;
      const previousDate = previousNode
        ? moment(previousNode.block.timestamp).format("MMMM DD, YYYY")
        : null;
      const shouldDisplayDate = currentDate !== previousDate;
      renderedNodes.push(
        <React.Fragment key={index}>
          {!shouldDisplayDate && <div className={styles["hr"]} />}
          {shouldDisplayDate && (
            <div
              className={styles["rowSubtitle"]}
              style={{ margin: "12px 0px" }}
            >
              {currentDate}
            </div>
          )}
          <ActivityRow setDate={setDate} node={node} />
        </React.Fragment>
      );
    });
    return renderedNodes;
  };

  return (
    <React.Fragment>
      <FilterDropdown
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        options={options}
        selectedFilter={filter}
        handleCheckboxChange={handleCheckboxChange}
        handleSaveChanges={handleSaveChanges}
        isSelectAll={isSelectAll}
        handleSelectClicks={handleSelectClicks}
        handleDeselectClicks={handleDeselectClicks}
        isSaveChangesButtonDisabled={isSaveChangesButtonDisabled}
        closeClicked={() => {
          setFilter(selectedFilter);
          setIsOpen(false);
        }}
      />
      <div className={style["filter"]}>
        <FilterActivities
          onFilterChange={handleFilterChange}
          options={options}
          selectedFilter={filter}
          setIsOpen={setIsOpen}
          isOpen={isOpen}
        />
      </div>

      {isActivitySupported ? (
        activities.length > 0 &&
        activities.filter((node: any) =>
          processFilters(selectedFilter).includes(
            node.transaction.messages.nodes[0].typeUrl
          )
        ).length > 0 ? (
          <React.Fragment>
            {renderNodes(
              activities.filter((node: any) =>
                processFilters(selectedFilter).includes(
                  node.transaction.messages.nodes[0].typeUrl
                )
              )
            )}
          </React.Fragment>
        ) : (
          <NoActivity label="No Activity Yet" />
        )
      ) : (
        <UnsupportedNetwork chainID={current.chainName} />
      )}
    </React.Fragment>
  );
});
