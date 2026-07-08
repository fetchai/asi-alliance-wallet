import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter, ObservableQueryMap } from "../../common";
import { computed } from "mobx";
import { DomainPrice, DomainPriceResult, DomainPriceType } from "./types";

export class ObservableQueryDomainPriceInner extends ObservableCosmwasmContractChainQuery<DomainPrice> {
  constructor(
    kvStore: KVStore,
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
        get_normalized_domain_and_price: { domain: domain },
      },
      `domain-price-${contractAddress}-${domain}-${chainId}`
    );
  }

  @computed
  get isValidDomain(): boolean {
    if (!this.response || !this.response.data.is_valid_domain) {
      return false;
    }
    return this.response.data.is_valid_domain;
  }

  get result(): DomainPriceResult | undefined {
    return this.response?.data?.result;
  }
  get price(): DomainPriceType | undefined {
    return this.response?.data?.result?.Success?.pricing;
  }
}

export class ObservableQueryDomainPrice extends ObservableQueryMap<DomainPrice> {
  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((key: string) => {
      const split = key.split("/");
      return new ObservableQueryDomainPriceInner(
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
  ): ObservableQueryDomainPriceInner {
    return this.get(
      `${contractAddress}/${domain}`
    ) as ObservableQueryDomainPriceInner;
  }
}
