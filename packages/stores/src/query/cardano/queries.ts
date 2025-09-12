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
  private laceWallet?: any; // Temporary any, will be replaced with lace types

  constructor(
    _queriesSetBase: QueriesSetBase,
    kvStore: KVStore,
    _chainId: string,
    _chainGetter: ChainGetter
  ) {
    this.cardanoBalanceRegistry = new ObservableQueryCardanoBalanceRegistry(kvStore);
  }

  setLaceWallet(laceWallet: any) {
    this.laceWallet = laceWallet;
  }

  getBalance(currency: any): any {
    return this.cardanoBalanceRegistry.getBalance(this.laceWallet, currency);
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