import { computed, makeObservable, override } from "mobx";
import { DenomHelper, KVStore } from "@keplr-wallet/common";
import { ChainGetter, ObservableQuery } from "../../common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { ObservableQueryBalanceInner } from "../balances";
import axios from "axios";

interface CardanoAddressInfo {
  address: string;
  balance: string;
  stake_address?: string;
}

export class ObservableQueryCardanoBalance extends ObservableQuery<CardanoAddressInfo[]> {
  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly bech32Address: string
  ) {
    super(
      kvStore,
      axios.create({
        baseURL: chainGetter.getChain(chainId).rest,
        headers: {
          "Content-Type": "application/json",
        },
      }),
      "/address_info?select=address,balance,stake_address",
      {}
    );
    makeObservable(this);
  }

  protected override canFetch(): boolean {
    // Prevent fetching with invalid addresses
    return !!(this.bech32Address && 
              this.bech32Address !== "" && 
              this.bech32Address !== "undefined" &&
              this.bech32Address.length >= 10);
  }

  @override
  override *fetch(): Generator<any, void, any> {
    try {
      const response = yield this._instance.post('/address_info?select=address,balance,stake_address', {
        _addresses: [this.bech32Address]
      });
      
      if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
        this.setResponse({
          data: response.data,
          status: 200,
          staled: false,
          timestamp: Date.now()
        });
      } else {
        this.setResponse({
          data: [],
          status: 200,
          staled: false,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.warn('Cardano balance fetch failed:', error);
      this.setResponse({
        data: [],
        status: 500,
        staled: false,
        timestamp: Date.now()
      });
    }
  }

  get balance(): string {
    if (!this.response?.data?.[0]) return "0";
    return this.response.data[0].balance || "0";
  }

  get balanceInAda(): number {
    return Number(this.balance) / 1_000_000;
  }

  get stakeAddress(): string | undefined {
    return this.response?.data?.[0]?.stake_address;
  }
}

export class ObservableQueryCardanoBalanceInner extends ObservableQueryBalanceInner {
  protected readonly queryBalance: ObservableQueryCardanoBalance;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    denomHelper: DenomHelper,
    protected readonly address: string
  ) {
    super(kvStore, chainId, chainGetter, "", denomHelper);

    makeObservable(this);

    this.queryBalance = new ObservableQueryCardanoBalance(
      kvStore,
      chainId,
      chainGetter,
      address
    );
  }

  protected override canFetch(): boolean {
    return false; // fetching is delegated
  }

  override get isFetching(): boolean {
    return this.queryBalance.isFetching;
  }

  override get error() {
    return this.queryBalance.error;
  }

  override get response() {
    return this.queryBalance.response;
  }

  @override
  override *fetch() {
    yield this.queryBalance.fetch();
  }

  @computed
  get balance(): CoinPretty {
    const denom = this.denomHelper.denom;

    const chainInfo = this.chainGetter.getChain(this.chainId);
    const currency = chainInfo.currencies.find(
      (cur: any) => cur.coinMinimalDenom === denom
    );

    if (!currency) {
      throw new Error(`Unknown currency: ${denom}`);
    }

    // Graceful fallback: Check for valid balance data
    if (!this.queryBalance.response?.data || !this.queryBalance.response.data[0]) {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }

    const balanceData = this.queryBalance.response.data[0];
    const balanceValue = balanceData.balance;

    // Additional validation: ensure balance is a valid number
    if (!balanceValue || balanceValue === "0" || balanceValue === "") {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }

    // Parse balance and validate it's a positive number
    const parsedBalance = parseInt(balanceValue, 10);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }

    return new CoinPretty(currency, new Int(parsedBalance));
  }
}

export class ObservableQueryCardanoBalanceRegistry {
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

    return new ObservableQueryCardanoBalanceInner(
      this.kvStore,
      chainId,
      chainGetter,
      denomHelper,
      bech32Address
    );
  }
}