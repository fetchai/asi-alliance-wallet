import React from "react";
import { ProposalDurationRow } from "./proposal-duration-row";
import style from "./style.module.scss";
import { ProposalType } from "src/@types/proposal-type";

export const GovtProposalRow = ({ proposal }: { proposal: ProposalType }) => {
  const { content, voting_start_time, voting_end_time, status, proposal_id } =
    proposal;

  return (
    <div className={style["govt-proposal"]}>
      <div className={style["govt-proposal-row-container"]}>
        <div className={style["top-div"]}>
          <div
            className={style["proposal-number"]}
          >{`Proposal #${proposal_id}`}</div>
          <div className={style["proposal-title"]}>{content.title}</div>
        </div>

        <ProposalDurationRow
          voting_start_time={voting_start_time}
          voting_end_time={voting_end_time}
          status={status}
        />
      </div>
    </div>
  );
};
