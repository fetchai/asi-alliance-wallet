import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { useMoonpayCurrency } from "@utils/moonpay-currency";
import { observer } from "mobx-react-lite";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useSearchParams } from "react-router-dom";
import { BuyToken } from "./buy-token";
import { SellToken } from "./sell-token";
import styles from "./style.module.scss";
import { useStore } from "../../../../stores";
import { checkAddressIsBuySellWhitelisted } from "@utils/moonpay-currency";

export const BuySellTokenPage = observer(() => {
  const { chainStore, accountStore } = useStore();
  const [searchParams] = useSearchParams();
  const [activeTabId, setActiveTabId] = useState("Buy");
  const [selectedTab, setSelectedTab] = useState("Buy");
  const navigate = useNavigate();
  const { data, isLoading } = useMoonpayCurrency();
  const chainId = chainStore.current.chainId;
  const accountInfo = accountStore.getAccount(chainId);
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
    const isAddressWhitelisted = accountInfo?.bech32Address
      ? checkAddressIsBuySellWhitelisted(
          chainId === "1" || chainId === "injective-1"
            ? accountInfo.ethereumHexAddress || ""
            : accountInfo.bech32Address
        )
      : false;
    if (!isAddressWhitelisted) {
      navigate("/");
    }
  }, [accountInfo.bech32Address, accountInfo.ethereumHexAddress, chainId]);

  useEffect(() => {
    const tab = searchParams.get("type");
    const tabIds: Record<string, string> = {
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
