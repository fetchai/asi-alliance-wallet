import { DenomHelper, KVStore } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import {
  ObservableQueryCardanoBalanceInner,
  ObservableQueryCardanoBalance,
} from "./balance";
import { ObservableQueryBalanceInner, BalanceRegistry } from "../balances";

export class ObservableQueryCardanoBalanceRegistry implements BalanceRegistry {
  protected cardanoBalances: Map<string, ObservableQueryCardanoBalance> =
    new Map();
  // Addresses for which token discovery has already been triggered
  private discoveryTriggered: Set<string> = new Set();

  constructor(
    protected readonly kvStore: KVStore,
    // Called when a Cardano address balance is first accessed; triggers native token discovery
    private readonly onAddressAccessed?: (
      chainId: string,
      bech32Address: string
    ) => void
  ) {}

  getBalanceInner(
    chainId: string,
    chainGetter: ChainGetter,
    bech32Address: string,
    minimalDenom: string
  ): ObservableQueryBalanceInner | undefined {
    const denomHelper = new DenomHelper(minimalDenom);
    const isCardano =
      chainGetter.getChain(chainId).features?.includes("cardano") ?? false;

    if (!(isCardano && denomHelper.type === "native")) {
      return undefined;
    }

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

    // Auto-trigger native token discovery (idempotent)
    if (this.onAddressAccessed && !this.discoveryTriggered.has(key)) {
      this.discoveryTriggered.add(key);
      this.onAddressAccessed(chainId, bech32Address);
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
