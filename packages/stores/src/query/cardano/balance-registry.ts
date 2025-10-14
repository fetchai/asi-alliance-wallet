import { DenomHelper, KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { ObservableQueryCardanoBalanceInner, ObservableQueryCardanoBalance } from "./balance";
import { ObservableQueryBalanceInner, BalanceRegistry } from "../balances";

export class ObservableQueryCardanoBalanceRegistry implements BalanceRegistry {
  protected cardanoBalances: Map<string, ObservableQueryCardanoBalance> = new Map();

  constructor(protected readonly kvStore: KVStore) {}

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

    // Cache ObservableQueryCardanoBalance by address (like Cosmos does)
    const key = `${chainId}/${bech32Address}`;

    if (!this.cardanoBalances.has(key)) {
      this.cardanoBalances.set(
        key,
        new ObservableQueryCardanoBalance(
          this.kvStore,
          chainId,
          chainGetter,
          bech32Address
        )
      );
    }

    return new ObservableQueryCardanoBalanceInner(
      this.kvStore,
      chainId,
      chainGetter,
      denomHelper,
      bech32Address,
      this.cardanoBalances.get(key)!
    );
  }
}
