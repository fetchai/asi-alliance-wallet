import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { ChainGetter } from "../../chain";
import { computed } from "mobx";
import { ObservableChainQueryMap } from "../chain-query";
import { BeneficiaryAddress } from "./types";
import { QuerySharedContext } from "../../common";

export class ObservableQueryGetBeneficiaryAddressInner extends ObservableCosmwasmContractChainQuery<BeneficiaryAddress> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected override readonly contractAddress: string,
    protected readonly domain: string
  ) {
    super(kvStore, chainId, chainGetter, contractAddress, {
      resolve_name: { domain: domain },
    });
  }

  @computed
  get beneficiaryAddress(): string {
    if (!this.response || !this.response.data.address) {
      return "";
    }

    return this.response.data.address;
  }
}

export class ObservableQueryBeneficiaryAddress extends ObservableChainQueryMap<BeneficiaryAddress> {
  constructor(
    protected readonly kvStore: QuerySharedContext,
    protected override readonly chainId: string,
    protected override readonly chainGetter: ChainGetter
  ) {
    super(kvStore, chainId, chainGetter, (key: string) => {
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
