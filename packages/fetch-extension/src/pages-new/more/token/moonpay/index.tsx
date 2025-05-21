import { useState, useEffect } from "react";
import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { HeaderLayout } from "@layouts-v2/header-layout";
import React from "react";
import styles from "./style.module.scss";
import { useNavigate } from "react-router";
import { BuyToken } from "./buy-token";
import { SellToken } from "./sell-token";
import { observer } from "mobx-react-lite";
import { useMoonpayCurrency } from "@utils/moonpay-currency";
import { useSearchParams } from "react-router-dom";

export const BuySellTokenPage = observer(() => {
  const [searchParams] = useSearchParams();
  const [activeTabId, setActiveTabId] = useState("Buy");
  const [selectedTab, setSelectedTab] = useState("Buy");
  const navigate = useNavigate();
  const { data, isLoading } = useMoonpayCurrency();

  const fiatCurrencyList = data?.filter((item: any) => item.type === "fiat");
  const cryptoCurrencyList = data?.filter(
    (item: any) => item.type === "crypto"
  );

  const TABS = [
    {
      id: "Buy",
      component: (
        <BuyToken
          coinListLoading={isLoading}
          allowedCurrencyList={fiatCurrencyList}
          allowedTokenList={cryptoCurrencyList?.filter(
            (item: any) => !item.isSuspended
          )}
        />
      ),
    },
    {
      id: "Sell",
      component: (
        <SellToken
          coinListLoading={isLoading}
          allowedCurrencyList={fiatCurrencyList?.filter(
            (item: any) => item.isSellSupported
          )}
          allowedTokenList={cryptoCurrencyList?.filter(
            (item: any) => item.isSellSupported
          )}
        />
      ),
    },
  ];

  useEffect(() => {
    const tab = searchParams.get("type");
    const tabIds: any = {
      buy: "Buy",
      sell: "Sell",
    };

    if (tab && tabIds[tab]) {
      setActiveTabId(tabIds[tab]);
    }
  }, [searchParams]);

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={`${selectedTab} Token`}
      onBackButton={() => navigate(-1)}
      showBottomMenu={false}
    >
      <div className={styles["container"]}>
        <TabsPanel
          activeTabId={activeTabId}
          tabs={TABS}
          onTabChange={(tab: string) => setSelectedTab(tab)}
        />
      </div>
    </HeaderLayout>
  );
});
