import { computeDraftSummaryHash } from "./draft-summary-hash";
import { CardanoService } from "./service";
import { of } from "rxjs";
import * as cardanoUtils from "@keplr-wallet/cardano";

jest.mock("@keplr-wallet/cardano", () => {
  const sendMinimum = jest.requireActual(
    "../../../cardano/src/utils/send-minimum-violation"
  );
  const cardanoConstants = jest.requireActual(
    "../../../cardano/src/constants/cardano-send-conflict"
  );
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
    mapCardanoMinimumViolation: jest.fn(
      ({
        minimumOutputLovelace,
        coinMissingLovelace,
      }: {
        minimumOutputLovelace: string;
        coinMissingLovelace?: string;
      }) =>
        /^\d+$/.test(minimumOutputLovelace) && BigInt(minimumOutputLovelace) > BigInt(0)
          ? {
              classification: "minimum_violation" as const,
              minimumOutputLovelace,
              coinMissingLovelace:
                coinMissingLovelace && /^\d+$/.test(coinMissingLovelace)
                  ? coinMissingLovelace
                  : undefined,
            }
          : null
    ),
    formatLegacyMinimumViolationLovelaceError: jest.fn(
      ({ violation }: { violation: { minimumOutputLovelace: string } }) =>
        `Amount too small: minimum output value is ${violation.minimumOutputLovelace} lovelace (protocol minimum for this output). Please send at least ${violation.minimumOutputLovelace} lovelace.`
    ),
    cardanoMalformedMinimumPayloadError:
      sendMinimum.cardanoMalformedMinimumPayloadError,
    CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD:
      sendMinimum.CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD,
    CARDANO_SEND_CONFLICT_PENDING_MESSAGE:
      cardanoConstants.CARDANO_SEND_CONFLICT_PENDING_MESSAGE,
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

describe("CardanoService buildSendAdaTxDraft minimum_violation contract", () => {
  const baseParams = {
    to: "addr_test1qrecipient",
    amount: "0",
    memo: "",
    chainId: "cardano-preview",
    assets: undefined,
    walletId: "wallet-id",
    selectedAccountAddress: "addr_test1qsender",
    selectedKeyStoreId: "key-store-id",
    networkId: "cardano-preview",
    unlockSessionId: "session-id",
    source: "wallet-ui",
  };

  it("returns structured minimum_violation with no draft side effects", async () => {
    const service = new CardanoService();
    const walletManager = {
      buildSendAdaTxDraftOutcome: jest.fn(async () => ({
        kind: "minimum_violation",
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "969999",
      })),
    } as any;
    jest.spyOn(service as any, "getWalletManager").mockReturnValue(walletManager);
    const payloadSpy = jest.spyOn(service as any, "computeDraftPayloadHash");

    const res = await service.buildSendAdaTxDraft(baseParams);

    expect(res).toEqual({
      kind: "minimum_violation",
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });
    expect(payloadSpy).not.toHaveBeenCalled();
    expect((service as any).sendAdaTxDrafts.size).toBe(0);
  });
});

describe("CardanoService estimateSendAda minimum_violation parity", () => {
  const estimateParams = {
    to: "addr_test1qrecipient",
    amount: "1",
    memo: "",
    assets: undefined,
  };

  const mountServiceWithWalletManager = (walletManager: any) => {
    const service = new CardanoService();
    (service as any).keyRing = {
      isTransactionReady: () => true,
      getWalletManager: () => walletManager,
    };
    return service;
  };

  beforeEach(() => {
    (cardanoUtils.mapCardanoMinimumViolation as jest.Mock).mockClear();
    (cardanoUtils.formatLegacyMinimumViolationLovelaceError as jest.Mock).mockClear();
  });

  it("uses draft outcome source and throws legacy-compatible lovelace error for estimate", async () => {
    const walletManager = {
      buildSendAdaTxDraftOutcome: jest.fn(async () => ({
        kind: "minimum_violation",
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "969999",
      })),
    };
    const service = mountServiceWithWalletManager(walletManager);

    await expect(service.estimateSendAda(estimateParams)).rejects.toThrow(
      "minimum output value is 970000 lovelace"
    );
    expect(walletManager.buildSendAdaTxDraftOutcome).toHaveBeenCalledWith({
      to: estimateParams.to,
      amount: estimateParams.amount,
      memo: estimateParams.memo,
      assets: undefined,
    });
    expect((service as any).sendAdaTxDrafts.size).toBe(0);
    expect(cardanoUtils.mapCardanoMinimumViolation).toHaveBeenCalledWith({
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });
  });

  it("matches shared semantic source values between estimate and draft services", async () => {
    const walletManager = {
      buildSendAdaTxDraftOutcome: jest.fn(async () => ({
        kind: "minimum_violation",
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "969999",
      })),
    };
    const service = mountServiceWithWalletManager(walletManager);
    jest.spyOn(service as any, "getWalletManager").mockReturnValue(walletManager);

    const draftRes = await service.buildSendAdaTxDraft({
      to: "addr_test1qrecipient",
      amount: "1",
      memo: "",
      chainId: "cardano-preview",
      assets: undefined,
      walletId: "wallet-id",
      selectedAccountAddress: "addr_test1qsender",
      selectedKeyStoreId: "key-store-id",
      networkId: "cardano-preview",
      unlockSessionId: "session-id",
      source: "wallet-ui",
    });
    expect(draftRes.kind).toBe("minimum_violation");

    await expect(service.estimateSendAda(estimateParams)).rejects.toThrow();
    expect(cardanoUtils.mapCardanoMinimumViolation).toHaveBeenCalledWith({
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });
    expect(cardanoUtils.formatLegacyMinimumViolationLovelaceError).toHaveBeenCalledWith({
      violation: {
        classification: "minimum_violation",
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "969999",
      },
    });
    if (draftRes.kind === "minimum_violation") {
      expect(draftRes.minimumOutputLovelace).toBe("970000");
      expect(draftRes.coinMissingLovelace).toBe("969999");
    }
  });

  it("falls back to existing generic estimate error on malformed minimum data", async () => {
    const walletManager = {
      buildSendAdaTxDraftOutcome: jest.fn(async () => ({
        kind: "minimum_violation",
        minimumOutputLovelace: "abc",
        coinMissingLovelace: "1",
      })),
    };
    const service = mountServiceWithWalletManager(walletManager);
    let err: Error | undefined;
    try {
      await service.estimateSendAda(estimateParams);
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeDefined();
    expect(err!.message).toBe("Failed to estimate Cardano transaction");
    expect((err as Error & { cause?: Error }).cause?.message).toBe(
      cardanoUtils.CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD
    );
  });

  it("keeps token/min-ADA path for ADA=0 with assets and returns draft totals", async () => {
    const walletManager = {
      buildSendAdaTxDraftOutcome: jest.fn(async () => ({
        kind: "draft",
        tx: { id: "tx" },
        fee: "170000",
        total: "1170000",
        minAdaForTokens: "970000",
      })),
    };
    const service = mountServiceWithWalletManager(walletManager);
    jest.spyOn(service as any, "toSdkAssetMap").mockReturnValue(
      new Map([["policy.asset", "1"]])
    );

    const res = await service.estimateSendAda({
      to: "addr_test1qrecipient",
      amount: "0",
      memo: "",
      assets: [{ assetId: "policy.asset", amount: "1" }],
    });

    expect(res).toEqual({
      fee: "170000",
      total: "1170000",
      minAdaForTokens: "970000",
    });
    expect(walletManager.buildSendAdaTxDraftOutcome).toHaveBeenCalledTimes(1);
  });

  it("keeps token path when tiny ADA component is present with assets", async () => {
    const walletManager = {
      buildSendAdaTxDraftOutcome: jest.fn(async () => ({
        kind: "draft",
        tx: { id: "tx-tiny-ada" },
        fee: "170000",
        total: "1170001",
        minAdaForTokens: "970000",
      })),
    };
    const service = mountServiceWithWalletManager(walletManager);
    jest.spyOn(service as any, "toSdkAssetMap").mockReturnValue(
      new Map([["policy.asset", "1"]])
    );

    const res = await service.estimateSendAda({
      to: "addr_test1qrecipient",
      amount: "1",
      memo: "",
      assets: [{ assetId: "policy.asset", amount: "1" }],
    });

    expect(res).toEqual({
      fee: "170000",
      total: "1170001",
      minAdaForTokens: "970000",
    });
    expect(walletManager.buildSendAdaTxDraftOutcome).toHaveBeenCalledWith({
      to: "addr_test1qrecipient",
      amount: "1",
      memo: "",
      assets: new Map([["policy.asset", "1"]]),
    });
  });
});
