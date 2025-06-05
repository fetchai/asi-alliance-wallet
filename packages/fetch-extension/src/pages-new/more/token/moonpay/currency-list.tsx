import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import style from "./style.module.scss";
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
      <div className={style["currencyListContainer"]}>
        {allowedCurrencies.map((fiatCurrency: any) => {
          return (
            <div
              key={fiatCurrency.id}
              className={style["currencyItem"]}
              style={{
                background:
                  selectedCurrency === fiatCurrency.code
                    ? "var(--Indigo---Fetch, #5F38FB)"
                    : "rgba(255, 255, 255, 0.1)",
              }}
              onClick={() => handleClick(fiatCurrency.code)}
            >
              <img
                className={style["currencyLogo"]}
                alt={fiatCurrency.name}
                src={fiatCurrency.icon}
              />
              <div className={style["currencyCode"]}>
                {fiatCurrency.code.toUpperCase()}
              </div>
              <div
                style={{
                  color:
                    selectedCurrency === fiatCurrency.code ? "#f6f6f6" : "gray",
                  margin: "4px",
                }}
              >
                {fiatCurrency.name}
              </div>
              <div className={style["currencySelectedIcon"]}>
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
