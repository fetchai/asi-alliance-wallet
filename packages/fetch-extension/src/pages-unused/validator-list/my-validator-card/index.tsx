import { ToolTip } from "@components/tooltip";
import { Staking } from "@keplr-wallet/stores";
import { CoinPretty } from "@keplr-wallet/unit";
import { formatAddress, shortenMintingNumber } from "@utils/format";
import React from "react";
import { useNavigate } from "react-router";
import { CHAIN_ID_DORADO, CHAIN_ID_FETCHHUB } from "../../../config.ui.var";
import styleValidators from "./validators.module.scss";
import { useLanguage } from "../../../languages";
import { useStore } from "../../../stores";

export const URL: { [key in string]: string } = {
  [CHAIN_ID_DORADO]: "https://explore-dorado.fetch.ai/validators",
  [CHAIN_ID_FETCHHUB]: "https://www.mintscan.io/fetchai/validators",
};

export const MyValidatorCard = ({
  validator,
}: {
  validator: Staking.Validator & { amount: CoinPretty };
  chainID: string;
}) => {
  const { priceStore } = useStore();

  const navigate = useNavigate();
  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;

  const value = priceStore.calculatePrice(validator.amount, fiatCurrency);
  const inFiat = value && value.shrink(true).maxDecimals(6).toString();
  return (
    <div
      className={styleValidators["item"]}
      onClick={() =>
        navigate(`/validators/${validator.operator_address}/stake`)
      }
    >
      <div className={styleValidators["row"]}>
        <div>
          <div className={styleValidators["label"]}>
            {validator.description.moniker}
          </div>
          <ToolTip
            trigger="hover"
            options={{ placement: "bottom" }}
            tooltip={
              <div className={styleValidators["tooltip"]}>
                {validator.operator_address}
              </div>
            }
          >
            <span className={styleValidators["address"]}>
              {formatAddress(validator.operator_address)}
            </span>
          </ToolTip>
        </div>

        <div className={styleValidators["amountSection"]}>
          <div className={styleValidators["amount"]}>
            <span>
              {shortenMintingNumber(validator.amount.toDec().toString(), 0)}{" "}
            </span>
            <span style={{ opacity: "0.6" }}>
              {validator.amount.currency.coinDenom}
            </span>
          </div>
          {inFiat && (
            <div className={styleValidators["amount"]}>
              <span>{inFiat} </span>
              <span style={{ opacity: "0.6" }}>
                {fiatCurrency.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
      {validator.description.website && (
        <a
          href={`${validator.description.website}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "12px", color: "white", opacity: "0.6" }}
        >
          {validator.description.website}
        </a>
      )}
    </div>
  );
};
