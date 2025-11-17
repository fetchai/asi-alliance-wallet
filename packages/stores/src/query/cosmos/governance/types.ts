// This is not the type for result of query.
export enum ProposalStatus {
  UNSPECIFIED,
  DEPOSIT_PERIOD,
  VOTING_PERIOD,
  PASSED,
  REJECTED,
  FAILED,
}

export type Tally = {
  // Int
  yes: string;
  abstain: string;
  no: string;
  no_with_veto: string;
};

export type ProposalTally = {
  tally: Tally;
};

export type Proposal = {
  // Int
  proposal_id: string;
  content: {
    "@type": string;
    title: string;
    description: string;
  };
  status:
    | "PROPOSAL_STATUS_UNSPECIFIED"
    | "PROPOSAL_STATUS_DEPOSIT_PERIOD"
    | "PROPOSAL_STATUS_VOTING_PERIOD"
    | "PROPOSAL_STATUS_PASSED"
    | "PROPOSAL_STATUS_REJECTED"
    | "PROPOSAL_STATUS_FAILED";
  final_tally_result: {
    // Int
    yes: string;
    // Int
    abstain: string;
    // Int
    no: string;
    // Int
    no_with_veto: string;
  };
  submit_time: string;
  deposit_end_time: string;
  total_deposit: {
    denom: string;
    // Int
    amount: string;
  }[];
  voting_start_time: string;
  voting_end_time: string;
};

export type GovProposals = {
  proposals: Proposal[];
  // TODO: Handle pagination
  // pagination: {}
};

export type GovParamsDeposit = {
  depositParams: {
    minDeposit: {
      denom: string;
      amount: string;
    }[];
    // Ex) 1209600s
    maxDepositPeriod: string;
  };
};

export type GovParamsVoting = {
  votingParams: {
    // Ex) 1209600s
    votingPeriod: string;
  };
};

export type GovParamsTally = {
  tallyParams: {
    // Dec
    quorum: string;
    // Dec
    threshold: string;
    // Dec
    vetoThreshold: string;
  };
};

export type ProposalVoter = {
  vote: {
    proposal_id: string;
    voter: string;
    option:
      | "VOTE_OPTION_UNSPECIFIED"
      | "VOTE_OPTION_YES"
      | "VOTE_OPTION_NO"
      | "VOTE_OPTION_NO_WITH_VETO"
      | "VOTE_OPTION_ABSTAIN";
    options: [
      {
        option:
          | "VOTE_OPTION_UNSPECIFIED"
          | "VOTE_OPTION_YES"
          | "VOTE_OPTION_NO"
          | "VOTE_OPTION_NO_WITH_VETO"
          | "VOTE_OPTION_ABSTAIN";
        // Dec
        weight: string;
      }
    ];
  };
};
