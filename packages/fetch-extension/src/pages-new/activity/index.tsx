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
import style from "./style.module.scss";

export const ActivityPage: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const intl = useIntl();
  const [latestBlock, _setLatestBlock] = useState<string>();
  const tabs = [
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
  const { analyticsStore } = useStore();

  useEffect(() => {
    // url /activity?tab=Proposals will open gov .proposals tab
    // url /activity?tab=Transactions will open transactions tab
    const tab = searchParams.get("tab");
    const tabIds = {
      Proposals: "Proposals",
      Transactions: "Transactions",
    };
    const eventName =
      activeTabId === tabIds.Transactions
        ? "activity_transaction_tab_click"
        : "activity_gov_proposal_tab_click";
    analyticsStore.logEvent(eventName, {
      pageName: "Activity",
    });

    if (tab === "Proposals") {
      setActiveTabId(tabIds[tab]);
    }
  }, [searchParams]);

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
        <div className={style["title"]}>
          <FormattedMessage id="main.menu.activity" />
        </div>
        {
          <div className={style["tabContainer"]}>
            <TabsPanel
              activeTabId={activeTabId}
              tabs={tabs}
              tabStyle={{
                margin: "24px 0px 32px 0px",
              }}
            />
          </div>
        }
      </div>
    </HeaderLayout>
  );
});
