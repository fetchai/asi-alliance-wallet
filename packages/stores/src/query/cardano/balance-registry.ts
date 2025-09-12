import { KVStore } from "@keplr-wallet/common";
import { AppCurrency } from "@keplr-wallet/types";
import { ChainGetter } from "../../common";
import { ObservableQueryCardanoBalance } from "./balance";
import { ObservableQueryBalanceInner } from "../balances";

export class ObservableQueryCardanoBalanceRegistry {
  protected _balances: Map<string, ObservableQueryCardanoBalance> = new Map();

  constructor(protected readonly kvStore: KVStore) {}

  getBalance(
    laceWallet: any, // Temporary any, will be replaced with lace types
    currency: AppCurrency
  ): ObservableQueryCardanoBalance {
    const key = `${currency.coinMinimalDenom}-${laceWallet.wallet.id}`;
    
    if (!this._balances.has(key)) {
      this._balances.set(
        key,
        new ObservableQueryCardanoBalance(this.kvStore, laceWallet, currency)
      );
    }

    const balance = this._balances.get(key)!;
    
    if (balance && laceWallet !== balance.laceWallet) {
      balance.updateLaceWallet(laceWallet);
    }

    return balance;
  }

  clearCache() {
    this._balances.clear();
  }

  getBalanceInner(
    _chainId: string,
    _chainGetter: ChainGetter,
    _bech32Address: string,
    _minimalDenom: string
  ): ObservableQueryBalanceInner | undefined {
    // For now, return undefined as Cardano balance integration is not complete
    return undefined;
  }
}
