import { QueriesSetBase } from "../queries";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { ICNSQueriesImpl } from "../icns/queries";
import { FNSQueriesImpl } from "../fns/queries";

export interface NameServiceQueries {
  icns: ICNSQueriesImpl;
  fns: FNSQueriesImpl;
}

export const NameServiceQueries = {
  use(): (
    queriesSetBase: QueriesSetBase,
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter
  ) => NameServiceQueries {
    return (
      queriesSetBase: QueriesSetBase,
      kvStore: KVStore,
      chainId: string,
      chainGetter: ChainGetter
    ) => {
      return {
        icns: new ICNSQueriesImpl(queriesSetBase, kvStore, chainId, chainGetter),
        fns: new FNSQueriesImpl(queriesSetBase, kvStore, chainId, chainGetter),
      };
    };
  },
};
