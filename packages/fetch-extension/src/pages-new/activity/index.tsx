import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useState, useEffect } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../../stores";
import { GovProposalsTab } from "./gov-proposals";
import { NativeTab } from "./native";
import { CardanoTransactionsTab } from "./cardano/transactions";
import style from "./style.module.scss";

export const ActivityPage: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const intl = useIntl();
  const [latestBlock, _setLatestBlock] = useState<string>();
  const { analyticsStore, chainStore } = useStore();
  const isCardano = chainStore.current.features?.includes("cardano") ?? false;
  const tabs = isCardano
    ? [
        {
          id: "Transactions",
          component: <CardanoTransactionsTab />,
        },
      ]
    : [
        {
          id: "Transactions",
          component: <NativeTab />,
        },
        {
          id: "Proposals",
          component: <GovProposalsTab latestBlock={latestBlock} />,
        },
      ];
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  useEffect(() => {
    // When switching chains, ensure active tab is valid for the current tab set.
    // For Cardano, we only expose Transactions.
    if (isCardano) {
      if (activeTabId !== "Transactions") setActiveTabId("Transactions");
      return;
    }
    const hasActive = tabs.some((t) => t.id === activeTabId);
    if (!hasActive) setActiveTabId(tabs[0].id);
  }, [isCardano, tabs, activeTabId]);

  useEffect(() => {
    const tabIds = {
      Proposals: "Proposals",
      Transactions: "Transactions",
    };
    // url /activity?tab=Proposals will open gov proposals tab (Cosmos-only)
    // url /activity?tab=Transactions will open transactions tab
    if (isCardano) {
      return;
    }
    const tab = searchParams.get("tab");
    if (tab === "Proposals" || tab === "Transactions") {
      setActiveTabId(tabIds[tab]);
    }
  }, [searchParams, isCardano]);

  useEffect(() => {
    const tabIds = {
      Proposals: "Proposals",
      Transactions: "Transactions",
    };
    const eventName =
      activeTabId === tabIds.Transactions
        ? "activity_transaction_tab_click"
        : "activity_gov_proposal_tab_click";
    analyticsStore.logEvent(eventName, { pageName: "Activity" });
  }, [activeTabId, analyticsStore]);

  return (
    <HeaderLayout
      showChainName={true}
      canChangeChainInfo={false}
      alternativeTitle={intl.formatMessage({
        id: "main.menu.activity",
      })}
      onBackButton={() => {
        analyticsStore.logEvent("back_click", { pageName: "Activity" });
        navigate(-1);
      }}
    >
      <div className={style["container"]}>
        <div className={isCardano ? style["titleCardano"] : style["title"]}>
          <FormattedMessage id="main.menu.activity" />
        </div>

        {isCardano ? (
          <div className={style["cardanoContent"]}>
            <CardanoTransactionsTab />
          </div>
        ) : (
          <div className={style["tabContainer"]}>
            <TabsPanel
              activeTabId={activeTabId}
              tabs={tabs}
              tabStyle={{
                margin: "24px 0px 32px 0px",
              }}
            />
          </div>
        )}
      </div>
    </HeaderLayout>
  );
});
