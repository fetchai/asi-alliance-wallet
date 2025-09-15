import { DenomHelper, KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { ObservableQueryCardanoBalanceInner } from "./balance";
import { ObservableQueryBalanceInner } from "../balances";

export class ObservableQueryCardanoBalanceRegistry {
  constructor(protected readonly kvStore: KVStore, public laceWallet?: any) {}

  getBalanceInner(
    chainId: string,
    chainGetter: ChainGetter,
    bech32Address: string,
    minimalDenom: string
  ): ObservableQueryBalanceInner | undefined {
    const denomHelper = new DenomHelper(minimalDenom);
    const isCardano = chainGetter.getChain(chainId).features?.includes("cardano") ?? false;

    if (!(isCardano && denomHelper.type === "native")) {
      return undefined;
    }

    return new ObservableQueryCardanoBalanceInner(
      this.kvStore,
      chainId,
      chainGetter,
      denomHelper,
      bech32Address,
      this.laceWallet
    );
  }
}
