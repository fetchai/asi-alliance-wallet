import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import React from "react";
import { useLocation, useNavigate } from "react-router";
import style from "./styles.module.scss";
import { downloadJson } from "./utils";

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
  const { txSignature, txHash, signatureName, broadcasted } =
    location.state || {};
  return (
    <Card
      heading="Transaction Details"
      style={{
        minHeight: "200px",
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
            {broadcasted ? (
              txSignature
            ) : (
              <pre className={style["jsonPreview"]}>{txSignature}</pre>
            )}
            <div
              style={
                broadcasted
                  ? { display: "inline" }
                  : {
                      display: "flex",
                      justifyContent: "space-around",
                    }
              }
            >
              {broadcasted ? (
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
                <ButtonV2
                  text=""
                  styleProps={buttonStyles}
                  variant="dark"
                  onClick={() =>
                    onCopy(txSignature, "Transaction signature copied")
                  }
                >
                  Copy
                  <img
                    style={{
                      cursor: "pointer",
                      marginLeft: "10px",
                    }}
                    src={require("@assets/svg/wireframe/copyGrey.svg")}
                    alt=""
                  />
                </ButtonV2>
              )}
              {signatureName && (
                <ButtonV2
                  text=""
                  styleProps={buttonStyles}
                  variant="dark"
                  onClick={() =>
                    downloadJson(
                      JSON.parse(txSignature),
                      `${signatureName}.json`
                    )
                  }
                >
                  Download
                  <img
                    style={{
                      cursor: "pointer",
                      marginLeft: "10px",
                      filter: "invert(1)",
                    }}
                    src={require("@assets/svg/wireframe/arrow-down.svg")}
                    alt=""
                  />
                </ButtonV2>
              )}
            </div>
          </div>
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
          {txHash && (
            <ButtonV2
              styleProps={buttonStyles}
              variant="dark"
              text=""
              onClick={() =>
                navigate("/activity-details", {
                  state: {
                    nodeId: txHash.toLocaleUpperCase(),
                  },
                })
              }
            >
              Transaction Details
            </ButtonV2>
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
