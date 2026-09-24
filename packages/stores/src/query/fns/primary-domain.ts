import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { QuerySharedContext } from "../../common";
import { ChainGetter } from "../../chain";
import { ObservableQueryMap } from "../../common";
import { computed } from "mobx";
import { PrimaryDomain } from "./types";

export class ObservableQueryPrimaryDomainInner extends ObservableCosmwasmContractChainQuery<PrimaryDomain> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly contractAddress: string,
    protected readonly address: string
  ) {
    super(
      kvStore,
      chainId,
      chainGetter,
      contractAddress,
      {
        get_primary: { user_address: address },
      },
      `primary-domain-${contractAddress}-${address}-${chainId}`
    );
  }

  @computed
  get primaryDomain(): string {
    if (!this.response || !this.response.data.domain) {
      return "";
    }

    return this.response.data.domain;
  }
}

export class ObservableQueryPrimaryDomain extends ObservableQueryMap<PrimaryDomain> {
  constructor(
    protected readonly kvStore: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((key: string) => {
      const split = key.split("/");
      return new ObservableQueryPrimaryDomainInner(
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
  ): ObservableQueryPrimaryDomainInner {
    return this.get(
      `${contractAddress}/${domain}`
    ) as ObservableQueryPrimaryDomainInner;
  }
}
