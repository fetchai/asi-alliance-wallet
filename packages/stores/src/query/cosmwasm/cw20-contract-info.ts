import { Cw20ContractTokenInfo } from "./types";
import { ChainGetter } from "../../chain";
import { ObservableQueryMap } from "../../common";
import { computed } from "mobx";
import { ObservableCosmwasmContractChainQuery } from "./contract-query";
import { QuerySharedContext } from "../../common";

export class ObservableQueryCw20ContactInfoInner extends ObservableCosmwasmContractChainQuery<Cw20ContractTokenInfo> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly contractAddress: string
  ) {
    super(
      sharedContext,
      chainId,
      chainGetter,
      contractAddress,
      { token_info: {} },
      `cw20-contract-info-${contractAddress}-${chainId}`
    );
  }

  @computed
  get tokenInfo(): Cw20ContractTokenInfo | undefined {
    if (!this.response || !this.response.data) {
      return undefined;
    }

    return this.response.data;
  }
}

export class ObservableQueryCw20ContractInfo extends ObservableQueryMap<Cw20ContractTokenInfo> {
  constructor(
    protected readonly sharedContext: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((contractAddress: string) => {
      return new ObservableQueryCw20ContactInfoInner(
        this.sharedContext,
        this.chainId,
        this.chainGetter,
        contractAddress
      );
    });
  }

  getQueryContract(
    contractAddress: string
  ): ObservableQueryCw20ContactInfoInner {
    return this.get(contractAddress) as ObservableQueryCw20ContactInfoInner;
  }
}
