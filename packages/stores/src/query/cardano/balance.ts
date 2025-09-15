import { computed, makeObservable, override } from "mobx";
import { DenomHelper, KVStore } from "@keplr-wallet/common";
import { ChainGetter, ObservableQuery } from "../../common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { ObservableQueryBalanceInner } from "../balances";
import Axios from "axios";

// Copy lace useBalances pattern: inMemoryWallet.balance observables
export class ObservableQueryCardanoBalance extends ObservableQuery<any> {
  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly bech32Address: string,
    protected readonly laceWallet: any
  ) {
    super(
      kvStore,
      Axios.create({
        baseURL: chainGetter.getChain(chainId).rpc,
      }),
      "",
      {}
    );
    makeObservable(this);
  }

  protected override canFetch(): boolean {
    return this.bech32Address !== "";
  }

  @override
  override *fetch(): Generator<any, void, any> {
    if (!this.laceWallet) {
       // Fallback to direct Koios API call (free service)
      try {
        // Koios API v1 format: /address_utxos
        const response = yield this._instance.post('/address_utxos', {
          _addresses: [this.bech32Address]
        });
        const utxos = response.data || [];
        
        // Calculate total balance from UTXOs
        let totalBalance = BigInt(0);
        for (const utxo of utxos) {
          if (utxo.value) {
            totalBalance += BigInt(utxo.value);
          }
        }
        
        this.setResponse({
          data: {
            utxo: {
              total: { coins: totalBalance },
              available: { coins: totalBalance },
              unspendable: { coins: BigInt(0) }
            },
            rewards: BigInt(0),
            deposits: BigInt(0)
          },
          status: 200,
          staled: false,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error("Failed to fetch Cardano balance:", error);
        this.setResponse({
          data: {
            utxo: {
              total: { coins: BigInt(0) },
              available: { coins: BigInt(0) },
              unspendable: { coins: BigInt(0) }
            },
            rewards: BigInt(0),
            deposits: BigInt(0)
          },
          status: 200,
          staled: false,
          timestamp: Date.now()
        });
      }
      return;
    }

    // Copy lace useBalances logic
    const total = this.laceWallet.balance?.utxo?.total$?.value;
    const available = this.laceWallet.balance?.utxo?.available$?.value;
    const availableDeposits = this.laceWallet.balance?.rewardAccounts?.deposit$?.value;
    const availableRewards = this.laceWallet.balance?.rewardAccounts?.rewards$?.value;

    if (total && available) {
      // Copy lace walletBalanceTransformer logic
      const totalWithRewards = BigInt((total.coins || BigInt(0)) + (availableRewards || BigInt(0)));
      const availableWithRewards = BigInt((available.coins || BigInt(0)) + (availableRewards || BigInt(0)));

      this.setResponse({
        data: {
          utxo: {
            total: { coins: totalWithRewards },
            available: { coins: availableWithRewards },
            unspendable: { coins: BigInt(0) }
          },
          rewards: availableRewards || BigInt(0),
          deposits: availableDeposits || BigInt(0)
        },
        status: 200,
        staled: false,
        timestamp: Date.now()
      });
    }
  }
}

export class ObservableQueryCardanoBalanceInner extends ObservableQueryBalanceInner {
  protected readonly queryCardanoBalance: ObservableQueryCardanoBalance;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    denomHelper: DenomHelper,
    protected readonly bech32Address: string,
    laceWallet: any
  ) {
    super(kvStore, chainId, chainGetter, "", denomHelper);
    makeObservable(this);

    this.queryCardanoBalance = new ObservableQueryCardanoBalance(
      kvStore,
      chainId,
      chainGetter,
      bech32Address,
      laceWallet
    );
  }

  protected override canFetch(): boolean {
    return false;
  }

  override get isFetching(): boolean {
    return this.queryCardanoBalance.isFetching;
  }

  override get error() {
    return this.queryCardanoBalance.error;
  }

  override get response() {
    return this.queryCardanoBalance.response;
  }

  @override
  override *fetch() {
    yield* this.queryCardanoBalance.fetch();
  }

  @computed
  get balance(): CoinPretty {
    const denom = this.denomHelper.denom;
    const chainInfo = this.chainGetter.getChain(this.chainId);
    const currency = chainInfo.currencies.find(
      (cur) => cur.coinMinimalDenom === denom
    );

    if (!currency) {
      throw new Error(`Unknown currency: ${denom}`);
    }

    if (!this.queryCardanoBalance.response?.data) {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }

    // Copy lace walletBalanceTransformer: lovelaces to ADA
    const balanceData = this.queryCardanoBalance.response.data;
    const availableCoins = balanceData?.utxo?.available?.coins || BigInt(0);
    
    return new CoinPretty(currency, new Int(availableCoins.toString())).ready(true);
  }
}