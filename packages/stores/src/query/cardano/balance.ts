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
    // Cardano balance should be fetched through CardanoWalletManager, not REST API
    // This query is just a placeholder - actual balance comes from CardanoWalletManager
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
    // For now, return zero balance until CardanoWalletManager integration is complete
    // In Lace, balance comes from CardanoWalletManager.getBalance() via reactive streams
    // This should be integrated with the CardanoWalletManager in the background service
    
    // TODO: Integrate with CardanoWalletManager.getBalance() from background service
    // The balance should come from wallet.balance.utxo.available$ observable
    
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
