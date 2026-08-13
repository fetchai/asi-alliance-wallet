import {
  CardanoTxHistoryStore,
  CARDANO_TX_HISTORY_STORE_VERSION,
} from "./tx-history-store";

describe("CardanoTxHistoryStore", () => {
  it("get uses versioned key — legacy v1 snapshot path is never queried", async () => {
    const kv = {
      get: jest.fn(async (key: string) => {
        if (key === "cardano.txHistory:cardano-preview:w1") {
          return {
            items: [{ id: "stale", timestamp: 1 }],
            mightHaveMore: false,
          };
        }
        return undefined;
      }),
      set: jest.fn(async () => {}),
    };
    const store = new CardanoTxHistoryStore(kv as any);
    const res = await store.get("cardano-preview", "w1");
    expect(kv.get).toHaveBeenCalledTimes(1);
    expect(kv.get).toHaveBeenCalledWith(
      `cardano.txHistory.v${CARDANO_TX_HISTORY_STORE_VERSION}:cardano-preview:w1`
    );
    expect(kv.get).not.toHaveBeenCalledWith(
      "cardano.txHistory:cardano-preview:w1"
    );
    expect(res).toBeUndefined();
  });

  it("set writes to the same versioned key", async () => {
    const snapshot = { items: [], mightHaveMore: true };
    const kv = {
      get: jest.fn(),
      set: jest.fn(async () => {}),
    };
    const store = new CardanoTxHistoryStore(kv as any);
    await store.set("cardano-preview", "w1", snapshot);
    expect(kv.set).toHaveBeenCalledWith(
      `cardano.txHistory.v${CARDANO_TX_HISTORY_STORE_VERSION}:cardano-preview:w1`,
      snapshot
    );
  });
});
