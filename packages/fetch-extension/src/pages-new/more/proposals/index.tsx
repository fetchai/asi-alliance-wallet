import React, { useEffect, useState } from "react";
import { useStore } from "../../../stores";

import { ButtonV2 } from "@components-v2/buttons/button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import { useDropdown } from "@components-v2/dropdown/dropdown-context";
import { SearchBar } from "@components-v2/search-bar";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { getFilteredProposals } from "@utils/filters";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { ErrorActivity } from "../../activity/error-activity";
import { UnsupportedNetwork } from "../../activity/unsupported-network";
import { GovtProposalRow } from "./proposal-row";
import style from "./style.module.scss";
import { NoResults } from "@components-v2/no-results";
import { type ObservableQueryProposal as ProposalType } from "@keplr-wallet/stores";
import { Governance } from "@keplr-wallet/stores";

export const proposalOptions = {
  ProposalActive: "PROPOSAL_STATUS_VOTING_PERIOD",
  ProposalPassed: "PROPOSAL_STATUS_PASSED",
  ProposalRejected: "PROPOSAL_STATUS_REJECTED",
  ProposalFailed: "PROPOSAL_STATUS_FAILED",
};

export const Proposals = observer(() => {
  const [filter, setFilter] = useState<"Active" | "Voted" | "Closed" | "">("");
  const [appliedFilter, setAppliedFilter] = useState<
    "Active" | "Voted" | "Closed" | ""
  >("");
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const { chainStore, accountStore, proposalStore, queriesStore } = useStore();
  const accountInfo = accountStore.getAccount(chainStore.current.chainId);

  const current = chainStore.current;

  const { isDropdownOpen, setIsDropdownOpen } = useDropdown();
  const [searchTerm, setSearchTerm] = useState("");
  const [isError, setIsError] = useState(false);
  const [proposals, setProposals] = useState<ProposalType[]>([]);
  const queries = queriesStore.get(chainStore.current.chainId);
  const storedProposals = proposalStore.proposals;

  // Get proposals
  useEffect(() => {
    (async () => {
      try {
        // if proposals are available don't fetch from query
        if (storedProposals?.allProposals?.length > 0) {
          setProposals(storedProposals.allProposals);
          return;
        }
        setIsLoading(true);
        const votedProposals: ProposalType[] = [];
        await queries.cosmos.queryGovernance.waitFreshResponse();
        const govProposals = queries.cosmos.queryGovernance.proposals;
        const allProposals = govProposals.filter(
          (proposal) =>
            proposal.proposalStatus !== Governance.ProposalStatus.DEPOSIT_PERIOD
        );
        let activeProposals = allProposals.filter((proposal) => {
          return (
            proposal.proposalStatus === Governance.ProposalStatus.VOTING_PERIOD
          );
        });

        const promises = activeProposals.map(async (proposal) => {
          try {
            const vote = queries.cosmos.queryProposalVote.getVote(
              proposal.id,
              accountInfo.bech32Address
            )?.vote;
            if (vote && vote != "Unspecified") return proposal.id;
          } catch (e) {}
        });
        const voteArray = await Promise.all(promises);

        activeProposals = activeProposals.filter((proposal) => {
          if (voteArray.indexOf(proposal.id) != -1) {
            votedProposals.push(proposal);
            return false;
          }
          return true;
        });
        const closedProposals = allProposals.filter((proposal) => {
          return (
            proposal.proposalStatus === Governance.ProposalStatus.PASSED ||
            proposal.proposalStatus === Governance.ProposalStatus.REJECTED ||
            proposal.proposalStatus === Governance.ProposalStatus.FAILED
          );
        });
        setProposals(allProposals);
        setIsLoading(false);
        proposalStore.setProposalsInStore({
          activeProposals,
          closedProposals,
          votedProposals,
          allProposals,
        });
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

    setAppliedFilter(filter);
    setProposals(newProposal);
  };

  return (
    <HeaderLayout
      showTopMenu={true}
      smallTitle={true}
      alternativeTitle={"Proposals"}
      canChangeChainInfo={false}
      showBottomMenu={false}
      onBackButton={() => {
        navigate(-1);
      }}
      rightRenderer={
        <div className={style["filter-container"]}>
          <div
            className={style["filter"]}
            onClick={() => setIsDropdownOpen(true)}
          >
            <div className={style["filter-toggle"]}>
              <div className={style["filter-heading"]}>
                <img
                  src={require("@assets/svg/wireframe/filter.svg")}
                  alt="filter"
                  className={style["arrow-icon"]}
                />
                Filters
              </div>
            </div>
          </div>
        </div>
      }
    >
      {!current.features?.includes("evm") ? (
        isError ? (
          <ErrorActivity />
        ) : isLoading ? (
          <div className={style["activity-loading"]}>
            Loading... <i className="fas fa-spinner fa-spin ml-2 mr-2" />
          </div>
        ) : proposals && Object.keys(proposals).length > 0 ? (
          <GovtProposal
            proposals={proposals}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
          />
        ) : (
          <NoResults
            styles={{
              height: "410px",
              rowGap: "0px",
            }}
            contentStyles={{
              color: "var(--font-dark)",
              textAlign: "center",
              fontSize: "24px",
              lineHeight: "34px",
              width: "320px",
            }}
            icon={
              <img
                src={require("@assets/svg/wireframe/no-activity.svg")}
                style={{ marginBottom: "24px" }}
                alt=""
              />
            }
          />
        )
      ) : (
        <UnsupportedNetwork chainID={current.chainName} />
      )}

      <GovtProposalFilterDropdown
        isOpen={isDropdownOpen}
        setIsOpen={setIsDropdownOpen}
        setSelectedFilter={setFilter}
        selectedFilter={filter}
        appliedFilter={appliedFilter}
        handleFilterChange={handleFilterChange}
      />
    </HeaderLayout>
  );
});

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
  const { analyticsStore } = useStore();
  return (
    <SearchBar
      valuesArray={proposals}
      placeholder="Search by title or Proposal ID"
      filterFunction={getFilteredProposals}
      searchTerm={searchTerm}
      onSearchTermChange={onSearchTermChange}
      itemsStyleProp={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
      emptyContent={<NoResults message="No Proposals Found" />}
      renderResult={(proposal, index) => (
        <div
          style={{
            cursor: "pointer",
          }}
          onClick={() => {
            navigate(`/proposal-detail/${proposal.id}`);
            analyticsStore.logEvent("proposal_item_click", {
              pageName: "More",
            });
          }}
        >
          <GovtProposalRow key={index} proposal={proposal.raw} />
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
  appliedFilter,
  handleFilterChange,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFilter: "Active" | "Voted" | "Closed" | "";
  setSelectedFilter: React.Dispatch<
    React.SetStateAction<"" | "Active" | "Voted" | "Closed">
  >;
  appliedFilter: "Active" | "Voted" | "Closed" | "";
  handleFilterChange: () => Promise<void>;
}) => {
  const filters = ["Active", "Voted", "Closed"];
  useEffect(() => {
    setSelectedFilter(appliedFilter);
  }, [isOpen]);

  return (
    <Dropdown
      closeClicked={() => {
        setIsOpen(false);
        setSelectedFilter("");
      }}
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
          disabled={selectedFilter === appliedFilter}
          variant="dark"
          styleProps={{
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
