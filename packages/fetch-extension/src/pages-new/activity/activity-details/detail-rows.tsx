import React from "react";
import style from "./style.module.scss";
import { formatActivityHash } from "@utils/format";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useNavigate } from "react-router";
import { AppCurrency } from "@keplr-wallet/types";
import { DetailRow } from "./detail-row";

export const DetailRows = ({ details }: { details: any }) => {
  const currency: AppCurrency = {
    coinDenom: "FET",
    coinMinimalDenom: "afet",
    coinDecimals: 18,
    coinGeckoId: "fetch-ai",
  };
  const fees = JSON.parse(details.fees);
  const { feeNumber, feeAlphabetic } = details;
  const navigate = useNavigate();
  const handleClick = () => {
    const mintscanURL = `https://www.mintscan.io/fetchai/tx/${details.hash}/`;
    window.open(mintscanURL, "_blank");
  };
  const handleValidatorClicked = () => {
    navigate(`/validator/${details.validatorAddress}/delegate`);
  };
  const handleSendClicked = () => {
    navigate("/send", {
      replace: true,
      state: {
        isNext: true,
        isFromPhase1: false,
        configs: {
          amount: details.amt.amount
            ? (details.amt.amount / 10 ** 18).toString()
            : (details.amt[0].amount / 10 ** 18).toString(),
          sendCurr: currency,
          recipient: details.toAddress,
          memo: details.memo,
        },
      },
    });
  };

  return (
    <div className={style["detail-rows"]}>
      <DetailRow
        label="Transaction Hash"
        value={formatActivityHash(details.hash)}
      />
      <DetailRow label="Chain ID" value={details.chainId} />
      {details.verb !== "Sent" &&
        details.verb !== "Unstaked" &&
        details.verb !== "Smart Contract Interaction" && (
          <React.Fragment>
            <DetailRow
              label="Gas used/wanted"
              value={`${details.gasUsed ? details.gasUsed : "-"}/${
                details.gasWanted ? details.gasWanted : "-"
              }`}
            />
            <DetailRow
              label="Fees"
              value={fees.length > 0 ? `${feeNumber} ${feeAlphabetic}` : "-"}
            />
            <DetailRow
              label="Memo"
              value={details.memo == "" ? "-" : details.memo}
            />
          </React.Fragment>
        )}
      <DetailRow
        label={`Total ${details.verb === "Sent" ? "estimated" : "amount"}`}
        value={`${details.amountNumber} ${details.amountAlphabetic}`}
      />
      <div
        className={style["buttons"]}
        style={{
          marginTop: "32px",
        }}
      >
        {details.verb == "Staked" || details.verb == "Sent" ? (
          <div className={style["buttons"]} style={{ width: "100%" }}>
            <ButtonV2
              styleProps={{
                background: "transparent",
                color: "white",
                border: "1px solid rgba(255, 255, 255, 0.6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "48px",
                gap: "4px",
                marginTop: 0,
              }}
              text=""
              onClick={
                details.verb === "Staked"
                  ? handleValidatorClicked
                  : handleSendClicked
              }
            >
              {details.verb == "Staked" && (
                <React.Fragment>
                  <img
                    src={require("@assets/svg/wireframe/stake.svg")}
                    alt=""
                  />
                  Stake again
                </React.Fragment>
              )}{" "}
              {details.verb == "Sent" && (
                <React.Fragment>
                  <img
                    src={require("@assets/svg/wireframe/arrow-up-1.svg")}
                    alt=""
                  />
                  Send again
                </React.Fragment>
              )}
            </ButtonV2>{" "}
            <ButtonV2
              styleProps={{
                background: "transparent",
                color: "white",
                border: "1px solid rgba(255, 255, 255, 0.6",
                height: "48px",
                marginTop: 0,
              }}
              text=""
              onClick={handleClick}
            >
              View on Mintscan
            </ButtonV2>
          </div>
        ) : (
          <ButtonV2
            styleProps={{
              background: "transparent",
              color: "white",
              border: "1px solid rgba(255, 255, 255, 0.6",
              height: "48px",
              marginTop: 0,
            }}
            onClick={handleClick}
            text=""
          >
            View on Mintscan
          </ButtonV2>
        )}
      </div>
    </div>
  );
};
