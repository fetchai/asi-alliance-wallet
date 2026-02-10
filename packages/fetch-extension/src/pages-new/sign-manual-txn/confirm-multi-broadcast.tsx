import { Card } from "@components-v2/card";
import React from "react";
import style from "./styles.module.scss";

export const ConfirmMultisigBroadcast: React.FC<{
  txnPayload: string;
}> = ({ txnPayload }) => {
  return (
    <Card
      heading="Confirm and Broadcast"
      style={{
        minHeight: "500px",
        maxHeight: "500px",
        overflowY: "scroll",
      }}
      headingStyle={{
        fontSize: "16px",
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
          <div>Transaction</div>
          <div
            className={style["transactionDetailsRow"]}
            style={{ overflowY: "scroll", maxHeight: "400px" }}
          >
            {txnPayload ? (
              <pre className={style["jsonPreview"]}>{txnPayload}</pre>
            ) : (
              ""
            )}
          </div>
        </React.Fragment>
      }
    />
  );
};
