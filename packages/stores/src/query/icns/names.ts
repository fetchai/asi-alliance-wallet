import { ObservableCosmwasmContractChainQuery } from "../cosmwasm/contract-query";
import { KVStore } from "@keplr-wallet/common";
import { ChainGetter, ObservableQueryMap } from "../../common";
import { computed } from "mobx";
import { ICNSNames } from "./types";

export class ObservableQueryICNSNamesInner extends ObservableCosmwasmContractChainQuery<ICNSNames> {
  constructor(
    kvStore: KVStore,
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
        icns_names: { address: address },
      },
      `icns-names-${contractAddress}-${address}-${chainId}`
    );
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
  constructor(kvStore: KVStore, chainId: string, chainGetter: ChainGetter) {
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
