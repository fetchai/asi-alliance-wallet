import React from "react";
import style from "./style.module.scss";
import { titleCase } from "@utils/format";
import { Address } from "@components/address";
import { useNavigate } from "react-router";
import { Link } from "react-router-dom";
import { VALIDATOR_URL } from "../../config.ui.var";
import { useStore } from "../../stores";

interface ItemData {
  title: string;
  value: string;
}

export const StakeValidatorCard = ({
  trailingIcon,
  thumbnailUrl,
  heading,
  validatorAddress,
  delegated,
  commission,
  status,
  apr,
  chainID,
}: {
  trailingIcon?: any;
  thumbnailUrl?: any;
  heading: string | undefined;
  validatorAddress: string;
  votingpower?: string;
  delegated?: string;
  commission?: string;
  status?: string;
  apr?: string;
  chainID: string;
}) => {
  const navigate = useNavigate();
  const { analyticsStore } = useStore();
  const data: ItemData[] = [
    {
      title: "Delegated",
      value: delegated && delegated !== "NaN" ? delegated : "NA",
    },
    {
      title: "Commission",
      value: commission && commission !== "NaN" ? commission : "NA",
    },
    {
      title: "Status",
      value: status && status !== "NaN" ? titleCase(status) : "NA",
    },
    {
      title: "APR",
      value: apr && apr !== "NaN" ? apr : "NA",
    },
  ];

  return (
    <div
      className={style["stake-validator-container"]}
      onClick={() => {
        navigate(`/validator/${validatorAddress}`);
        analyticsStore.logEvent("stake_validator_click", {
          pageName: "Stake",
        });
      }}
    >
      <div className={style["validator-info"]}>
        <div className={style["validator-info-left"]}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={"validator"} />
          ) : (
            <div className={style["validator-avatar"]}>
              {heading?.toString()?.[0]?.toUpperCase()}
            </div>
          )}

          <div className={style["validator-info-left-mid"]}>
            <div className={style["validator-name"]}>{heading}</div>

            <div className={style["validator-address"]}>
              <Address maxCharacters={32}>{validatorAddress}</Address>
            </div>
          </div>
        </div>

        <div className={style["validator-info-right"]}>{trailingIcon}</div>
      </div>

      <div className={style["seperator"]} />

      <div className={style["validator-details"]}>
        {data.map((item) => (
          <div key={item.title} className={style["validator"]}>
            <div className={style["validator-details-title"]}>{item.title}</div>
            <div className={style["validator-details-value"]}>{item.value}</div>
          </div>
        ))}
      </div>

      <Link
        onClick={(e) => {
          e.stopPropagation();
        }}
        to={`${VALIDATOR_URL[chainID]}/${validatorAddress}`}
        target="_blank"
      >
        <div className={style["validator-explorer-link"]}>View in explorer</div>
      </Link>
    </div>
  );
};
