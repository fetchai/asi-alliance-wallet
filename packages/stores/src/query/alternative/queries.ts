import { QueriesSetBase } from "../queries";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { EvmQueriesImpl } from "../evm/queries";
import { CardanoQueries } from "../cardano/queries";

export interface AlternativeQueries {
  evm: EvmQueriesImpl;
  cardano: CardanoQueries;
}

export const AlternativeQueries = {
  use(): (
    queriesSetBase: QueriesSetBase,
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter
  ) => AlternativeQueries {
    return (
      queriesSetBase: QueriesSetBase,
      kvStore: KVStore,
      chainId: string,
      chainGetter: ChainGetter
    ) => {
      return {
        evm: new EvmQueriesImpl(queriesSetBase, kvStore, chainId, chainGetter),
        cardano: CardanoQueries.use()(queriesSetBase, kvStore, chainId, chainGetter),
      };
    };
  },
};
