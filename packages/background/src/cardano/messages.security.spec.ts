import {
  BuildSendAdaTxDraftMsg,
  DiscardSendAdaTxDraftMsg,
  EstimateSendAdaMsg,
  GetCardanoBalanceMsg,
  GetCardanoTxHistoryMsg,
  GetMaxSpendableAdaMsg,
  IsCardanoReadyMsg,
  SubmitSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftWithPasswordMsg,
  GetCardanoSyncStatusMsg,
  LoadMoreCardanoTxHistoryMsg,
} from "./messages";
import { getHandler } from "./handler";
import { of } from "rxjs";

describe("Cardano message security boundaries", () => {
  it("keeps EstimateSendAda internal-only", () => {
    const msg = new EstimateSendAdaMsg("addr_test1q...", "1000000");
    expect(msg.approveExternal()).toBe(false);
  });

  it("keeps internal-only Cardano financial messages closed to external", () => {
    expect(new GetCardanoBalanceMsg().approveExternal()).toBe(false);
    expect(new GetCardanoTxHistoryMsg(20).approveExternal()).toBe(false);
    expect(
      new GetMaxSpendableAdaMsg("cardano-mainnet", "addr_test1q...").approveExternal()
    ).toBe(false);
    expect(
      new BuildSendAdaTxDraftMsg("addr_test1q...", "1000000").approveExternal()
    ).toBe(false);
    expect(new SubmitSendAdaTxDraftMsg("draft-id").approveExternal()).toBe(false);
    expect(
      new SubmitSendAdaTxDraftWithPasswordMsg("draft-id", "password").approveExternal()
    ).toBe(false);
    expect(new DiscardSendAdaTxDraftMsg("draft-id").approveExternal()).toBe(false);
  });

  it("keeps IsCardanoReady internal-only", () => {
    expect(new IsCardanoReadyMsg().approveExternal()).toBe(false);
  });

  it("accepts large integer lovelace amounts in estimate/build validation", () => {
    const huge = "123456789012345678901234567890";
    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", huge).validateBasic()
    ).not.toThrow();
    expect(() =>
      new BuildSendAdaTxDraftMsg("addr_test1q...", huge).validateBasic()
    ).not.toThrow();
  });

  it("rejects non-integer amount formats in estimate/build validation", () => {
    const invalid = ["1.2", "1e6", " 10", "+10", "-10", "abc"];
    for (const amount of invalid) {
      expect(() =>
        new EstimateSendAdaMsg("addr_test1q...", amount).validateBasic()
      ).toThrow();
      expect(() =>
        new BuildSendAdaTxDraftMsg("addr_test1q...", amount).validateBasic()
      ).toThrow();
    }
  });

  it("allows amount=0 only when assets are present", () => {
    const assets = [{ assetId: "policy.asset", amount: "1" }];

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0", undefined, undefined, assets).validateBasic()
    ).not.toThrow();
    expect(() =>
      new BuildSendAdaTxDraftMsg("addr_test1q...", "0", undefined, undefined, assets).validateBasic()
    ).not.toThrow();

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0").validateBasic()
    ).toThrow("amount must be a positive number");
    expect(() =>
      new BuildSendAdaTxDraftMsg("addr_test1q...", "0").validateBasic()
    ).toThrow("amount must be a positive number");
  });
});

describe("Cardano handler security boundaries", () => {
  it("allows internal estimate requests", async () => {
    const service = {
      isReady: jest.fn(() => true),
      estimateSendAda: jest.fn(async () => ({
        fee: "1234",
        total: "11234",
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => undefined),
    };
    const handler = getHandler(service as any, keyRingService as any);

    const msg = new EstimateSendAdaMsg(
      "addr_test1q...",
      "10000",
      "memo",
      "cardano-mainnet"
    );

    const result = await handler({ isInternalMsg: true } as any, msg as any);

    expect(keyRingService.ensureCardanoServiceReady).toHaveBeenCalledWith(
      "cardano-mainnet"
    );
    expect(service.estimateSendAda).toHaveBeenCalledWith({
      to: "addr_test1q...",
      amount: "10000",
      memo: "memo",
      assets: undefined,
    });
    expect(result).toEqual({ fee: "1234", total: "11234" });
  });

  it("rejects external estimate requests", async () => {
    const service = {
      isReady: jest.fn(() => true),
      estimateSendAda: jest.fn(),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(),
    };
    const handler = getHandler(service as any, keyRingService as any);

    await expect(
      handler(
        { isInternalMsg: false, origin: "https://example.app" } as any,
        new EstimateSendAdaMsg("addr_test1q...", "10000", "memo", "cardano-mainnet") as any
      )
    ).rejects.toThrow("This message is only supported for internal requests");
  });

  it("rejects external IsCardanoReady requests", async () => {
    const service = {
      isReady: jest.fn(() => true),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(),
    };
    const handler = getHandler(service as any, keyRingService as any);

    await expect(
      handler(
        { isInternalMsg: false, origin: "https://example.app" } as any,
        new IsCardanoReadyMsg() as any
      )
    ).rejects.toThrow("This message is only supported for internal requests");
  });

  it("rejects external requests for financial cardano handlers", async () => {
    const service = {
      isReady: jest.fn(() => true),
      isInitialized: jest.fn(() => true),
      getBalance: jest.fn(async () => ({ available: "1", total: "1", rewards: "0" })),
      getWalletManager: jest.fn(() => ({ hasWallet: () => false })),
      getTxHistory: jest.fn(async () => ({ items: [], mightHaveMore: false })),
      loadMoreTxHistory: jest.fn(async () => ({ items: [], mightHaveMore: false })),
      getMaxSpendableAda: jest.fn(() => "0"),
      discardSendAdaTxDraft: jest.fn(),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => undefined),
      checkPassword: jest.fn(() => true),
      getCurrentUnlockSessionId: jest.fn(() => "sess"),
      getKeyRing: jest.fn(() => ({
        getCurrentKeyStore: () => ({ meta: { __id__: "wallet-id" } }),
      })),
      chainsService: { getSelectedChain: jest.fn(async () => "cardano-mainnet") },
      waitApprove: jest.fn(async () => ({ summaryHash: "hash" })),
    };
    const handler = getHandler(service as any, keyRingService as any);
    const externalEnv = { isInternalMsg: false, origin: "https://example.app" } as any;

    const msgs = [
      new GetCardanoBalanceMsg(),
      new EstimateSendAdaMsg("addr_test1q...", "10000", "memo", "cardano-mainnet"),
      new BuildSendAdaTxDraftMsg("addr_test1q...", "10000"),
      new SubmitSendAdaTxDraftMsg("draft-id"),
      new SubmitSendAdaTxDraftWithPasswordMsg("draft-id", "password"),
      new DiscardSendAdaTxDraftMsg("draft-id"),
      new GetCardanoTxHistoryMsg(10),
      new LoadMoreCardanoTxHistoryMsg(10),
      new GetMaxSpendableAdaMsg("cardano-mainnet", "addr_test1q..."),
      new GetCardanoSyncStatusMsg("cardano-mainnet"),
    ];

    for (const msg of msgs) {
      await expect(handler(externalEnv, msg as any)).rejects.toThrow(
        "This message is only supported for internal requests"
      );
    }
  });

  it("propagates degraded tx history semantics to response", async () => {
    const service = {
      isReady: jest.fn(() => true),
      isInitialized: jest.fn(() => true),
      getTxHistory: jest.fn(async () => ({
        items: [{ id: "tx1", direction: "unknown", amount: "0", isDegraded: true }],
        mightHaveMore: false,
        hasDegradedItems: true,
      })),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: of(true),
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => undefined),
      getKeyRing: jest.fn(() => ({
        getCurrentKeyStore: () => ({ meta: { __id__: "wallet-id" } }),
      })),
    };
    const handler = getHandler(service as any, keyRingService as any);

    const result = await handler(
      { isInternalMsg: true } as any,
      new GetCardanoTxHistoryMsg(10, "cardano-mainnet") as any
    );

    expect(result).toEqual({
      state: "ready_with_data",
      items: [{ id: "tx1", direction: "unknown", amount: "0", isDegraded: true }],
      mightHaveMore: false,
      hasDegradedItems: true,
      error: "tx_history_partial_data",
    });
  });
});
