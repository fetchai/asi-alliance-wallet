import React from "react";
import { Alert } from "reactstrap";
import { ButtonV2 } from "@components-v2/buttons/button";
import { formatDistanceToNow } from "date-fns";
import { useStore } from "../../stores";
import { observer } from "mobx-react-lite";
import style from "./transaction-alert.module.scss";

interface OverrideAlertProps {
  isAmountInvalid?: boolean;
  onOverrideClick: (currentFees: any) => void;
}

export const TransactionOverrideAlert: React.FC<OverrideAlertProps> = observer(
  ({ isAmountInvalid = false, onOverrideClick }) => {
    const { activityStore } = useStore();

    const previousTxnFees = (activityStore.sortedNodes[0] as any)?.transaction
      ?.fees;
    const currentFees = JSON.parse(previousTxnFees || "[]")?.[0];
    const previousTxnTime = (activityStore.sortedNodes[0] as any)?.transaction
      ?.block?.timestamp;

    const elapsed = previousTxnTime
      ? formatDistanceToNow(new Date(previousTxnTime), { addSuffix: true })
      : "";

    return (
      <Alert className={style["alert"]}>
        <div className={style["alertText"]}>
          <img src={require("@assets/svg/wireframe/alert.svg")} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div className={style["text"]}>
              Previous transaction is in progress
            </div>
            <p className={style["lightText"]}>
              A previous transaction has been pending {elapsed}. Override it to
              proceed with a new one.
            </p>
          </div>
        </div>
        <ButtonV2
          text="Override"
          type="button"
          disabled={isAmountInvalid || !previousTxnFees}
          styleProps={{
            width: "fit-content",
            height: "fit-content",
            padding: "4px 8px",
            fontSize: "12px",
            opacity: previousTxnFees ? "1" : "0.5",
          }}
          onClick={() => onOverrideClick(currentFees)}
        />
      </Alert>
    );
  }
);
