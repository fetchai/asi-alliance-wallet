import { SupplyTotal } from "./types";
import { KVStore } from "@keplr-wallet/common";
import {
  ChainGetter,
  ObservableQueryMap,
  ObservableQueryTendermint,
} from "../../../common";
import { BankExtension, setupBankExtension } from "@cosmjs/stargate";

export class ObservableChainQuerySupplyTotal extends ObservableQueryTendermint<SupplyTotal> {
  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    denom: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      kvStore,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as BankExtension;
        const result = await client.bank.supplyOf(denom);
        return { amount: result };
      },
      setupBankExtension,
      `/cosmos/bank/v1beta1/supply/${denom}`
    );
  }
}

export class ObservableQuerySupplyTotal extends ObservableQueryMap<SupplyTotal> {
  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((denom: string) => {
      return new ObservableChainQuerySupplyTotal(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        denom
      );
    });
  }

  getQueryDenom(denom: string) {
    return this.get(denom);
  }

  // cosmos-sdk v0.46.0+ has changed the API to use query string.
  getQueryDenomByQueryString(denom: string) {
    return this.get(`by_denom?denom=${denom}`);
  }

  getQueryStakeDenom() {
    const chainInfo = this.chainGetter.getChain(this.chainId);
    return this.get(chainInfo.stakeCurrency.coinMinimalDenom);
  }
}
