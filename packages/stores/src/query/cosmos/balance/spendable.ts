import { ObservableQueryMap, ObservableQueryTendermint } from "../../../common";
import { CoinPretty } from "@keplr-wallet/unit";
import { computed } from "mobx";
import {
  QuerySpendableBalancesRequest,
  QuerySpendableBalancesResponse,
} from "cosmjs-types/cosmos/bank/v1beta1/query";
import { Coin, QueryClient } from "@cosmjs/stargate";
import { QuerySharedContext } from "../../../common";
import { ChainGetter } from "../../../chain";

export interface BankSpendableExtension {
  bank: {
    spendableBalances(address: string): Promise<Coin[]>;
  };
}

const setupBankSpendableExtension = (
  base: QueryClient
): BankSpendableExtension => {
  return {
    bank: {
      async spendableBalances(address: string): Promise<Coin[]> {
        const req = QuerySpendableBalancesRequest.fromPartial({
          address,
        });

        const data = QuerySpendableBalancesRequest.encode(req).finish();

        const response = await base.queryAbci(
          "/cosmos.bank.v1beta1.Query/SpendableBalances",
          data
        );

        const decoded = QuerySpendableBalancesResponse.decode(response.value);
        return decoded.balances;
      },
    },
  };
};

export class ObservableChainQuerySpendableBalances extends ObservableQueryTendermint<QuerySpendableBalancesResponse> {
  protected readonly chainGetter: ChainGetter;
  protected readonly chainId: string;
  protected readonly address: string = "";

  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    address: string
  ) {
    const chainInfo = chainGetter.getChain(chainId);
    super(
      sharedContext,
      chainInfo.rpc,
      async (queryClient) => {
        const client = queryClient as unknown as BankSpendableExtension;
        const result = await client.bank.spendableBalances(address);
        return { balances: result };
      },
      setupBankSpendableExtension,
      `/cosmos/bank/v1beta1/spendable_balances/${address}`
    );
    this.chainId = chainId;
    this.chainGetter = chainGetter;
    this.address = address;
  }

  protected override canFetch(): boolean {
    // avoid fetching the endpoint for evm networks
    const chainInfo = this.chainGetter.getChain(this.chainId);
    return (
      !chainInfo?.features?.includes("eth-key-sign") && this.address.length > 0
    );
  }

  @computed
  get balances(): CoinPretty[] {
    if (!this.response) {
      return [];
    }

    const res: CoinPretty[] = [];

    const chainInfo = this.chainGetter.getChain(this.chainId);

    const balances = this.response.data.balances ?? [];
    for (const bal of balances) {
      const currency = chainInfo.findCurrency(bal.denom);
      if (currency) {
        res.push(new CoinPretty(currency, bal.amount));
      }
    }

    return res;
  }
}

export class ObservableQuerySpendableBalances extends ObservableQueryMap<QuerySpendableBalancesResponse> {
  constructor(
    protected readonly sharedContext: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((denom: string) => {
      return new ObservableChainQuerySpendableBalances(
        sharedContext,
        chainId,
        chainGetter,
        denom
      );
    });
  }

  getQueryBech32Address(
    bech32Address: string
  ): ObservableChainQuerySpendableBalances {
    return this.get(bech32Address) as ObservableChainQuerySpendableBalances;
  }
}
