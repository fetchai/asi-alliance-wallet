import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { ChainGetter } from "../../chain";
import { ObservableQueryMap } from "../../common";
import { computed } from "mobx";
import { ICNSNames } from "./types";
import { QuerySharedContext } from "../../common";

export class ObservableQueryICNSNamesInner extends ObservableCosmwasmContractChainQuery<ICNSNames> {
  constructor(
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly contractAddress: string,
    protected readonly address: string
  ) {
    super(
      sharedContext,
      chainId,
      chainGetter,
      contractAddress,
      {
        icns_names: { address: address },
      },
      `icns-names-${contractAddress}-${address}-${chainId}`
    );
  }

  protected override canFetch(): boolean {
    return this.address !== "";
  }

  @computed
  get primaryName(): string {
    if (!this.response || !this.response.data) {
      return "";
    }

    return this.response.data.primary_name;
  }

  @computed
  get names(): string[] {
    if (!this.response || !this.response.data) {
      return [];
    }

    return this.response.data.names;
  }
}

export class ObservableQueryICNSNames extends ObservableQueryMap<ICNSNames> {
  constructor(
    kvStore: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) {
    super((key: string) => {
      const [contractAddress, address] = key.split("/");

      return new ObservableQueryICNSNamesInner(
        kvStore,
        chainId,
        chainGetter,
        contractAddress,
        address
      );
    });
  }

  getQueryContract(
    contractAddress: string,
    address: string
  ): ObservableQueryICNSNamesInner {
    return this.get(
      `${contractAddress}/${address}`
    ) as ObservableQueryICNSNamesInner;
  }
}
