import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { useDropdown } from "@components-v2/dropdown/dropdown-context";
import { Governance } from "@keplr-wallet/stores";
import { IntPretty } from "@keplr-wallet/unit";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Link } from "react-router-dom";
import { useStore } from "../../../../stores";
import { ProposalDurationRow } from "../proposal-row/proposal-duration-row";
import { ProgressBar } from "./progress-bar";
import style from "./style.module.scss";
import { VoteDropdown } from "./vote-dropdown";

type TallyResult = {
  title: string;
  percentage: IntPretty | undefined;
  color: string;
  isVote: string;
};

export const ProposalDetail = observer(() => {
  const navigate = useNavigate();

  const { queriesStore, chainStore, accountStore } = useStore();
  const { id } = useParams<{ id: string }>();

  const [isLoading, setIsLoading] = useState(true);

  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);
  const proposal = queries.cosmos.queryGovernance.getProposal(id || "");

  useEffect(() => {
    if (proposal) {
      setIsLoading(false);
    }
  }, [proposal]);

  const tallyResult: TallyResult[] = [
    {
      title: "Yes",
      percentage: proposal?.tallyRatio.yes,
      color: "rgba(66, 25, 229, 1)",
      isVote: "Yes",
    },
    {
      title: "No",
      percentage: proposal?.tallyRatio.no,
      color: "rgba(95, 56, 251, 1)",
      isVote: "No",
    },
    {
      title: "No with veto",
      percentage: proposal?.tallyRatio.noWithVeto,
      color: "rgba(159, 136, 253, 1)",
      isVote: "NoWithVeto",
    },
    {
      title: "Abstain",
      percentage: proposal?.tallyRatio.abstain,
      color: "rgba(207, 195, 254, 1)",
      isVote: "Abstain",
    },
  ];

  const voted = (() => {
    if (!proposal) {
      return undefined;
    }

    // Can fetch the vote only if the proposal is in voting period.
    if (proposal.proposalStatus !== Governance.ProposalStatus.VOTING_PERIOD) {
      return undefined;
    }

    return queries.cosmos.queryProposalVote.getVote(
      proposal.id,
      accountInfo.bech32Address
    ).vote;
  })();

  const voteText = (() => {
    if (!proposal) {
      return "Loading...";
    }
    switch (proposal.proposalStatus) {
      case Governance.ProposalStatus.DEPOSIT_PERIOD:
        return "Vote Not Started";
      case Governance.ProposalStatus.VOTING_PERIOD:
        return voted !== "Unspecified" ? "Change your vote" : "Vote";
      default:
        return "Voting closed";
    }
  })();

  const voteEnabled =
    proposal?.proposalStatus === Governance.ProposalStatus.VOTING_PERIOD;

  const { setIsDropdownOpen } = useDropdown();
  const { analyticsStore } = useStore();
  return (
    <HeaderLayout
      showChainName={false}
      canChangeChainInfo={false}
      onBackButton={() => {
        navigate(-1);
      }}
      showBottomMenu={false}
      showTopMenu={true}
    >
      {isLoading || !proposal ? (
        <div className={style["loading"]}>
          Loading... <i className="fas fa-spinner fa-spin ml-2 mr-2" />
        </div>
      ) : (
        <div>
          <div className={style["gov-proposal-details-container"]}>
            <div className={style["content"]}>
              <div className={style["title"]}>
                {proposal?.raw.content.title}
              </div>
              <div className={style["description"]}>
                {proposal?.raw.content.description}
              </div>
            </div>

            <ProposalDurationRow
              voting_start_time={proposal?.raw.voting_start_time}
              voting_end_time={proposal?.raw.voting_end_time}
              status={proposal?.raw.status}
            />

            <Link
              to={`https://www.mintscan.io/fetchai/proposals/${id}`}
              target="_blank"
              onClick={() => {
                analyticsStore.logEvent(
                  "proposal_view_in_block_explorer_click",
                  {
                    pageName: "Proposals",
                  }
                );
              }}
            >
              <Card
                style={{
                  cursor: "pointer",
                }}
                heading="View full text of the proposal"
                leftImage={require("@assets/svg/wireframe/proposal.svg")}
                rightContent={require("@assets/svg/wireframe/external-link.svg")}
                leftImageStyle={{
                  height: "32px",
                  width: "32px",
                  padding: "4px",
                }}
              />
            </Link>

            <div className={style["turnout"]}>
              <div className={style["label"]}>TURNOUT</div>
              <ProgressBar
                progressWidth={
                  parseInt(proposal?.turnout.toString() || "0") ?? 0
                }
                height="30px"
                title={`${proposal.turnout
                  .trim(true)
                  .maxDecimals(2)
                  .toString()}%`}
                bgColor="var(--bg-green-lightest)"
                isShowPercentage={false}
              />
            </div>

            <div className={style["tally-results"]}>
              {tallyResult.map((item: TallyResult, index: number) => (
                <ProgressBar
                  key={index}
                  progressWidth={
                    item.percentage
                      ? Number(item.percentage.trim(true).maxDecimals(2))
                      : 0
                  }
                  height="54px"
                  borderRadius="12px"
                  title={item.title}
                  bgColor="var(--bg-green-base)"
                  isShowPercentage={true}
                  isYourVote={voted === item.isVote}
                />
              ))}
            </div>

            <div
              style={{
                marginBottom: "12px",
              }}
            />
          </div>

          <ButtonV2
            text={voteText}
            variant={voted !== "Unspecified" ? "dark" : "light"}
            styleProps={{
              width: "100%",
              padding: "12px",
              height: "56px",
            }}
            disabled={!voteEnabled || !accountInfo.isReadyToSendTx}
            onClick={() => {
              if (!voteEnabled) return;
              setIsDropdownOpen(true);
            }}
          />
          <VoteDropdown proposal={proposal} />
        </div>
      )}
    </HeaderLayout>
  );
});
