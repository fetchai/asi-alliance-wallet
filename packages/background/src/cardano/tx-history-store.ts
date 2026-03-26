import { KVStore } from "@keplr-wallet/common";
import type { CardanoTxHistoryItem } from "./messages";

export type CardanoTxHistorySnapshot = {
  items: CardanoTxHistoryItem[];
  mightHaveMore: boolean;
  hasDegradedItems?: boolean;
};

export class CardanoTxHistoryStore {
  constructor(
    private readonly kvStore: KVStore,
    private readonly maxItems: number = 1000
  ) {}

  async get(
    chainId: string,
    walletId: string
  ): Promise<CardanoTxHistorySnapshot | undefined> {
    if (!walletId) return undefined;
    const key = this.getKey(chainId, walletId);
    return (await this.kvStore.get<CardanoTxHistorySnapshot>(key)) ?? undefined;
  }

  async set(
    chainId: string,
    walletId: string,
    snapshot: CardanoTxHistorySnapshot
  ): Promise<void> {
    if (!walletId) return;
    const key = this.getKey(chainId, walletId);
    await this.kvStore.set(key, this.trim(snapshot));
  }

  private trim(snapshot: CardanoTxHistorySnapshot): CardanoTxHistorySnapshot {
    if (snapshot.items.length <= this.maxItems) {
      return snapshot;
    }
    return {
      ...snapshot,
      items: snapshot.items.slice(0, this.maxItems),
    };
  }

  private getKey(chainId: string, walletId: string): string {
    return `cardano.txHistory:${chainId}:${walletId}`;
  }
}
