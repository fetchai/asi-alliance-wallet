import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import style from "../../style.module.scss";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";

export const CurrencyList: FunctionComponent<{
  currency: string;
  onCurrencySelect: (currency: string) => void;
}> = observer(({ currency, onCurrencySelect }) => {
  const [selectedCurrency, setSelectedCurrency] = useState<any>("usd");

  const { priceStore } = useStore();

  const selectedIcon = useMemo(
    () => [<i key="selected" className="fas fa-check" />],
    []
  );

  useEffect(() => {
    setSelectedCurrency(currency);
  }, [currency]);

  const handleClick = (currency: string) => {
    setSelectedCurrency(currency);
    onCurrencySelect(currency);
  };

  return (
    <div className={style["container"]}>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {Object.keys(priceStore.supportedVsCurrencies).map((currency) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const fiatCurrency = priceStore.supportedVsCurrencies[currency]!;
          return (
            <div
              key={fiatCurrency.currency}
              className={style["currencyItem"]}
              style={{
                display: "flex",
                color: "white",
                padding: "18px",
                fontSize: "13px",
                borderRadius: "12px",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                background:
                  selectedCurrency === fiatCurrency.currency
                    ? "var(--Indigo---Fetch, #5F38FB)"
                    : "rgba(255, 255, 255, 0.1)",
              }}
              onClick={() => handleClick(fiatCurrency.currency)}
            >
              <div className={style["currency"]}>
                {fiatCurrency.currency.toUpperCase()}
              </div>
              <div
                style={{
                  color: "gray",
                  margin: "4px",
                }}
              >
                {`${fiatCurrency.name}  (${fiatCurrency.symbol})`}
              </div>
              <div style={{ marginLeft: "auto" }}>
                {selectedCurrency === fiatCurrency.currency
                  ? selectedIcon
                  : undefined}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
