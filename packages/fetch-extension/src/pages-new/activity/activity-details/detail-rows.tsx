import React from "react";
import style from "./style.module.scss";
import { formatToTruncated } from "@utils/format";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useNavigate } from "react-router";
import { AppCurrency } from "@keplr-wallet/types";
import { DetailRow } from "./detail-row";
import { useStore } from "../../../stores";
import { useNotification } from "@components/notification";
import { useIntl } from "react-intl";
import { EXPLORER_URL, GEMINI_EXPLORER_URL } from "../../../config.ui.var";

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
  const notification = useNotification();
  const intl = useIntl();
  const { chainStore, analyticsStore } = useStore();

  const explorerBaseURL = () => {
    if (chainStore.current.chainId === "gemini-1") {
      return GEMINI_EXPLORER_URL;
    } else {
      return `${EXPLORER_URL}/${chainStore.current.chainId}`;
    }
  };

  const handleClick = () => {
    const url = `${explorerBaseURL()}/transactions/${details.hash}/`;
    window.open(url, "_blank", "noopener,noreferrer");
    analyticsStore.logEvent("view_on_mintscan_click", {
      chainId: chainStore.current.chainId,
      chainName: chainStore.current.chainName,
      pageName: "Activity Detail",
    });
  };
  const handleValidatorClicked = () => {
    navigate(`/validator/${details.validatorAddress}/delegate`);
    analyticsStore.logEvent("stake_click", {
      chainId: chainStore.current.chainId,
      chainName: chainStore.current.chainName,
      pageName: "Activity Detail",
    });
  };
  const handleSendClicked = () => {
    analyticsStore.logEvent("send_click", {
      chainId: chainStore.current.chainId,
      chainName: chainStore.current.chainName,
      pageName: "Activity Detail",
    });
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

  async function copyAddress(address: string) {
    await navigator.clipboard.writeText(address);
    notification.push({
      placement: "top-center",
      type: "success",
      duration: 2,
      content: intl.formatMessage({
        id: "Transaction hash copied",
      }),
      canDelete: true,
      transition: {
        duration: 0.25,
      },
    });
  }

  return (
    <div className={style["detail-rows"]}>
      <DetailRow
        label="Transaction Hash"
        value={formatToTruncated(details.hash)}
        onClick={() => copyAddress(details.hash)}
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
          </React.Fragment>
        )}
      <DetailRow
        label="Memo"
        value={details.memo.length > 0 ? details.memo : "-"}
      />
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
                height: "48px",
                marginTop: 0,
              }}
              text=""
              onClick={handleClick}
            >
              View on explorer
            </ButtonV2>
          </div>
        ) : (
          <ButtonV2
            styleProps={{
              height: "48px",
              marginTop: 0,
            }}
            onClick={handleClick}
            text=""
          >
            View on explorer
          </ButtonV2>
        )}
      </div>
    </div>
  );
};
