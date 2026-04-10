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
import {
  CARDANO_ENSURE_MESSAGE,
  formatNetworkContextInvalidForCardano,
  formatProviderUnavailableError,
} from "./ensure-errors";
// eslint-disable-next-line import/no-extraneous-dependencies -- rxjs is not a direct dependency of this package
import { BehaviorSubject, of } from "rxjs";

jest.mock("@keplr-wallet/cardano", () => ({
  encodeCardanoUiError: (code: string, message: string) =>
    `cardano_ui_error:${code}:${message}`,
  parseCardanoUiError: (message: string) => ({ message }),
}));

describe("Cardano message security boundaries", () => {
  it("keeps EstimateSendAda internal-only", () => {
    const msg = new EstimateSendAdaMsg("addr_test1q...", "1000000");
    expect(msg.approveExternal()).toBe(false);
  });

  it("keeps internal-only Cardano financial messages closed to external", () => {
    expect(new GetCardanoBalanceMsg().approveExternal()).toBe(false);
    expect(new GetCardanoTxHistoryMsg(20).approveExternal()).toBe(false);
    expect(
      new GetMaxSpendableAdaMsg(
        "cardano-mainnet",
        "addr_test1q..."
      ).approveExternal()
    ).toBe(false);
    expect(
      new BuildSendAdaTxDraftMsg("addr_test1q...", "1000000").approveExternal()
    ).toBe(false);
    expect(new SubmitSendAdaTxDraftMsg("draft-id").approveExternal()).toBe(
      false
    );
    expect(
      new SubmitSendAdaTxDraftWithPasswordMsg(
        "draft-id",
        "password"
      ).approveExternal()
    ).toBe(false);
    expect(new DiscardSendAdaTxDraftMsg("draft-id").approveExternal()).toBe(
      false
    );
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

  it("keeps ADA-only amount=0 blocked by default, but allows controlled 0 for minimum-check and for asset sends", () => {
    const policy = "a".repeat(56);
    const assetId = `${policy}4142`;
    const assets = [{ assetId, amount: "1" }];

    expect(() =>
      new EstimateSendAdaMsg(
        "addr_test1q...",
        "0",
        undefined,
        undefined,
        assets
      ).validateBasic()
    ).not.toThrow();
    expect(() =>
      new BuildSendAdaTxDraftMsg(
        "addr_test1q...",
        "0",
        undefined,
        undefined,
        assets
      ).validateBasic()
    ).not.toThrow();

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0").validateBasic()
    ).toThrow("amount must be a positive number");
    expect(() =>
      new BuildSendAdaTxDraftMsg("addr_test1q...", "0").validateBasic()
    ).toThrow("amount must be a positive number");
    expect(() =>
      new BuildSendAdaTxDraftMsg(
        "addr_test1q...",
        "0",
        undefined,
        undefined,
        undefined,
        true
      ).validateBasic()
    ).not.toThrow();
  });

  it("keeps 1 lovelace boundary parity between estimate and draft validation", () => {
    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "1").validateBasic()
    ).not.toThrow();
    expect(() =>
      new BuildSendAdaTxDraftMsg("addr_test1q...", "1").validateBasic()
    ).not.toThrow();
  });

  it("keeps sub-lovelace minimum-check scope draft-only (estimate has no special zero flag)", () => {
    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0").validateBasic()
    ).toThrow("amount must be a positive number");
    expect(() =>
      new BuildSendAdaTxDraftMsg(
        "addr_test1q...",
        "0",
        undefined,
        undefined,
        undefined,
        true
      ).validateBasic()
    ).not.toThrow();
  });

  it("validates Cardano assets array (assetId, non-negative asset.amount, no duplicates)", () => {
    const policy = "a".repeat(56);
    const assetId1 = `${policy}4142`;
    const assetIdUpper = `${policy.toUpperCase()}4142`;
    const assetIdOddAssetName = `${policy}1`;
    const assetIdTooLongAssetName = `${policy}${"f".repeat(66)}`;

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: "", amount: "1" },
      ]).validateBasic()
    ).toThrow();

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: "a".repeat(55), amount: "1" },
      ]).validateBasic()
    ).toThrow();

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: "g".repeat(56) + "4142", amount: "1" },
      ]).validateBasic()
    ).toThrow();

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: assetIdOddAssetName, amount: "1" },
      ]).validateBasic()
    ).toThrow("assetName must be even-length hex");

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: assetIdTooLongAssetName, amount: "1" },
      ]).validateBasic()
    ).toThrow("assetName is too long");

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: policy, amount: "1" },
      ]).validateBasic()
    ).not.toThrow();

    expect(() =>
      new BuildSendAdaTxDraftMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: assetId1, amount: "-1" },
      ]).validateBasic()
    ).toThrow();

    expect(() =>
      new BuildSendAdaTxDraftMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: assetId1, amount: "0" },
      ]).validateBasic()
    ).toThrow();

    expect(() =>
      new EstimateSendAdaMsg("addr_test1q...", "0", undefined, undefined, [
        { assetId: assetId1, amount: "1" },
        { assetId: assetIdUpper, amount: "2" },
      ]).validateBasic()
    ).toThrow("duplicate assetId");
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
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: of(true),
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

    const result = await handler(
      { isInternalMsg: true, requestInteraction: jest.fn() },
      msg
    );

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

  it("estimate handler waits for settled wallet before estimating", async () => {
    const sync$ = new BehaviorSubject<boolean>(false);
    const service = {
      isReady: jest.fn(() => true),
      estimateSendAda: jest.fn(async () => ({ fee: "123", total: "124" })),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: sync$,
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => undefined),
    };
    const handler = getHandler(service as any, keyRingService as any);

    const pending = handler(
      { isInternalMsg: true, requestInteraction: jest.fn() },
      new EstimateSendAdaMsg("addr_test1q...", "1", undefined, "cardano-mainnet")
    );
    expect(service.estimateSendAda).not.toHaveBeenCalled();

    sync$.next(true);
    const res = await pending;
    expect(res).toEqual({ fee: "123", total: "124" });
    expect(service.getWalletManager).toHaveBeenCalled();
    expect(service.estimateSendAda).toHaveBeenCalledWith({
      to: "addr_test1q...",
      amount: "1",
      memo: undefined,
      assets: undefined,
    });
  });

  it("keeps 1 lovelace estimate boundary on minimum violation semantics", async () => {
    const service = {
      isReady: jest.fn(() => true),
      estimateSendAda: jest.fn(async () => {
        throw new Error(
          "Amount too small: minimum output value is 970000 lovelace (protocol minimum for this output). Please send at least 970000 lovelace."
        );
      }),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: of(true),
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => undefined),
    };
    const handler = getHandler(service as any, keyRingService as any);

    let thrownMessage = "";
    try {
      await handler(
        { isInternalMsg: true, requestInteraction: jest.fn() },
        new EstimateSendAdaMsg("addr_test1q...", "1", undefined, "cardano-mainnet")
      );
    } catch (error: any) {
      thrownMessage = String(error?.message ?? "");
    }
    expect(thrownMessage).toContain("minimum output value is 970000 lovelace");
    expect(thrownMessage).not.toContain("amount must be a positive number");
  });

  it(
    "estimate handler throws syncing error when wallet is explicitly unsettled",
    async () => {
      const sync$ = of(false);
    const service = {
      isReady: jest.fn(() => true),
      estimateSendAda: jest.fn(async () => ({ fee: "1", total: "2" })),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: sync$,
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => undefined),
    };
    const handler = getHandler(service as any, keyRingService as any);

    const pending = handler(
      { isInternalMsg: true, requestInteraction: jest.fn() },
      new EstimateSendAdaMsg("addr_test1q...", "1", undefined, "cardano-mainnet")
    );
      await expect(pending).rejects.toThrow("syncing: wallet_sync_in_progress");
      expect(service.estimateSendAda).not.toHaveBeenCalled();
    }
  );

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
        { isInternalMsg: false, requestInteraction: jest.fn() },
        new EstimateSendAdaMsg(
          "addr_test1q...",
          "10000",
          "memo",
          "cardano-mainnet"
        )
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
        { isInternalMsg: false, requestInteraction: jest.fn() },
        new IsCardanoReadyMsg()
      )
    ).rejects.toThrow("This message is only supported for internal requests");
  });

  it("rejects external requests for financial cardano handlers", async () => {
    const service = {
      isReady: jest.fn(() => true),
      isInitialized: jest.fn(() => true),
      getBalance: jest.fn(async () => ({
        available: "1",
        total: "1",
        rewards: "0",
      })),
      getWalletManager: jest.fn(() => ({ hasWallet: () => false })),
      getTxHistory: jest.fn(async () => ({ items: [], mightHaveMore: false })),
      loadMoreTxHistory: jest.fn(async () => ({
        items: [],
        mightHaveMore: false,
      })),
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
      chainsService: {
        getSelectedChain: jest.fn(async () => "cardano-mainnet"),
      },
      waitApprove: jest.fn(async () => ({ summaryHash: "hash" })),
    };
    const handler = getHandler(service as any, keyRingService as any);
    const externalEnv = { isInternalMsg: false, requestInteraction: jest.fn() };

    const msgs = [
      new GetCardanoBalanceMsg(),
      new EstimateSendAdaMsg(
        "addr_test1q...",
        "10000",
        "memo",
        "cardano-mainnet"
      ),
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
      await expect(handler(externalEnv, msg)).rejects.toThrow(
        "This message is only supported for internal requests"
      );
    }
  });

  it("GetCardanoSyncStatusMsg returns structured response when ensureCardanoServiceReady throws", async () => {
    const service = {
      isReady: jest.fn(() => true),
      getRuntimeState: jest.fn(() => "ok"),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: of(true),
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => {
        throw new Error(CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY);
      }),
    };
    const handler = getHandler(service as any, keyRingService as any);

    const result = await handler(
      { isInternalMsg: true, requestInteraction: jest.fn() },
      new GetCardanoSyncStatusMsg("cardano-mainnet")
    );

    expect(result).toEqual({
      state: "temporarily_unavailable",
      isSettled: false,
      error: CARDANO_ENSURE_MESSAGE.KEYRING_NOT_READY,
    });
    expect(service.getWalletManager).not.toHaveBeenCalled();
  });

  it("GetCardanoSyncStatusMsg propagates unknown ensureCardanoServiceReady errors", async () => {
    const service = {
      isReady: jest.fn(() => true),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: of(true),
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => {
        throw new Error("unexpected ensure failure");
      }),
    };
    const handler = getHandler(service as any, keyRingService as any);

    await expect(
      handler(
        { isInternalMsg: true, requestInteraction: jest.fn() },
        new GetCardanoSyncStatusMsg("cardano-mainnet")
      )
    ).rejects.toThrow("unexpected ensure failure");
    expect(service.getWalletManager).not.toHaveBeenCalled();
  });

  it("GetCardanoSyncStatusMsg returns structured provider_error when ensure throws provider_error protocol message", async () => {
    const msgText = formatProviderUnavailableError("cardano-mainnet");
    const service = {
      isReady: jest.fn(() => true),
      getRuntimeState: jest.fn(() => "ok"),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: of(true),
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => {
        throw new Error(msgText);
      }),
    };
    const handler = getHandler(service as any, keyRingService as any);

    const result = await handler(
      { isInternalMsg: true, requestInteraction: jest.fn() },
      new GetCardanoSyncStatusMsg("cardano-mainnet")
    );

    expect(result).toEqual({
      state: "provider_error",
      isSettled: false,
      error: msgText,
    });
    expect(service.getWalletManager).not.toHaveBeenCalled();
  });

  it("GetCardanoSyncStatusMsg propagates network_context_missing from ensure (not normalized)", async () => {
    const service = {
      isReady: jest.fn(() => true),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: of(true),
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => {
        throw new Error(CARDANO_ENSURE_MESSAGE.NETWORK_CONTEXT_MISSING);
      }),
    };
    const handler = getHandler(service as any, keyRingService as any);

    await expect(
      handler(
        { isInternalMsg: true, requestInteraction: jest.fn() },
        new GetCardanoSyncStatusMsg("cardano-mainnet")
      )
    ).rejects.toThrow(CARDANO_ENSURE_MESSAGE.NETWORK_CONTEXT_MISSING);
    expect(service.getWalletManager).not.toHaveBeenCalled();
  });

  it("GetCardanoSyncStatusMsg propagates network_context_invalid_for_cardano from ensure (not normalized)", async () => {
    const msgText = formatNetworkContextInvalidForCardano("cardano-mainnet");
    const service = {
      isReady: jest.fn(() => true),
      getWalletManager: jest.fn(() => ({
        hasWallet: () => true,
        syncStatus$: of(true),
      })),
    };
    const keyRingService = {
      ensureCardanoServiceReady: jest.fn(async () => {
        throw new Error(msgText);
      }),
    };
    const handler = getHandler(service as any, keyRingService as any);

    await expect(
      handler(
        { isInternalMsg: true, requestInteraction: jest.fn() },
        new GetCardanoSyncStatusMsg("cardano-mainnet")
      )
    ).rejects.toThrow(msgText);
    expect(service.getWalletManager).not.toHaveBeenCalled();
  });

  it("propagates degraded tx history semantics to response", async () => {
    const service = {
      isReady: jest.fn(() => true),
      isInitialized: jest.fn(() => true),
      getTxHistory: jest.fn(async () => ({
        items: [
          { id: "tx1", direction: "unknown", amount: "0", isDegraded: true },
        ],
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
      { isInternalMsg: true, requestInteraction: jest.fn() },
      new GetCardanoTxHistoryMsg(10, "cardano-mainnet")
    );

    expect(result).toEqual({
      state: "ready_with_data",
      items: [
        { id: "tx1", direction: "unknown", amount: "0", isDegraded: true },
      ],
      mightHaveMore: false,
      hasDegradedItems: true,
      error: "tx_history_partial_data",
    });
  });
});
