import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import style from "../../style.module.scss";
import { observer } from "mobx-react-lite";

export const CurrencyList: FunctionComponent<{
  allowedCurrencies: any[];
  currency: string;
  onCurrencySelect: (currency: string) => void;
}> = observer(({ currency, allowedCurrencies, onCurrencySelect }) => {
  const [selectedCurrency, setSelectedCurrency] = useState<any>();

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
        {allowedCurrencies.map((fiatCurrency: any) => {
          return (
            <div
              key={fiatCurrency.id}
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
                  selectedCurrency === fiatCurrency.code
                    ? "var(--Indigo---Fetch, #5F38FB)"
                    : "rgba(255, 255, 255, 0.1)",
              }}
              onClick={() => handleClick(fiatCurrency.code)}
            >
              <img
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  marginRight: "10px",
                }}
                alt={fiatCurrency.name}
                src={fiatCurrency.icon}
              />
              <div
                style={{
                  margin: "0 8px",
                }}
              >
                {fiatCurrency.code.toUpperCase()}
              </div>
              <div
                style={{
                  color: "gray",
                  margin: "4px",
                }}
              >
                {fiatCurrency.name}
              </div>
              <div style={{ marginLeft: "auto" }}>
                {selectedCurrency === fiatCurrency.code
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
