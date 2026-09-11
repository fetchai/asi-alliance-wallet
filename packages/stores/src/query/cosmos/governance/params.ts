import { GovParamsDeposit, GovParamsTally, GovParamsVoting } from "./types";
import { ChainGetter } from "../../../chain";
import { ObservableQueryTendermint, QuerySharedContext } from "../../../common";
import { GovExtension, setupGovExtension } from "@cosmjs/stargate";
import {
  TallyParams,
  VotingParams,
  DepositParams,
} from "cosmjs-types/cosmos/gov/v1beta1/gov";

export class ObservableQueryGovParamTally extends ObservableQueryTendermint<GovParamsTally> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as GovExtension;
        const response = await client.gov.params("tallying");
        return { tallyParams: TallyParams.toJSON(response.tallyParams) };
      },
      setupGovExtension,
      `/cosmos/gov/v1beta1/params/tallying`
    );
  }
}

export class ObservableQueryGovParamVoting extends ObservableQueryTendermint<GovParamsVoting> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as GovExtension;
        const response = await client.gov.params("voting");
        return {
          votingParams: {
            votingPeriod: VotingParams.toJSON(
              response.votingParams
            ).votingPeriod.seconds.toString(),
          },
        };
      },
      setupGovExtension,
      `/cosmos/gov/v1beta1/params/voting`
    );
  }
}

export class ObservableQueryGovParamDeposit extends ObservableQueryTendermint<GovParamsDeposit> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as GovExtension;
        const response = await client.gov.params("deposit");
        const decodedResponse = DepositParams.toJSON(response.depositParams);
        return {
          depositParams: {
            minDeposit: decodedResponse.minDeposit,
            maxDepositPeriod:
              decodedResponse.maxDepositPeriod.seconds.toString(),
          },
        };
      },
      setupGovExtension,
      `/cosmos/gov/v1beta1/params/deposit`
    );
  }
}
