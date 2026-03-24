import {
  ChainGetter,
  QueriesSetBase,
  QuerySharedContext,
} from "@keplr-wallet/stores";
import { DeepReadonly } from "utility-types";
import {
  ObservableQueryBitcoinBalance,
  ObservableQueryBitcoinFeeEstimates,
  ObservableQueryBitcoinUTXOs,
  ObservableQueryBitcoinTx,
  ObservableQueryBitcoinAddressTxs,
  ObservableQueryBitcoinBalanceRegistry,
} from "./indexer";

export interface BitcoinQueries {
  bitcoin: BitcoinQueriesStoreImpl;
}

export const BitcoinQueries = {
  use(): (
    queriesSetBase: QueriesSetBase,
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) => BitcoinQueries {
    return (
      queriesSetBase: QueriesSetBase,
      kvStore: QuerySharedContext,
      chainId: string,
      chainGetter: ChainGetter
    ) => {
      return {
        bitcoin: new BitcoinQueriesStoreImpl(
          queriesSetBase,
          kvStore,
          chainId,
          chainGetter
        ),
      };
    };
  },
};

export class BitcoinQueriesStore {
  protected map: Map<string, BitcoinQueriesStoreImpl> = new Map();

  constructor(
    protected readonly base: QueriesSetBase,
    protected readonly sharedContext: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {}

  public get(chainId: string): DeepReadonly<BitcoinQueriesStoreImpl> {
    const prior = this.map.get(chainId);
    if (prior) {
      return prior;
    }

    const store = new BitcoinQueriesStoreImpl(
      this.base,
      this.sharedContext,
      chainId,
      this.chainGetter
    );
    this.map.set(chainId, store);

    return store;
  }
}

class BitcoinQueriesStoreImpl {
  public readonly queryBitcoinBalance: DeepReadonly<ObservableQueryBitcoinBalance>;
  public readonly queryBitcoinUTXOs: DeepReadonly<ObservableQueryBitcoinUTXOs>;
  public readonly queryBitcoinTx: DeepReadonly<ObservableQueryBitcoinTx>;
  public readonly queryBitcoinAddressTxs: DeepReadonly<ObservableQueryBitcoinAddressTxs>;
  public readonly queryBitcoinFeeEstimates: DeepReadonly<ObservableQueryBitcoinFeeEstimates>;

  constructor(
    protected readonly base: QueriesSetBase,
    protected readonly sharedContext: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    base.queryBalances.addBalanceRegistry(
      new ObservableQueryBitcoinBalanceRegistry(sharedContext)
    );
    this.queryBitcoinBalance = new ObservableQueryBitcoinBalance(sharedContext);
    this.queryBitcoinUTXOs = new ObservableQueryBitcoinUTXOs(sharedContext);
    this.queryBitcoinTx = new ObservableQueryBitcoinTx(sharedContext);
    this.queryBitcoinAddressTxs = new ObservableQueryBitcoinAddressTxs(
      sharedContext
    );
    this.queryBitcoinFeeEstimates = new ObservableQueryBitcoinFeeEstimates(
      sharedContext,
      chainId,
      chainGetter
    );
  }
}
