import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { ChainGetter } from "../../chain";
import { computed } from "mobx";
import { ObservableChainQueryMap } from "../chain-query";
import { DomainData, DomainDataType } from "./types";
import { QuerySharedContext } from "../../common";

export class ObservableQueryDomainDataInner extends ObservableCosmwasmContractChainQuery<DomainData> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected override readonly contractAddress: string,
    protected readonly domain: string
  ) {
    super(kvStore, chainId, chainGetter, contractAddress, {
      get_domain_data: { domain: domain },
    });
  }

  @computed
  get domain_data(): DomainDataType | undefined {
    return this.response?.data?.domain_data;
  }
}

export class ObservableQueryDomainData extends ObservableChainQueryMap<DomainData> {
  constructor(
    protected readonly kvStore: QuerySharedContext,
    protected override readonly chainId: string,
    protected override readonly chainGetter: ChainGetter
  ) {
    super(kvStore, chainId, chainGetter, (key: string) => {
      const split = key.split("/");
      return new ObservableQueryDomainDataInner(
        this.kvStore,
        this.chainId,
        this.chainGetter,
        split[0],
        split[1]
      );
    });
  }

  getQueryContract(
    contractAddress: string,
    domain: string
  ): ObservableQueryDomainDataInner {
    return this.get(
      `${contractAddress}/${domain}`
    ) as ObservableQueryDomainDataInner;
  }
}
