import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { ChainGetter } from "../../chain";
import { ObservableQueryMap } from "../../common";
import { computed } from "mobx";
import { DomainData, DomainDataType } from "./types";
import { QuerySharedContext } from "../../common";

export class ObservableQueryDomainDataInner extends ObservableCosmwasmContractChainQuery<DomainData> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly contractAddress: string,
    protected readonly domain: string
  ) {
    super(
      kvStore,
      chainId,
      chainGetter,
      contractAddress,
      {
        get_domain_data: { domain: domain },
      },
      `domain-data-${contractAddress}-${domain}-${chainId}`
    );
  }

  @computed
  get domain_data(): DomainDataType | undefined {
    return this.response?.data?.domain_data;
  }
}

export class ObservableQueryDomainData extends ObservableQueryMap<DomainData> {
  constructor(
    protected readonly kvStore: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((key: string) => {
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
