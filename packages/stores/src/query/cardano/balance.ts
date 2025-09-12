import { KVStore } from "@keplr-wallet/common";
import { AppCurrency } from "@keplr-wallet/types";
import { CoinPretty } from "@keplr-wallet/unit";
import { runInAction, observable } from "mobx";

export class ObservableQueryCardanoBalance {
  @observable.shallow protected _balances: CoinPretty[] = [];
  @observable protected _isLoading: boolean = false;
  @observable protected _error: Error | null = null;

  constructor(
    _kvStore: KVStore, // Not used yet, may be needed for caching
    public laceWallet: any, // Temporary any, will be replaced with lace types
    private currency: AppCurrency
  ) {
    this.setupLaceObservables();
  }

  private setupLaceObservables() {
    if (!this.laceWallet) return;

    // Temporary stub until lace is configured
    runInAction(() => {
      this._isLoading = false;
      this._error = null;
      this._balances = [
        new CoinPretty(this.currency, 0),
        new CoinPretty(this.currency, 0),
        new CoinPretty(this.currency, 0),
        new CoinPretty(this.currency, 0),
        new CoinPretty(this.currency, 0)
      ];
    });
  }

  get balances(): CoinPretty[] {
    return this._balances;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  get error(): Error | null {
    return this._error;
  }

  getBalance(currency: AppCurrency): CoinPretty | undefined {
    return this._balances.find(b => b.currency.coinMinimalDenom === currency.coinMinimalDenom);
  }

  getAvailableBalance(): CoinPretty {
    return this._balances[0] || new CoinPretty(this.currency, 0);
  }

  getTotalBalance(): CoinPretty {
    return this._balances[1] || new CoinPretty(this.currency, 0);
  }

  getUnspendableBalance(): CoinPretty {
    return this._balances[2] || new CoinPretty(this.currency, 0);
  }

  getRewardsBalance(): CoinPretty {
    return this._balances[3] || new CoinPretty(this.currency, 0);
  }

  getDepositBalance(): CoinPretty {
    return this._balances[4] || new CoinPretty(this.currency, 0);
  }

  updateLaceWallet(laceWallet: any) {
    this.laceWallet = laceWallet;
    this.setupLaceObservables();
  }
}