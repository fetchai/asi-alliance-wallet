import { GlassCard } from "@components-v2/glass-card";
import { Staking } from "@keplr-wallet/stores";
// import { CoinPretty } from "@keplr-wallet/unit";
import React from "react";
import style from "./style.module.scss";
import { useStore } from "../../stores";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { observer } from "mobx-react-lite";

const ValidatorData = ({ label, value }: { label: string; value: any }) => {
  return (
    <div className={style["validator-data"]}>
      <div
        style={{
          color: "#737676",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontWeight: 400,
        }}
      >
        {value}
      </div>
    </div>
  );
};

export const ValidatorCardV2 = observer(
  ({
    validator,
    selected,
    onClick,
  }: {
    validator: Staking.Validator;
    chainID?: string;
    selected?: boolean;
    onClick?: () => void;
  }) => {
    const commisionRate = (
      parseFloat(validator.commission.commission_rates.rate) * 100
    ).toFixed(2);

    const { chainStore, queriesStore } = useStore();

    const queries = queriesStore.get(chainStore.current.chainId);

    const inflation = queries.cosmos.queryInflation;
    const { inflation: ARR, isFetching } = inflation;
    const validatorCom: any = parseFloat(
      validator?.commission.commission_rates.rate || "0"
    );
    const APR = ARR.mul(new Dec(1 - validatorCom));

    const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Bonded
    );

    const thumbnail = bondedValidators.getValidatorThumbnail(
      validator.operator_address
    );

    const votingPower =
      validator &&
      new CoinPretty(
        chainStore.current.stakeCurrency,
        new Dec(validator?.tokens)
      )
        .maxDecimals(0)
        .toString();

    return (
      <GlassCard
        styleProps={{
          marginBottom: "6px",
          paddingTop: "18px",
          paddingBottom: "18px",
          background: selected ? "#E0FEDD" : "",
        }}
        onClick={onClick}
      >
        <div className={style["validator-card-container"]}>
          <div className={style["validator-details"]}>
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
              }}
            >
              {thumbnail ? (
                <img src={thumbnail} alt={"validator"} />
              ) : (
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {validator.description.moniker?.toString()[0].toUpperCase()}
                </div>
              )}
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 400,
                }}
              >
                {validator.description.moniker}
              </div>
            </div>
            {selected && (
              <div>
                <img
                  style={{
                    height: "auto",
                    width: "auto",
                  }}
                  src={require("../../public/assets/svg/wireframe/check.svg")}
                  alt="chevron-right-icon"
                />
              </div>
            )}
          </div>

          <div className={style["validator-data-container"]}>
            <ValidatorData label="Voting power" value={votingPower} />
            <ValidatorData label="Comission" value={`% ${commisionRate}`} />
            <ValidatorData
              label="APR"
              value={
                <React.Fragment>
                  {!isFetching ? (
                    APR.maxDecimals(2).trim(true).toString() + "%"
                  ) : (
                    <span style={{ fontSize: "14px" }}>
                      <i className="fas fa-spinner fa-spin" />
                    </span>
                  )}
                </React.Fragment>
              }
            />
          </div>
        </div>
      </GlassCard>
    );
  }
);
