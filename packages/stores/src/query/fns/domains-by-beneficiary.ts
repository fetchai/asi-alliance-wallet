import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { QuerySharedContext } from "../../common";
import { ObservableQueryMap } from "../../common";
import { computed } from "mobx";
import { DomainsByBeneficiary } from "./types";
import { ChainGetter } from "../../chain";

export class ObservableQueryDomainsByBeneficiaryInner extends ObservableCosmwasmContractChainQuery<DomainsByBeneficiary> {
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
        reverse_look_up: { target: address },
      },
      `domain-by-beneficiary-${contractAddress}-${address}-${chainId}`
    );
  }

  @computed
  get domains(): string[] {
    if (!this.response || !this.response.data.domains) {
      return [];
    }

    return this.response.data.domains;
  }
}

export class ObservableQueryDomainsByBeneficiary extends ObservableQueryMap<DomainsByBeneficiary> {
  constructor(
    protected readonly kvStore: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((key: string) => {
      const split = key.split("/");
      return new ObservableQueryDomainsByBeneficiaryInner(
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
    address: string
  ): ObservableQueryDomainsByBeneficiaryInner {
    return this.get(
      `${contractAddress}/${address}`
    ) as ObservableQueryDomainsByBeneficiaryInner;
  }
}
