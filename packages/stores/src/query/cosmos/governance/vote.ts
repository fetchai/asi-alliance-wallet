import { KVStore } from "@keplr-wallet/common";
import {
  ChainGetter,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";
import { GovExtension, setupGovExtension } from "@cosmjs/stargate";
import { QueryVoteResponse } from "cosmjs-types/cosmos/gov/v1beta1/query";
import { VoteOption } from "cosmjs-types/cosmos/gov/v1beta1/gov";

export class ObservableQueryProposalVoteInner extends ObservableQueryTendermint<QueryVoteResponse> {
  protected proposalId: string;
  protected bech32Address: string;
  protected readonly chainGetter: ChainGetter;
  protected readonly chainId: string;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    proposalsId: string,
    bech32Address: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as GovExtension;
        const result = await client.gov.vote(proposalsId, bech32Address);
        return result;
      },
      setupGovExtension,
      `/cosmos/gov/v1beta1/proposals/${proposalsId}/votes/${bech32Address}`
    );
    this.chainId = chainId;
    this.chainGetter = chainGetter;

    this.proposalId = proposalsId;
    this.bech32Address = bech32Address;
  }

  get vote(): "Yes" | "Abstain" | "No" | "NoWithVeto" | "Unspecified" {
    if (!this.response) {
      return "Unspecified";
    }

    switch (this.response.data.vote.option) {
      case VoteOption.VOTE_OPTION_YES:
        return "Yes";
      case VoteOption.VOTE_OPTION_ABSTAIN:
        return "Abstain";
      case VoteOption.VOTE_OPTION_NO:
        return "No";
      case VoteOption.VOTE_OPTION_NO_WITH_VETO:
        return "NoWithVeto";
      default:
        return "Unspecified";
    }
  }

  protected override canFetch(): boolean {
    /* If bech32 address is empty, it will always fail, so don't need to fetch it.
    also avoid fetching the endpoint for evm networks */
    const chainInfo = this.chainGetter.getChain(this.chainId);
    return (
      this.bech32Address.length > 0 && !chainInfo?.features?.includes("evm")
    );
  }
}

export class ObservableQueryProposalVote extends ObservableQueryMap<QueryVoteResponse> {
  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((param: string) => {
      const { proposalId, voter } = JSON.parse(param);

      return new ObservableQueryProposalVoteInner(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        proposalId,
        voter
      );
    });
  }

  getVote(proposalId: string, voter: string): ObservableQueryProposalVoteInner {
    const param = JSON.stringify({
      proposalId,
      voter,
    });
    return this.get(param) as ObservableQueryProposalVoteInner;
  }
}
