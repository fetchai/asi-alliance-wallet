import { QueriesSetBase } from "../queries";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { ObservableQueryCardanoBalanceRegistry } from "./balance-registry";

export interface CardanoQueries {
  cardano: CardanoQueriesImpl;
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

   setLaceWallet(_laceWallet: any) {
    // Reserved for future lace wallet integration
  }
}

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
      };
    };
  },
};