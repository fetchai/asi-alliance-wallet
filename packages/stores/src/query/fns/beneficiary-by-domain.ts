import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { ChainGetter } from "../../chain";
import { ObservableQueryMap } from "../../common";
import { computed } from "mobx";
import { BeneficiaryAddress } from "./types";
import { QuerySharedContext } from "../../common";

export class ObservableQueryGetBeneficiaryAddressInner extends ObservableCosmwasmContractChainQuery<BeneficiaryAddress> {
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
        resolve_name: { domain: domain },
      },
      `beneficiary-address-${contractAddress}-${domain}-${chainId}`
    );
  }

  @computed
  get beneficiaryAddress(): string {
    if (!this.response || !this.response.data.address) {
      return "";
    }

    return this.response.data.address;
  }
}

export class ObservableQueryBeneficiaryAddress extends ObservableQueryMap<BeneficiaryAddress> {
  constructor(
    protected readonly kvStore: QuerySharedContext,
    protected readonly chainId: string,
    protected readonly chainGetter: ChainGetter
  ) {
    super((key: string) => {
      const split = key.split("/");
      return new ObservableQueryGetBeneficiaryAddressInner(
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
  ): ObservableQueryGetBeneficiaryAddressInner {
    return this.get(
      `${contractAddress}/${domain}`
    ) as ObservableQueryGetBeneficiaryAddressInner;
  }
}
