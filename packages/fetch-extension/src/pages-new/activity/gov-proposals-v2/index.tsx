import React, { useEffect, useState } from "react";
import { useStore } from "../../../stores";

import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { useDropdown } from "@components-v2/dropdown/dropdown-context";
import { SearchBar } from "@components-v2/search-bar";
import { fetchProposals, fetchVote } from "@utils/fetch-proposals";
import { getFilteredProposals } from "@utils/filters";
import { useNavigate } from "react-router";
import { ProposalType } from "src/@types/proposal-type";
import { CHAIN_ID_DORADO, CHAIN_ID_FETCHHUB } from "../../../config.ui.var";
import { ErrorActivity } from "../error-activity";
import { NoActivity } from "../no-activity";
import { UnsupportedNetwork } from "../unsupported-network";
import { GovtProposalRow } from "./gov-proposal-row";
import style from "./style.module.scss";

export const proposalOptions = {
  ProposalActive: "PROPOSAL_STATUS_VOTING_PERIOD",
  ProposalPassed: "PROPOSAL_STATUS_PASSED",
  ProposalRejected: "PROPOSAL_STATUS_REJECTED",
  ProposalFailed: "PROPOSAL_STATUS_FAILED",
};

export const GovProposalsTabV2 = () => {
  const [filter, setFilter] = useState<"Active" | "Voted" | "Closed" | "">("");

  const [isLoading, setIsLoading] = useState(false);
  const { chainStore, accountStore, proposalStore } = useStore();
  const accountInfo = accountStore.getAccount(chainStore.current.chainId);
  const [proposals, setProposals] = useState<ProposalType[]>([]);

  const current = chainStore.current;

  const { isDropdownOpen, setIsDropdownOpen } = useDropdown();

  const [searchTerm, setSearchTerm] = useState("");
  const [isError, setIsError] = useState(false);

  const storedProposals = proposalStore.proposals;

  useEffect(() => {
    if (storedProposals.closedProposals.length === 0) {
      setIsLoading(true);
    } else {
      setProposals(storedProposals.closedProposals);
    }
    (async () => {
      try {
        const response = await fetchProposals(chainStore.current.chainId);
        const votedProposals: ProposalType[] = [];
        const allProposals = response.proposals.reverse();
        let activeProposals = allProposals.filter((proposal: ProposalType) => {
          return proposal.status === proposalOptions.ProposalActive;
        });

        const promises = activeProposals.map(async (proposal: ProposalType) => {
          try {
            const vote = await fetchVote(
              proposal.proposal_id,
              accountInfo.bech32Address,
              chainStore.current.rest
            );
            if (vote.vote.option && vote.vote.option != "Unspecified")
              return proposal.proposal_id;
          } catch (e) {}
        });
        const voteArray = await Promise.all(promises);

        activeProposals = activeProposals.filter((proposal: ProposalType) => {
          if (voteArray.indexOf(proposal.proposal_id) != -1) {
            votedProposals.push(proposal);
            return false;
          }
          return true;
        });
        const closedProposals = allProposals.filter(
          (proposal: ProposalType) => {
            return (
              proposal.status === proposalOptions.ProposalPassed ||
              proposal.status === proposalOptions.ProposalRejected ||
              proposal.status === proposalOptions.ProposalFailed
            );
          }
        );
        setIsLoading(false);
        proposalStore.setProposalsInStore({
          activeProposals,
          closedProposals,
          votedProposals,
          allProposals,
        });

        if (filter === "Active") {
          setProposals(activeProposals);
          return;
        }
        if (filter === "Closed") {
          setProposals(closedProposals);
          return;
        }

        if (filter === "Voted") {
          setProposals(votedProposals);
          return;
        }

        setProposals(allProposals);
      } catch (e) {
        setIsError(true);
      }
    })();
  }, []);

  const handleFilterChange = async () => {
    let newProposal: ProposalType[];

    if (filter === "Active") {
      newProposal = storedProposals.activeProposals;
    } else if (filter === "Closed") {
      newProposal = storedProposals.closedProposals;
    } else if (filter === "Voted") {
      newProposal = storedProposals.votedProposals;
    } else {
      newProposal = storedProposals.allProposals;
    }

    setProposals(newProposal);
  };

  return (
    <React.Fragment>
      <GovtProposalFilterDropdown
        isOpen={isDropdownOpen}
        setIsOpen={setIsDropdownOpen}
        setSelectedFilter={setFilter}
        selectedFilter={filter}
        handleFilterChange={handleFilterChange}
      />

      <div className={style["filter-container"]}>
        <div
          className={style["filter"]}
          onClick={() => setIsDropdownOpen(true)}
        >
          <div className={style["filter-toggle"]}>
            <div className={style["filter-heading"]}>
              Filter
              <img
                src={require("@assets/svg/wireframe/filter.svg")}
                alt="filter"
                className={style["arrow-icon"]}
              />
            </div>
          </div>
        </div>
      </div>

      {current.chainId === CHAIN_ID_FETCHHUB ||
      current.chainId === CHAIN_ID_DORADO ? (
        isError ? (
          <ErrorActivity />
        ) : Object.keys(proposals).length > 0 ? (
          <GovtProposal
            proposals={proposals}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
          />
        ) : isLoading ? (
          <div className={style["activity-loading"]}>Loading Proposals...</div>
        ) : (
          <NoActivity />
        )
      ) : (
        <UnsupportedNetwork chainID={current.chainName} />
      )}
    </React.Fragment>
  );
};

const GovtProposal = ({
  proposals,
  searchTerm,
  onSearchTermChange,
}: {
  proposals: ProposalType[];
  searchTerm: string;
  onSearchTermChange: React.Dispatch<React.SetStateAction<string>>;
}) => {
  const navigate = useNavigate();
  return (
    <SearchBar
      valuesArray={proposals}
      filterFunction={getFilteredProposals}
      searchTerm={searchTerm}
      onSearchTermChange={onSearchTermChange}
      itemsStyleProp={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
      renderResult={(proposal: ProposalType, index) => (
        <div
          onClick={() => {
            navigate(`/gov-proposal/details/${proposal.proposal_id}`);
          }}
        >
          <GovtProposalRow key={index} proposal={proposal} />
        </div>
      )}
    />
  );
};

const GovtProposalFilterDropdown = ({
  isOpen,
  setIsOpen,
  selectedFilter,
  setSelectedFilter,
  handleFilterChange,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFilter: "Active" | "Voted" | "Closed" | "";
  setSelectedFilter: React.Dispatch<
    React.SetStateAction<"" | "Active" | "Voted" | "Closed">
  >;
  handleFilterChange: () => Promise<void>;
}) => {
  const filters = ["Active", "Voted", "Closed"];

  return (
    <Dropdown
      closeClicked={() => setIsOpen(false)}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Filter"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <div>
          {filters.map((filter: any, index: number) => (
            <Card
              key={index}
              heading={filter}
              onClick={() => {
                if (filter === selectedFilter) {
                  setSelectedFilter("");
                  return;
                }
                setSelectedFilter(filter);
              }}
              isActive={filter === selectedFilter}
            />
          ))}
        </div>

        <ButtonV2
          text=""
          styleProps={{
            border: "1px solid rgba(255,255,255,0.4)",
            background: "transparent",
            color: "white",
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "0px",
          }}
          onClick={() => {
            handleFilterChange();
            setIsOpen(false);
          }}
        >
          Save Changes
        </ButtonV2>
      </div>
    </Dropdown>
  );
};
