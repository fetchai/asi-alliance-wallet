import { ToolTip } from "@components/tooltip";
import { Staking } from "@keplr-wallet/stores";
import { formatAddress, shortenNumber } from "@utils/format";
import React from "react";
import { CHAIN_ID_DORADO, CHAIN_ID_FETCHHUB } from "../../../config.ui.var";
import styleValidators from "./validatordetails.module.scss";

export const URL: { [key in string]: string } = {
  [CHAIN_ID_DORADO]: "https://explore-dorado.fetch.ai/validators",
  [CHAIN_ID_FETCHHUB]: "https://www.mintscan.io/fetchai/validators",
};

export const ValidatorDetails = ({
  validator,
  chainID,
  APR,
  isFetching,
}: {
  validator: Staking.Validator;
  chainID: string;
  APR: any;
  isFetching: boolean;
}) => {
  const status = validator.status.split("_")[2].toLowerCase();
  const commisionRate = (
    parseFloat(validator.commission.commission_rates.rate) * 100
  ).toFixed(2);
  const maxCommisionRate = (
    parseFloat(validator.commission.commission_rates.max_rate) * 100
  ).toFixed(2);

  return (
    <div className={styleValidators["item"]}>
      <div className={styleValidators["title"]}>
        <div className={styleValidators["moniker"]}>
          {validator.description.website ? (
            <a
              target="_blank"
              rel="noreferrer"
              href={validator.description.website}
            >
              {validator.description.moniker}
            </a>
          ) : (
            <React.Fragment>{validator.description.moniker}</React.Fragment>
          )}
        </div>
        <ToolTip
          trigger="hover"
          options={{ placement: "bottom-start" }}
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
      {validator.description.details && (
        <div className={styleValidators["description"]}>
          {validator.description.details}
        </div>
      )}
      <div className={styleValidators["details"]}>
        <div className={styleValidators["row"]}>
          <div className={styleValidators["label"]}>Delegated</div>
          <div className={styleValidators["value"]}>
            {shortenNumber(validator.delegator_shares)}
          </div>
        </div>
        <div className={styleValidators["row"]}>
          <div className={styleValidators["label"]}> Commission</div>
          <div className={styleValidators["value"]}>
            {commisionRate}% ({maxCommisionRate}% Max)
          </div>
        </div>
        <div className={styleValidators["row"]}>
          <div className={styleValidators["label"]}> Status</div>
          <div className={styleValidators["value"]}> {status}</div>
        </div>
        <div className={styleValidators["row"]}>
          <div className={styleValidators["label"]}> APR</div>
          <div className={styleValidators["value"]}>
            {!isFetching ? (
              APR.maxDecimals(2).trim(true).toString() + "%"
            ) : (
              <span style={{ fontSize: "14px" }}>
                <i className="fas fa-spinner fa-spin" />
              </span>
            )}
          </div>
        </div>
      </div>

      <a
        href={`${URL[chainID]}/${validator.operator_address}`}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: "12px" }}
      >
        View in Explorer for more Details
      </a>
      {validator.jailed && (
        <div className={styleValidators["jailed"]}>
          This validator is currently jailed. Redelegate your tokens.
        </div>
      )}
    </div>
  );
};
