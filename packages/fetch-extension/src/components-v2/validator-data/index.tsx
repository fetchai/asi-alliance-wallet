import { GlassCard } from "@components-v2/glass-card";
import { ToolTip } from "@components/tooltip";
import { Staking } from "@keplr-wallet/stores";
import { formatAddress, shortenNumber, titleCase } from "@utils/format";
import React, { useMemo } from "react";
import { useStore } from "../../stores";
import style from "./style.module.scss";
import { observer } from "mobx-react-lite";
import { CoinPretty, Dec } from "@keplr-wallet/unit";

interface ItemData {
  title: string;
  value: string;
}

export const ValidatorData = observer(
  ({ validatorAddress }: { validatorAddress: string }) => {
    const { chainStore, queriesStore } = useStore();

    const queries = queriesStore.get(chainStore.current.chainId);

    const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Bonded
    );
    const unbondingValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Unbonding
    );
    const unbondedValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Unbonded
    );

    const { validator, thumbnail } = useMemo(() => {
      const validator =
        bondedValidators.getValidator(validatorAddress) ||
        unbondingValidators.getValidator(validatorAddress) ||
        unbondedValidators.getValidator(validatorAddress);
      const thumbnail =
        bondedValidators.getValidatorThumbnail(validatorAddress) ||
        unbondingValidators.getValidatorThumbnail(validatorAddress) ||
        unbondedValidators.getValidatorThumbnail(validatorAddress);
      return {
        validator,
        thumbnail,
      };
    }, [
      validatorAddress,
      bondedValidators,
      unbondingValidators,
      unbondedValidators,
    ]);

    let status;
    let commisionRate;
    if (validator) {
      status = validator.status.split("_")[2].toLowerCase();
      commisionRate = (
        parseFloat(validator.commission.commission_rates.rate) * 100
      ).toFixed(0);
    }

    const inflation = queries.cosmos.queryInflation;
    const { inflation: ARR } = inflation;
    const validatorCom: any = parseFloat(
      validator?.commission.commission_rates.rate || "0"
    );
    const APR = ARR.mul(new Dec(1 - validatorCom));

    const votingPower =
      validator &&
      new CoinPretty(
        chainStore.current.stakeCurrency,
        new Dec(validator?.tokens)
      )
        .maxDecimals(0)
        .toString();

    if (!validator) {
      return null;
    }

    const data: ItemData[] = [
      {
        title: "Delegated",
        value: validator ? shortenNumber(validator?.delegator_shares) : "-",
      },
      {
        title: "Commission",
        value: `${commisionRate}% (20% maximum)`,
      },
      {
        title: "Status",
        value: status ? titleCase(status) : "-",
      },
      {
        title: "APR",
        value: `${APR.maxDecimals(2).trim(true).toString()}%`,
      },
      {
        title: "Voting power",
        value: votingPower
          ? `${votingPower.split(" ")[0]} ${votingPower.split(" ")[1]}`
          : "NA",
      },
    ];

    return (
      <GlassCard>
        <div className={style["validator-data-container"]}>
          <div className={style["validator-data-head"]}>
            {thumbnail ? (
              <img src={thumbnail} alt={"validator"} />
            ) : (
              <div className={style["validator-avatar"]}>
                {validator.description.moniker?.toString()[0].toUpperCase()}
              </div>
            )}

            <div className={style["validator-data-head-text"]}>
              <div className={style["title"]}>
                {validator.description.website ? (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={validator.description.website}
                  >
                    {validator.description.moniker}
                  </a>
                ) : (
                  <React.Fragment>
                    {validator.description.moniker}
                  </React.Fragment>
                )}
              </div>
              <ToolTip
                trigger="hover"
                options={{ placement: "bottom-end" }}
                tooltip={
                  <div className={style["tooltip"]}>
                    {validator.operator_address}
                  </div>
                }
              >
                <span className={style["address"]}>
                  {formatAddress(validator.operator_address)}
                </span>
              </ToolTip>
            </div>
          </div>
          {validator.description.details && (
            <div className={style["validator-description"]}>
              {validator.description.details}
            </div>
          )}
        </div>

        <div className={style["table-container"]}>
          {data.map((item, index) => (
            <div
              key={item.title}
              className={
                index === 0 ? style["table-row-first"] : style["table-row"]
              }
            >
              <div className={style["table-row-title"]}>{item.title}</div>

              <div className={style["table-row-value"]}>{item.value}</div>
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }
);
