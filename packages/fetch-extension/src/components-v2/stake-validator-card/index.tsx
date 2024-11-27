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
      style={{ color: "white", cursor: "pointer" }}
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
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.1)",
              }}
            >
              {heading?.toString()[0].toUpperCase()}
            </div>
          )}

          <div className={style["validator-info-left-mid"]}>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 500,
              }}
            >
              {heading}
            </div>

            <div
              style={{
                fontSize: "12px",
                fontWeight: 400,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              <Address maxCharacters={32}>{validatorAddress}</Address>
            </div>
          </div>
        </div>

        <div className={style["validator-info-right"]}>{trailingIcon}</div>
      </div>

      <div
        style={{
          opacity: 0.2,
          background: "#FFF",
          height: "1px",
          width: "300px",
        }}
      />

      <div className={style["validator-details"]}>
        {data.map((item) => (
          <div
            key={item.title}
            style={{
              fontSize: "14px",
              fontWeight: 400,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div
              style={{
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {item.title}
            </div>
            <div>{item.value}</div>
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
        <div
          style={{
            color: "#BFAFFD",
            fontFamily: "Lexend",
            fontSize: "12px",
            fontWeight: 400,
            cursor: "pointer",
          }}
        >
          View in explorer
        </div>
      </Link>
    </div>
  );
};
