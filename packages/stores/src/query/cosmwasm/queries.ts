import { QueriesSetBase } from "../queries";
import { ChainGetter } from "../../chain";
import { ObservableQueryCw20ContractInfo } from "./cw20-contract-info";
import { DeepReadonly } from "utility-types";
import { ObservableQueryCw20BalanceRegistry } from "./cw20-balance";
import { ObservableQueryNativeFetCosmosBridge } from "./native-fet-bridge";
import { ObservableQueryBridgeHistory } from "./bridge-history";
import { ObservableQueryBridgeReverseSwapHash } from "./bridge-reverse-swap-hash";
import { QuerySharedContext } from "../../common";
import { ObservableQueryNeutronStakingRewards } from "./neutron/staking-rewards";
import { ObservableQueryNeutronStakingRewardsConfig } from "./neutron/staking-rewards-config";
import { ObservableQueryNeutronGovernance } from "./neutron/governance-proposals";
import { ObservableQueryNeutronProposalVote } from "./neutron/governance-vote";

export interface CosmwasmQueries {
  cosmwasm: CosmwasmQueriesImpl;
}

export const CosmwasmQueries = {
  use(): (
    queriesSetBase: QueriesSetBase,
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) => CosmwasmQueries {
    return (
      queriesSetBase: QueriesSetBase,
      sharedContext: QuerySharedContext,
      chainId: string,
      chainGetter: ChainGetter
    ) => {
      return {
        cosmwasm: new CosmwasmQueriesImpl(
          queriesSetBase,
          sharedContext,
          chainId,
          chainGetter
        ),
      };
    };
  },
};

export class CosmwasmQueriesImpl {
  public readonly querycw20ContractInfo: DeepReadonly<ObservableQueryCw20ContractInfo>;
  public readonly queryNativeFetBridge: DeepReadonly<ObservableQueryNativeFetCosmosBridge>;
  public readonly queryBridgeHistory: DeepReadonly<ObservableQueryBridgeHistory>;
  public readonly queryBridgeReverseSwapHash: DeepReadonly<ObservableQueryBridgeReverseSwapHash>;
  public readonly queryNeutronStakingRewards: DeepReadonly<ObservableQueryNeutronStakingRewards>;
  public readonly queryNeutronStakingRewardsConfig: DeepReadonly<ObservableQueryNeutronStakingRewardsConfig>;
  public readonly queryNeutronGovernance: DeepReadonly<ObservableQueryNeutronGovernance>;
  public readonly queryNeutronVote: DeepReadonly<ObservableQueryNeutronProposalVote>;

  constructor(
    base: QueriesSetBase,
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    base.queryBalances.addBalanceRegistry(
      new ObservableQueryCw20BalanceRegistry(sharedContext)
    );

    this.querycw20ContractInfo = new ObservableQueryCw20ContractInfo(
      sharedContext,
      chainId,
      chainGetter
    );

    this.queryNeutronStakingRewards = new ObservableQueryNeutronStakingRewards(
      sharedContext,
      chainId,
      chainGetter
    );

    this.queryNeutronStakingRewardsConfig =
      new ObservableQueryNeutronStakingRewardsConfig(
        sharedContext,
        chainId,
        chainGetter
      );

    this.queryNeutronGovernance = new ObservableQueryNeutronGovernance(
      sharedContext,
      chainId,
      chainGetter
    );

    this.queryNeutronVote = new ObservableQueryNeutronProposalVote(
      sharedContext,
      chainId,
      chainGetter
    );

    this.queryNativeFetBridge = new ObservableQueryNativeFetCosmosBridge(
      sharedContext,
      chainGetter
    );

    this.queryBridgeHistory = new ObservableQueryBridgeHistory(
      sharedContext,
      chainGetter,
      this.queryNativeFetBridge
    );

    this.queryBridgeReverseSwapHash = new ObservableQueryBridgeReverseSwapHash(
      sharedContext,
      chainGetter,
      this.queryNativeFetBridge
    );
  }
}
