import moment from "moment";
import style from "./style.module.scss";
import React from "react";
import { StatusButton } from "@components-v2/status-button";
import { proposalOptions } from "..";

export const cardStatus = (status: string) => {
  switch (status) {
    case proposalOptions.ProposalActive:
      return "Active";

    case proposalOptions.ProposalFailed:
      return "Failed";

    case proposalOptions.ProposalPassed:
      return "Success";

    case proposalOptions.ProposalRejected:
      return "Failed";

    default:
      return "Active";
  }
};

export const cardStatusTitle = (status: string) => {
  switch (status) {
    case proposalOptions.ProposalActive:
      return "Active";

    case proposalOptions.ProposalFailed:
      return "Failed";

    case proposalOptions.ProposalPassed:
      return "Passed";

    case proposalOptions.ProposalRejected:
      return "Rejected";

    default:
      return "Active";
  }
};

export const ProposalDurationRow = ({
  voting_start_time,
  voting_end_time,
  status,
}: {
  voting_start_time: any;
  voting_end_time: any;
  status: any;
}) => {
  return (
    <div className={style["proposal-duration-div"]}>
      <div className={style["proposal-duration-container"]}>
        <div className={style["proposal-duration"]}>
          <div className={style["proposal-duration-title"]}>
            Voting start time
          </div>
          <div className={style["proposal-duration-date"]}>
            {moment(voting_start_time).format("ddd, MMM DD")}
          </div>
        </div>
        <div className={style["proposal-duration"]}>
          <div className={style["proposal-duration-title"]}>
            Voting end time
          </div>
          <div className={style["proposal-duration-date"]}>
            {moment(voting_end_time).format("ddd, MMM DD")}
          </div>
        </div>
      </div>

      <StatusButton
        status={cardStatus(status)}
        title={cardStatusTitle(status)}
      />
    </div>
  );
};
