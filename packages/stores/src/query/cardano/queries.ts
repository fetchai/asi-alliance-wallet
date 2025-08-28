import { QueriesSetBase } from "../queries";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { ObservableQueryCardanoBalanceRegistry } from "./balance";

export interface CardanoQueries {
  cardano: CardanoQueriesImpl;
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
        cardano: new CardanoQueriesImpl(
          queriesSetBase,
          kvStore,
          chainId,
          chainGetter
        ),
      };
    };
  },
};

export class CardanoQueriesImpl {
  constructor(
    base: QueriesSetBase,
    kvStore: KVStore,
    _chainId: string,
    _chainGetter: ChainGetter
  ) {
    // Register Cardano balance registry - following same pattern as Cosmos/EVM
    base.queryBalances.addBalanceRegistry(
      new ObservableQueryCardanoBalanceRegistry(kvStore)
    );
  }
}
