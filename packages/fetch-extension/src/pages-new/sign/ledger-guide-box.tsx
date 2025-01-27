import React, { FunctionComponent, useEffect, useState } from "react";
import "./ledger-guide-box.module.scss";
import style from "./ledger-guide-box.module.scss";
import classnames from "classnames";
import { ErrFailedInit } from "@keplr-wallet/background/src/ledger/types";
import { WalletError } from "@keplr-wallet/router";

export interface LedgerGuideBoxProps {
  ledgerError: WalletError;
  isWarning: boolean;
  title: string;
}

export const LedgerBox: FunctionComponent<LedgerGuideBoxProps> = ({
  ledgerError,
  isWarning,
  title,
}) => {
  const [transportErrorCount, setTransportErrorCount] = useState(0);

  useEffect(() => {
    if (ledgerError.code === ErrFailedInit) {
      setTransportErrorCount((c) => c + 1);
    } else {
      setTransportErrorCount(0);
    }
  }, [ledgerError]);

  return (
    <div className={classnames(style["ledger-guide-box"])}>
      <div className={style["ledger-guide-content"]}>
        <span
          className={
            isWarning
              ? style["ledger-guide-error-title"]
              : style["ledger-guide-title"]
          }
        >
          {title}
        </span>
      </div>
      {transportErrorCount < 2 ? (
        <div className={style["ledger-guide-message"]}>
          {ledgerError.message}
        </div>
      ) : (
        <React.Fragment>
          <div className={style["ledger-guide-message"]}>
            ASI Alliance Wallet may have lost its USB permission by an unknown
            reason.
          </div>
          <div
            style={{
              fontSize: "13px",
              lineHeight: "120%",
              letterSpacing: "0.15px",
              color: "white",
              marginBottom: "0.5rem",
            }}
          >
            Visit{" "}
            <a
              style={{
                color: "#314FDF",
                textDecoration: "underline",
                cursor: "pointer",
              }}
              onClick={(e) => {
                e.preventDefault();

                browser.tabs
                  .create({
                    url: "/ledger-grant.html",
                  })
                  .then((_) => window.close());
              }}
            >
              this page
            </a>{" "}
            to regain the permission.
          </div>
        </React.Fragment>
      )}
    </div>
  );
};
