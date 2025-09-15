import { QueriesSetBase } from "../queries";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { ObservableQueryCardanoBalanceRegistry } from "./balance-registry";

export interface CardanoQueries {
  cardano: CardanoQueriesImpl;
  use(): (
    queriesSetBase: QueriesSetBase,
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter
  ) => CardanoQueries;
}

export class CardanoQueriesImpl {
  public readonly cardanoBalanceRegistry: ObservableQueryCardanoBalanceRegistry;

  constructor(
    queriesSetBase: QueriesSetBase,
    kvStore: KVStore,
    _chainId: string,
    _chainGetter: ChainGetter
  ) {
    this.cardanoBalanceRegistry = new ObservableQueryCardanoBalanceRegistry(kvStore);
    
    queriesSetBase.queryBalances.addBalanceRegistry(
      this.cardanoBalanceRegistry
    );
  }

  setLaceWallet(laceWallet: any) {
    this.cardanoBalanceRegistry.laceWallet = laceWallet;
  }
}

// Create use function for compatibility with CosmosQueries, EvmQueries pattern
export const CardanoQueries = {
  use(): (
    queriesSetBase: QueriesSetBase,
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter
  ) => CardanoQueries {
    return (
      queriesSetBase: QueriesSetBase,
      kvStore: KVStore,
      chainId: string,
      chainGetter: ChainGetter
    ) => {
      return {
        cardano: new CardanoQueriesImpl(queriesSetBase, kvStore, chainId, chainGetter),
        use: () => CardanoQueries.use(),
      };
    };
  },
};