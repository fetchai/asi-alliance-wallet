import { TabsPanel } from "@components-v2/tabs/tabsPanel-1";
import React, { useState } from "react";
import { LineGraph } from "./line-graph";
import style from "./style.module.scss";
import { useLanguage } from "../../languages";

interface LineGraphViewProps {
  tokenName: string | undefined;
  setTokenState: any;
  tokenState: any;
  setTokenCurrentPrice?: any;
  tokenDenom?: string;
  priceInVsCurrency?: number;
  vsCurrencySymbol: string;
}

const tabs = [
  {
    id: "24H",
    duration: 1,
  },
  {
    id: "1W",
    duration: 7,
  },
  {
    id: "1M",
    duration: 30,
  },
  {
    id: "3M",
    duration: 90,
  },
  {
    id: "1Y",
    duration: 365,
  },
];

export const LineGraphView: React.FC<LineGraphViewProps> = ({
  tokenName,
  setTokenState,
  tokenState,
  tokenDenom,
  setTokenCurrentPrice,
  priceInVsCurrency,
  vsCurrencySymbol,
}) => {
  const [activeTab, setActiveTab] = useState<any>(tabs[0]);
  const [loading, setLoading] = useState<boolean>(true);
  const language = useLanguage();

  const fiatCurrency = language.fiatCurrency;

  return (
    <div className={style["graph-container"]}>
      {!loading && !tokenState?.diff && (
        <div className={style["errorText"]}>Line Graph unavailable</div>
      )}
      {tokenDenom && priceInVsCurrency ? (
        <div className={style["vsCurrencyTokenPrice"]}>
          <div>
            {tokenDenom}/{fiatCurrency?.toUpperCase()}
          </div>
          <div className={style["vsCurrencyPrice"]}>
            {vsCurrencySymbol}
            {priceInVsCurrency}
          </div>
        </div>
      ) : (
        ""
      )}
      <LineGraph
        duration={activeTab.duration}
        tokenName={tokenName}
        setTokenState={setTokenState}
        loading={loading}
        setLoading={setLoading}
        vsCurrencySymbol={vsCurrencySymbol}
        vsCurrency={fiatCurrency}
        setTokenCurrentPrice={setTokenCurrentPrice}
      />
      {tokenState?.diff && (
        <div style={{ marginBottom: "-18px" }}>
          <TabsPanel
            className={style["graphOption"]}
            activeClassName={style["activeGraphOption"]}
            tabs={tabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>
      )}
    </div>
  );
};
