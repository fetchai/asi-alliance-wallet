import React, { FunctionComponent, useMemo } from "react";
import { Card } from "@components-v2/card";
import style from "../style.module.scss";
import { useNavigate } from "react-router";
import { useIntl } from "react-intl";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { useLanguage } from "../../../languages";
import { HeaderLayout } from "@layouts-v2/header-layout";

export const CurrencyPge: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const intl = useIntl();

  const language = useLanguage();

  const { priceStore, analyticsStore } = useStore();

  const selectedIcon = useMemo(
    () => [<i key="selected" className="fas fa-check" />],
    []
  );

  const handleClick = (currency: string) => {
    language.setFiatCurrency(currency);
    analyticsStore.logEvent("currency_change_click", {
      pageName: "More",
    });
    navigate({ pathname: "/" });
  };

  return (
    <HeaderLayout
      showChainName={false}
      showTopMenu={true}
      canChangeChainInfo={false}
      smallTitle={true}
      showBottomMenu={false}
      alternativeTitle={intl.formatMessage({
        id: "setting.fiat",
      })}
      onBackButton={() => {
        analyticsStore.logEvent("back_click", { pageName: "Currency" });
        navigate(-1);
      }}
    >
      <div className={style["container"]}>
        <Card
          style={
            language.isFiatCurrencyAutomatic
              ? {
                  background: "var(--bg-green-light)",
                  marginBottom: "5px",
                }
              : { marginBottom: "5px" }
          }
          heading={intl.formatMessage({
            id: "setting.fiat.automatic",
          })}
          onClick={() => {
            language.setFiatCurrency(null);
            navigate({
              pathname: "/",
            });
          }}
          rightContent={
            language.isFiatCurrencyAutomatic ? selectedIcon : undefined
          }
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {Object.keys(priceStore.supportedVsCurrencies).map((currency) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const fiatCurrency = priceStore.supportedVsCurrencies[currency]!;
            return (
              <div
                key={fiatCurrency.currency}
                className={style["currencyItem"]}
                style={{
                  background:
                    language.fiatCurrency === fiatCurrency.currency &&
                    !language.isFiatCurrencyAutomatic
                      ? "var(--bg-green-light)"
                      : "var(--card-bg)",
                }}
                onClick={() => handleClick(fiatCurrency.currency)}
              >
                <div className={style["currency"]}>
                  {fiatCurrency.currency.toUpperCase()}
                </div>
                <div
                  style={{
                    color:
                      language.fiatCurrency === fiatCurrency.currency &&
                      !language.isFiatCurrencyAutomatic
                        ? "var(--font-secondary)"
                        : "gray",
                    margin: "4px",
                  }}
                >
                  {`${fiatCurrency.name}  (${fiatCurrency.symbol})`}
                </div>
                <div style={{ marginLeft: "auto" }}>
                  {!language.isFiatCurrencyAutomatic
                    ? language.fiatCurrency === fiatCurrency.currency
                      ? selectedIcon
                      : undefined
                    : undefined}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </HeaderLayout>
  );
});
