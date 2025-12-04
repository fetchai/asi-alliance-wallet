import { computed, makeObservable, observable, runInAction } from "mobx";
import {
  ObservableQueryGovParamDeposit,
  ObservableQueryGovParamTally,
  ObservableQueryGovParamVoting,
} from "./params";
import { KVStore } from "@keplr-wallet/common";
import {
  camelToSnake,
  ChainGetter,
  decodeProposalContent,
  ObservableQueryTendermint,
} from "../../../common";
import { DeepReadonly } from "utility-types";
import { Dec, DecUtils, Int, IntPretty } from "@keplr-wallet/unit";
import { computedFn } from "mobx-utils";
import { ObservableQueryProposal } from "./proposal";
import { ObservableQueryStakingPool } from "../staking";
import { GovExtension, setupGovExtension } from "@cosmjs/stargate";
import { ProposalStatus } from "cosmjs-types/cosmos/gov/v1beta1/gov";
import {
  QueryProposalResponse,
  QueryProposalsResponse,
} from "cosmjs-types/cosmos/gov/v1beta1/query";

export class ObservableQueryGovernance extends ObservableQueryTendermint<QueryProposalsResponse> {
  @observable.ref
  protected paramDeposit?: ObservableQueryGovParamDeposit = undefined;
  @observable.ref
  protected paramVoting?: ObservableQueryGovParamVoting = undefined;
  @observable.ref
  protected paramTally?: ObservableQueryGovParamTally = undefined;
  protected readonly chainGetter: ChainGetter;
  protected readonly chainId: string;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly _queryPool: ObservableQueryStakingPool
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as GovExtension;
        const result = await client.gov.proposals(
          ProposalStatus.PROPOSAL_STATUS_UNSPECIFIED,
          "",
          ""
        );
        return result;
      },
      setupGovExtension,
      "/cosmos/gov/v1beta1/proposals?pagination.limit=3000"
    );
    makeObservable(this);
    this.chainId = chainId;
    this.chainGetter = chainGetter;
  }

  getQueryPool(): DeepReadonly<ObservableQueryStakingPool> {
    return this._queryPool;
  }

  getQueryParamDeposit(): DeepReadonly<ObservableQueryGovParamDeposit> {
    if (!this.paramDeposit) {
      runInAction(() => {
        this.paramDeposit = new ObservableQueryGovParamDeposit(
          this.kvStore,
          this.chainId,
          this.chainGetter
        );
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.paramDeposit!;
  }

  getQueryParamVoting(): DeepReadonly<ObservableQueryGovParamVoting> {
    if (!this.paramVoting) {
      runInAction(() => {
        this.paramVoting = new ObservableQueryGovParamVoting(
          this.kvStore,
          this.chainId,
          this.chainGetter
        );
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.paramVoting!;
  }

  getQueryParamTally(): DeepReadonly<ObservableQueryGovParamTally> {
    if (!this.paramTally) {
      runInAction(() => {
        this.paramTally = new ObservableQueryGovParamTally(
          this.kvStore,
          this.chainId,
          this.chainGetter
        );
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.paramTally!;
  }

  @computed
  get quorum(): IntPretty {
    const paramTally = this.getQueryParamTally();
    if (!paramTally.response) {
      return new IntPretty(new Int(0)).ready(false);
    }

    // TODO: Use `RatePretty`
    let quorum = new Dec(paramTally.response.data.tallyParams.quorum);
    // Multiply 100
    quorum = quorum.mulTruncate(DecUtils.getPrecisionDec(2));

    return new IntPretty(quorum);
  }

  @computed
  get proposals(): DeepReadonly<ObservableQueryProposal[]> {
    if (!this.response) {
      return [];
    }

    const result: ObservableQueryProposal[] = [];

    for (const raw of this.response.data.proposals) {
      const decodedContent = decodeProposalContent(raw.content);
      const decodedRawResponse = camelToSnake({
        ...QueryProposalResponse.toJSON({
          proposal: raw,
        }).proposal,
        content: decodedContent,
      });
      result.push(
        new ObservableQueryProposal(
          this.kvStore,
          this.chainId,
          this.chainGetter,
          decodedRawResponse,
          this
        )
      );
    }

    return result.reverse();
  }

  readonly getProposal = computedFn(
    (id: string): DeepReadonly<ObservableQueryProposal> | undefined => {
      return this.proposals.find((proposal) => proposal.id === id);
    }
  );
}
