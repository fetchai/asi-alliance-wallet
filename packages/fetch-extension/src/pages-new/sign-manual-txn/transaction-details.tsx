import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import React from "react";
import { useLocation, useNavigate } from "react-router";
import style from "./styles.module.scss";

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
  const { txSignature, txHash } = location.state || {};
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
      }}
      subheading={
        <React.Fragment>
          <div>Signature</div>
          <div className={style["transactionDetailsRow"]}>
            {txSignature}
            <img
              style={{
                cursor: "pointer",
                marginLeft: "10px",
              }}
              src={require("@assets/svg/wireframe/copyGrey.svg")}
              alt=""
              onClick={() =>
                onCopy(txSignature, "Transaction signature copied")
              }
            />
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
              View Transaction Details
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
