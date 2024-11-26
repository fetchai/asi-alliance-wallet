import style from "./style.module.scss";
import React, { useEffect } from "react";
import { useStore } from "../../../stores";
import moment from "moment";
import { useNavigate } from "react-router";
import { getActivityIcon, getDetails } from "../utils";

export const ActivityRow = ({ node, setDate }: { node: any; setDate: any }) => {
  const navigate = useNavigate();
  const { chainStore, analyticsStore } = useStore();

  useEffect(() => {
    const details = getDetails(node, chainStore);
    const currentDate = moment(details.timestamp)
      .utc()
      .format("ddd, DD MMM YYYY");

    setDate(currentDate);
  }, [node, setDate]);

  const details = getDetails(node, chainStore);
  const { typeUrl } = node.transaction.messages.nodes[0];
  return (
    <React.Fragment>
      <div
        className={style["activityRow"]}
        onClick={() => {
          navigate("/activity-details", {
            state: {
              nodeId: node.id,
            },
          });
          analyticsStore.logEvent("activity_transactions_click", {
            tabName: "Transactions",
            pageName: "Activity",
          });
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className={style["leftImage"]}>
            <img
              className={style["img"]}
              src={getActivityIcon(typeUrl, details.verb)}
              alt={typeUrl}
            />
          </div>
          <div className={style["middleSection"]}>
            <div className={style["rowTitle"]}>{details.verb}</div>
            <div className={style["rowSubtitle"]}>
              {node.transaction.status === "Success" ? (
                <div>
                  Confirmed{" ● "}
                  {moment(details.timestamp).format("hh:mm A")}
                </div>
              ) : node.transaction.status === "Pending" ? (
                <div>
                  Pending{" ● "}
                  {moment(details.timestamp).format("hh:mm A")}
                </div>
              ) : node.transaction.status === "Failed" ? (
                <div>
                  Failed{" ● "}
                  {moment(details.timestamp).format("hh:mm A")}
                </div>
              ) : node.transaction.status === "Unconfirmed" ? (
                <div>
                  Unconfirmed{" ● "}
                  {moment(details.timestamp).format("hh:mm A")}
                </div>
              ) : (
                <div>Error</div>
              )}
            </div>
          </div>
        </div>
        <div className={style["rightContent"]}>
          <div className={style["amountWrapper"]}>
            <div className={style["amountNumber"]}>{details.amountNumber}</div>
            <div className={style["amountAlphabetic"]}>
              {details.amountAlphabetic}
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};
