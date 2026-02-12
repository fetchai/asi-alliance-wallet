import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import React from "react";
import { useLocation, useNavigate } from "react-router";
import style from "./styles.module.scss";
import { downloadJson } from "./utils";
import {
  CHAIN_ID_DORADO,
  CHAIN_ID_FETCHHUB,
  CHAIN_ID_GEMINI,
} from "../../config.ui.var";
import { explorerBaseURL } from "@utils/index";

const buttonStyles: React.CSSProperties = {
  width: "fit-content",
  fontSize: "12px",
  margin: "0px 0px 16px",
  display: "flex",
  height: "40px",
  alignItems: "center",
  columnGap: "2px",
};

export const TransactionDetails: React.FC<{
  onCopy(value: string, message: string): void;
}> = ({ onCopy }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    txSignature,
    txHash,
    downloadFilename,
    broadcastType,
    chainId,
    signedTxn,
  } = location.state || {};

  const renderCopyButton = (onCopy: () => void) => (
    <ButtonV2
      text=""
      styleProps={buttonStyles}
      variant="dark"
      onClick={() => onCopy()}
    >
      Copy
      <img
        style={{ cursor: "pointer", marginLeft: "10px" }}
        src={require("@assets/svg/wireframe/copyGrey.svg")}
        alt="Copy"
      />
    </ButtonV2>
  );

  const renderDownloadButton = (onDownload: () => void) => (
    <ButtonV2
      text=""
      styleProps={buttonStyles}
      variant="dark"
      onClick={onDownload}
    >
      Download
      <img
        style={{
          cursor: "pointer",
          marginLeft: "10px",
          filter: "invert(1)",
        }}
        src={require("@assets/svg/wireframe/arrow-down.svg")}
        alt="Download"
      />
    </ButtonV2>
  );

  return (
    <Card
      heading="Transaction Details"
      style={{
        minHeight: "200px",
        overflowY: "scroll",
      }}
      middleSectionStyle={{
        width: "100%",
      }}
      subheadingStyle={{
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        rowGap: "10px",
        opacity: 1,
      }}
      subheading={
        <React.Fragment>
          <div>Signature</div>
          <div className={style["transactionDetailsRow"]}>
            {!downloadFilename ? (
              txSignature
            ) : (
              <pre className={style["jsonPreview"]}>{txSignature}</pre>
            )}
            <div
              style={
                !downloadFilename
                  ? { display: "inline" }
                  : {
                      display: "flex",
                      justifyContent: "space-around",
                    }
              }
            >
              {!downloadFilename ? (
                <img
                  style={{
                    cursor: "pointer",
                    marginLeft: "10px",
                  }}
                  onClick={() =>
                    onCopy(txSignature, "Transaction signature copied")
                  }
                  src={require("@assets/svg/wireframe/copyGrey.svg")}
                  alt=""
                />
              ) : (
                renderCopyButton(() =>
                  onCopy(txSignature, "Transaction signature copied")
                )
              )}
              {downloadFilename &&
                renderDownloadButton(() =>
                  downloadJson(
                    JSON.parse(txSignature),
                    `signature-${downloadFilename}.json`
                  )
                )}
            </div>
          </div>
          {signedTxn && (
            <React.Fragment>
              <div>Transaction</div>
              <div className={style["transactionDetailsRow"]}>
                <pre
                  className={style["jsonPreview"]}
                  style={{ maxHeight: "350px", overflowY: "scroll" }}
                >
                  {signedTxn}
                </pre>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-around",
                  }}
                >
                  {renderCopyButton(() =>
                    onCopy(signedTxn, "Signed transaction copied")
                  )}
                  {renderDownloadButton(() =>
                    downloadJson(
                      JSON.parse(signedTxn),
                      `signed-transaction-${downloadFilename}.json`
                    )
                  )}
                </div>
              </div>
            </React.Fragment>
          )}
          {txHash && (
            <React.Fragment>
              <div>Hash</div>
              <div className={style["transactionDetailsRow"]}>
                {txHash.toUpperCase()}
                <img
                  style={{
                    cursor: "pointer",
                    marginLeft: "10px",
                  }}
                  src={require("@assets/svg/wireframe/copyGrey.svg")}
                  alt=""
                  onClick={() =>
                    onCopy(txHash.toUpperCase(), "Transaction hash copied")
                  }
                />
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      }
      bottomContent={
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            width: "100%",
          }}
        >
          {txHash &&
          ([CHAIN_ID_DORADO, CHAIN_ID_FETCHHUB, CHAIN_ID_GEMINI].includes(
            chainId
          ) ||
            broadcastType === "single") ? (
            <ButtonV2
              styleProps={buttonStyles}
              variant="dark"
              text=""
              onClick={() => {
                if (broadcastType === "single") {
                  navigate("/activity-details", {
                    state: {
                      nodeId: txHash.toLocaleUpperCase(),
                    },
                  });
                } else {
                  const url = `${explorerBaseURL(
                    chainId
                  )}/transactions/${txHash}/`;
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }
              }}
            >
              Transaction Details
            </ButtonV2>
          ) : (
            ""
          )}
          <ButtonV2
            styleProps={buttonStyles}
            variant="dark"
            text=""
            onClick={() => navigate("/more/sign-manual-txn", { state: {} })}
          >
            Sign New Transaction
            <img
              style={{
                cursor: "pointer",
                filter: "invert(1)",
                width: "20px",
              }}
              src={require("@assets/svg/wireframe/signature-doc.svg")}
              alt=""
            />
          </ButtonV2>
        </div>
      }
    />
  );
};
