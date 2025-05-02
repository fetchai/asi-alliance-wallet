import { useState } from "react";
import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { HeaderLayout } from "@layouts-v2/header-layout";
import React from "react";
import styles from "./style.module.scss";
import { useNavigate } from "react-router";
import { BuyToken } from "./buy-token";
import { SellToken } from "./sell-token";
import { observer } from "mobx-react-lite";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export const BuySellTokenPage = observer(() => {
  const [selectedTab, setSelectedTab] = useState("Buy");
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data } = await axios.get(
        "https://api.moonpay.com/v3/currencies?apiKey=pk_test_123"
      );
      return data;
    },
    staleTime: Infinity,
  });

  const fiatCurrencyList = data?.filter((item: any) => item.type === "fiat");
  const cryptoCurrencyList = data?.filter(
    (item: any) => item.type === "crypto"
  );

  const TABS = [
    {
      id: "Buy",
      component: (
        <BuyToken
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
          tabs={TABS}
          onTabChange={(selectedTab: string) => {
            setSelectedTab(selectedTab);
          }}
        />
      </div>
    </HeaderLayout>
  );
});
