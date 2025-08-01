import React from "react";
import { ButtonV2 } from "../button";
import { IAmountConfig } from "@keplr-wallet/hooks";
import { useLanguage } from "../../../languages";
import { SUPPORTED_LOCALE_FIAT_CURRENCIES } from "../../../config.ui";

export const UseMaxButton = ({
  amountConfig,
  isToggleClicked,
  setIsToggleClicked,
}: {
  amountConfig: IAmountConfig;
  isToggleClicked: boolean;
  setIsToggleClicked: any;
}) => {
  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;
  const disableToggleCurrency =
    !SUPPORTED_LOCALE_FIAT_CURRENCIES.includes(fiatCurrency);

  const ChangeButtonElement = () => {
    return (
      <div
        style={{
          display: "flex",
          gap: "8px",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <img
          style={{
            width: "18px",
            height: "14px",
            opacity: 0.6,
          }}
          src={require("@assets/svg/wireframe/chevron.svg")}
          alt=""
        />
        <div>{`Change to ${
          !isToggleClicked
            ? fiatCurrency.toUpperCase()
            : amountConfig.sendCurrency.coinDenom
        }`}</div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        marginTop: "16px",
        marginBottom: "16px",
      }}
    >
      <ButtonV2
        styleProps={{
          width: "100%",
          padding: "2px 15px",
          height: "44px",
          marginTop: "0",
          fontSize: "14px",
        }}
        disabled={
          !amountConfig.sendCurrency["coinGeckoId"] || disableToggleCurrency
        }
        text={<ChangeButtonElement />}
        onClick={() => {
          setIsToggleClicked(!isToggleClicked);
        }}
      />

      <ButtonV2
        text="Use max available"
        styleProps={{
          width: "100%",
          padding: "2px 15px",
          height: "44px",
          marginTop: "0",
          fontSize: "14px",
        }}
        onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
          e.preventDefault();
          amountConfig.toggleIsMax();
        }}
      />
    </div>
  );
};
