import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { useDropdown } from "@components-v2/dropdown/dropdown-context";
import { useNotification } from "@components/notification";
import { Governance, ObservableQueryProposal } from "@keplr-wallet/stores";
import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../../../stores";
import { ButtonV2 } from "@components-v2/buttons/button";
import { TXNTYPE } from "../../../../config";
import { navigateOnTxnEvents } from "@utils/navigate-txn-event";

interface VoteDropdownProps {
  proposal: ObservableQueryProposal | undefined;
}

const voteArr = ["Unspecified", "Yes", "No", "No With Veto", "Abstain"];

export const VoteDropdown = ({ proposal }: VoteDropdownProps) => {
  const navigate = useNavigate();
  const notification = useNotification();

  const { chainStore, analyticsStore, accountStore } = useStore();
  const current = chainStore.current;
  const accountInfo = accountStore.getAccount(current.chainId);

  const [votedOn, setVotedOn] = useState(0);
  const [isSendingTx, setIsSendingTx] = useState(false);

  const { isDropdownOpen, setIsDropdownOpen } = useDropdown();

  const voteEnabled =
    proposal?.proposalStatus === Governance.ProposalStatus.VOTING_PERIOD;

  const handleClick = async () => {
    const vote: any = voteArr[votedOn];
    if (!proposal) return;
    if (vote !== "Unspecified" && accountInfo.isReadyToSendTx) {
      analyticsStore.logEvent("vote_txn_click", {
        action: vote,
      });
      const tx = accountInfo.cosmos.makeGovVoteTx(proposal?.id, vote);
      setIsSendingTx(true);
      try {
        let gas = accountInfo.cosmos.msgOpts.govVote.gas;

        // Gas adjustment is 1.5
        // Since there is currently no convenient way to adjust the gas adjustment on the UI,
        // Use high gas adjustment to prevent failure.
        try {
          gas = (await tx.simulate()).gasUsed * 1.5;
        } catch (e) {
          // Some chain with older version of cosmos sdk (below @0.43 version) can't handle the simulation.
          // Therefore, the failure is expected. If the simulation fails, simply use the default value.
          console.log(e);
        }

        await tx.send(
          { amount: [], gas: gas.toString() },
          "",
          {},
          {
            onBroadcasted: () => {
              analyticsStore.logEvent("vote_txn_broadcasted", {
                chainId: chainStore.current.chainId,
                chainName: chainStore.current.chainName,
              });
            },
          }
        );
      } catch (e: any) {
        analyticsStore.logEvent("vote_txn_broadcasted_fail", {
          chainId: chainStore.current.chainId,
          chainName: chainStore.current.chainName,
          message: e?.message ?? "",
        });
        console.log(e);
        if (e?.message === "Request rejected") {
          notification.push({
            type: "warning",
            placement: "top-center",
            duration: 5,
            content: `Failed to vote: ${e.message}`,
            canDelete: true,
            transition: {
              duration: 0.25,
            },
          });
          navigate("/", { replace: true });
          return;
        }
        notification.push({
          type: "warning",
          placement: "top-center",
          duration: 5,
          content: `Failed to vote: ${e.message}`,
          canDelete: true,
          transition: {
            duration: 0.25,
          },
        });
      } finally {
        setIsSendingTx(false);
        const txnNavigationOptions = {
          redirect: () => {
            navigate(`/activity?tab=Proposals`, { replace: true });
          },
          txType: TXNTYPE.govVote,
          txInProgress: accountInfo.txInProgress,
        };
        navigateOnTxnEvents(txnNavigationOptions);
      }
    }
  };

  const handleVoteClick = (id: number) => {
    if (!voteEnabled) {
      return;
    }
    setVotedOn(id);
  };

  return (
    <Dropdown
      closeClicked={() => setIsDropdownOpen(false)}
      isOpen={isDropdownOpen}
      setIsOpen={setIsDropdownOpen}
      title="Vote"
    >
      <div>
        {voteArr.map((voteOption: string, index: number) => {
          return (
            index > 0 && (
              <Card
                style={{
                  cursor: "pointer",
                }}
                key={index}
                heading={voteOption}
                onClick={() => handleVoteClick(index)}
                isActive={votedOn === index}
              />
            )
          );
        })}
      </div>

      <ButtonV2
        variant="dark"
        text="Submit"
        styleProps={{
          padding: "12px",
          height: "56px",
        }}
        disabled={votedOn === 0 || isSendingTx}
        onClick={handleClick}
      >
        {isSendingTx && <i className="fas fa-spinner fa-spin ml-2 mr-2" />}
      </ButtonV2>
    </Dropdown>
  );
};
