import { computeDraftSummaryHash } from "./draft-summary-hash";
import { CardanoService } from "./service";
import { of } from "rxjs";

jest.mock("@keplr-wallet/cardano", () => {
  return {
    CardanoKeyRing: class {},
    CardanoWalletManager: class {},
    createObservableTransactionsByAddressesProvider: jest.fn(),
    createTxHistoryLoader: jest.fn(),
    parseAssetId: jest.fn((assetId: string) => ({
      policyId: assetId.slice(0, 56),
      assetName: assetId.slice(56),
    })),
    getTxInputsValueAndAddress: jest.fn(async () => {
      throw new Error("input_resolution_failed");
    }),
  };
});

describe("CardanoService draft summary digest", () => {
  const baseDraft = {
    to: "addr_test1qrecipient",
    amount: "1000000",
    memo: "memo",
    fee: "170000",
    total: "1170000",
    minAdaForTokens: "",
    assets: [
      { assetId: "policy1assetB", amount: "2" },
      { assetId: "policy1assetA", amount: "1" },
    ],
    networkId: "cardano-preview",
    selectedAccountAddress: "addr_test1qsender",
  };

  it("produces stable digest for same semantic payload", () => {
    const digestA = computeDraftSummaryHash(baseDraft);
    const digestB = computeDraftSummaryHash({
      ...baseDraft,
      assets: [...baseDraft.assets].reverse(),
    });

    expect(digestA).toEqual(digestB);
    expect(digestA).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes digest when critical fields change", () => {
    const digest = computeDraftSummaryHash(baseDraft);

    const changedTo = computeDraftSummaryHash({
      ...baseDraft,
      to: "addr_test1qchanged",
    });
    const changedAmount = computeDraftSummaryHash({
      ...baseDraft,
      amount: "2000000",
    });
    const changedFee = computeDraftSummaryHash({
      ...baseDraft,
      fee: "180000",
    });
    const changedSender = computeDraftSummaryHash({
      ...baseDraft,
      selectedAccountAddress: "addr_test1qother",
    });
    const changedNetwork = computeDraftSummaryHash({
      ...baseDraft,
      networkId: "cardano-mainnet",
    });

    expect(changedTo).not.toEqual(digest);
    expect(changedAmount).not.toEqual(digest);
    expect(changedFee).not.toEqual(digest);
    expect(changedSender).not.toEqual(digest);
    expect(changedNetwork).not.toEqual(digest);
  });
});

describe("CardanoService degraded history policy", () => {
  it("hides asset transfers when tx is degraded", async () => {
    const service = new CardanoService();
    const wallet = {
      addresses$: of([{ address: "addr_test1self" }]),
      assetInfo$: of(new Map()),
    } as any;

    const txs = [
      {
        id: "tx_degraded_1",
        body: {
          fee: { coins: "10" },
          outputs: [
            {
              address: "addr_test1self",
              value: {
                coins: "100",
                assets: {
                  "policy1.asset1": "5",
                },
              },
            },
          ],
          inputs: [{ txId: "missing_input_1", index: 0 }],
        },
      },
    ];

    const items = await (service as any).transformHydratedTxsToItems(
      txs,
      wallet,
      {},
      "cardano-preview"
    );

    expect(items).toHaveLength(1);
    expect(items[0].isDegraded).toBe(true);
    expect(items[0].direction).toBe("unknown");
    expect(items[0].amount).toBe("0");
    expect(items[0].assets).toBeUndefined();
  });
});
