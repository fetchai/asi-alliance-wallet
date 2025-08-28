import { ObservableChainQuery } from "../chain-query";
import { ObservableQueryBalanceInner, BalanceRegistry } from "../balances";
import { KVStore, DenomHelper } from "@keplr-wallet/common";
import { ChainGetter } from "../../common";
import { computed, makeObservable } from "mobx";
import { CoinPretty, Int } from "@keplr-wallet/unit";

// lace-style: Define balance data structure
interface CardanoBalance {
  coins: bigint;
  assets?: Map<string, bigint>;
}

interface CardanoBalanceResponse {
  utxo: {
    total: CardanoBalance;
    available: CardanoBalance;
    unspendable: CardanoBalance;
  };
  rewards: bigint;
  deposits: bigint;
}

export class ObservableQueryCardanoBalance extends ObservableChainQuery<CardanoBalanceResponse> {
  public readonly bech32Address: string;

  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    bech32Address: string
  ) {
    super(kvStore, chainId, chainGetter, `/cardano/balance/${bech32Address}`);
    this.bech32Address = bech32Address;
    makeObservable(this);
  }

  protected override canFetch(): boolean {
    // For now, return false to prevent actual fetching until CardanoWalletManager is implemented
    return false;
  }
}

export class ObservableQueryCardanoBalanceNative extends ObservableQueryBalanceInner {
  constructor(
    kvStore: KVStore,
    chainId: string,
    chainGetter: ChainGetter,
    denomHelper: DenomHelper,
    protected readonly cardanoBalances: ObservableQueryCardanoBalance
  ) {
    super(kvStore, chainId, chainGetter, "", denomHelper);
    makeObservable(this);
  }

  protected override canFetch(): boolean {
    return this.cardanoBalances.bech32Address.length > 0;
  }

  @computed
  get balance(): CoinPretty {
    const denom = this.denomHelper.denom;
    
    if (!this.cardanoBalances.response?.data) {
      return new CoinPretty(this.currency, new Int(0));
    }

    // Handle ADA (lovelace) - include rewards like lace does
    if (denom === "lovelace") {
      const { utxo, rewards } = this.cardanoBalances.response.data;
      const totalAda = utxo.total.coins + rewards;
      return new CoinPretty(this.currency, new Int(totalAda.toString()));
    }

    // Handle Cardano native tokens
    const assets = this.cardanoBalances.response.data.utxo.total.assets;
    if (assets?.has(denom)) {
      const tokenBalance = assets.get(denom)!;
      return new CoinPretty(this.currency, new Int(tokenBalance.toString()));
    }

    return new CoinPretty(this.currency, new Int(0));
  }
}

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
    const chainInfo = chainGetter.getChain(chainId);
    
    // Only handle Cardano networks with native denominations
    if (denomHelper.type !== "native" || !this.isCardanoNetwork(chainInfo)) {
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

    return new ObservableQueryCardanoBalanceNative(
      this.kvStore,
      chainId,
      chainGetter,
      denomHelper,
      this.cardanoBalances.get(key)!
    );
  }

  private isCardanoNetwork(chainInfo: any): boolean {
    return (
      chainInfo?.features?.includes("cardano") ||
      chainInfo?.chainId?.includes("cardano") ||
      chainInfo?.bech32Config?.bech32PrefixAccAddr === "addr"
    );
  }
}
