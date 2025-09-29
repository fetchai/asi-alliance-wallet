import { computed, makeObservable, override } from "mobx";
import { DenomHelper, KVStore } from "@keplr-wallet/common";
import { ChainGetter, QueryResponse } from "../../common";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { ObservableQueryBalanceInner } from "../balances";
import { ObservableChainQuery } from "../chain-query";

interface CardanoAddressInfo {
  address: string;
  balance: string;
  stake_address?: string;
}

export class ObservableQueryCardanoBalance extends ObservableChainQuery<CardanoAddressInfo[]> {
  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    protected readonly bech32Address: string
  ) {
    super(
      kvStore,
      chainId,
      chainGetter,
      "/address_info?select=address,balance,stake_address"
    );
    makeObservable(this);
  }

  protected override canFetch(): boolean {
    // Prevent fetching with empty or invalid addresses (like Cosmos does)
    return !!(this.bech32Address && 
              this.bech32Address !== "" && 
              this.bech32Address !== "undefined" &&
              this.bech32Address.length > 0);
  }

  protected override getCacheKey(): string {
    // Include address in cache key to prevent mixing data between different addresses
    return `${super.getCacheKey()}/${this.bech32Address}`;
  }

  protected override async fetchResponse(
    abortController: AbortController
  ): Promise<{ response: QueryResponse<CardanoAddressInfo[]>; headers: any }> {
    const result = await this.instance.post<CardanoAddressInfo[]>('/address_info?select=address,balance,stake_address', {
      _addresses: [this.bech32Address]
    }, {
      signal: abortController.signal,
    });
    
    return {
      headers: result.headers,
      response: {
        data: result.data,
        status: result.status,
        staled: false,
        timestamp: Date.now(),
      },
    };
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
    protected readonly address: string,
    queryBalance?: ObservableQueryCardanoBalance
  ) {
    super(kvStore, chainId, chainGetter, "", denomHelper);

    makeObservable(this);

    // Use provided queryBalance or create new one
    this.queryBalance = queryBalance || new ObservableQueryCardanoBalance(
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

    if (!this.queryBalance.response?.data || !this.queryBalance.response.data[0]) {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }

    const balanceData = this.queryBalance.response.data[0];
    const balanceValue = balanceData.balance;
    
    if (!balanceValue || balanceValue === "") {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }
    
    if (balanceValue === "0") {
      return new CoinPretty(currency, new Int(0));
    }
    
    const parsedBalance = parseInt(balanceValue, 10);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      return new CoinPretty(currency, new Int(0)).ready(false);
    }

    return new CoinPretty(currency, new Int(parsedBalance));
  }

  // Force refresh when address changes
  forceRefresh(): void {
    this.queryBalance.fetch();
  }
}
