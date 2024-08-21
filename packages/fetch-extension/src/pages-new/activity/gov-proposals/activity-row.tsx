import React from "react";
import style from "./style.module.scss";
import { observer } from "mobx-react-lite";
import { StatusButton } from "@components-v2/status-button";
import { useStore } from "../../../stores";

const cardStatus = (status: string) => {
  switch (status) {
    case "ABSTAIN":
      return "Pending";

    case "NO":
      return "Failed";

    case "YES":
      return "Success";

    case "NO_WITH_VETO":
      return "Failed";

    default:
      return "Active";
  }
};

const cardStatusTitle = (details: string) => {
  switch (details) {
    case "ABSTAIN":
      return "Abstain";

    case "NO":
      return "No";

    case "YES":
      return "Yes";

    case "NO_WITH_VETO":
      return "No With Veto";

    default:
      return "Active";
  }
};

export const ActivityRow = observer(({ node }: { node: any }) => {
  const details = node.option;
  const { proposalId, transaction, id } = node;
  const { status } = transaction;
  const { queriesStore, chainStore } = useStore();

  const current = chainStore.current;
  const queries = queriesStore.get(current.chainId);
  const proposal = queries.cosmos.queryGovernance.getProposal(proposalId || "");
  return (
    <React.Fragment>
      <a
        href={`https://www.mintscan.io/fetchai/tx/${id}`}
        target="_blank"
        rel="noreferrer"
      >
        <div className={style["activityRow"]}>
          <div className={style["middle"]}>
            <div className={style["activityCol"]}>
              {proposal?.raw.content.title}
            </div>
            <div className={style["rowSubtitle"]}>
              <div>PROPOSAL #{proposalId}</div>
              <div style={{ fontSize: "14px" }}>●</div>
              <div>
                {status === "Success"
                  ? "Confirmed"
                  : status
                  ? status
                  : "Failed"}
              </div>
            </div>
          </div>
          <div
            style={{
              justifyContent: "center",
              display: "flex",
              alignItems: "center",
            }}
          >
            <StatusButton
              status={cardStatus(details)}
              title={cardStatusTitle(details)}
            />
          </div>
        </div>
      </a>
      <div className={style["hr"]} />
    </React.Fragment>
  );
});
