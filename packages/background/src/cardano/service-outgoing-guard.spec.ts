import { CARDANO_SEND_CONFLICT_PENDING_MESSAGE } from "@keplr-wallet/cardano";
import { of } from "rxjs";
import { CardanoService } from "./service";

const LOCAL_OUTGOING_GUARD_GRACE_MS = 15_000;

describe("CardanoService outgoing spend guard", () => {
  const baseBuildParams = {
    to: "addr_test1qrecipient",
    amount: "1000000",
    memo: "",
    chainId: "cardano-preview",
    walletId: "w",
    selectedAccountAddress: "addr_test1qsender",
    selectedKeyStoreId: "k",
    networkId: "cardano-preview",
    unlockSessionId: "s",
    source: "wallet-ui" as const,
  };

  const emptySdkKeyRing = () => ({
    getWalletManager: () => ({
      hasWallet: () => true,
      getWallet: () => ({
        transactions: {
          outgoing: {
            inFlight$: of([]),
            signed$: of([]),
          },
        },
      }),
    }),
  });

  it("throws stable conflict when a fresh local pending entry exists and SDK is empty", async () => {
    const service = new CardanoService();
    const pendingMap = new Map([
      ["txhash", { createdAt: Date.now(), amount: "1" }],
    ]);
    (service as any).locallyPendingSentTxs.set("cardano-preview", pendingMap);
    (service as any).keyRing = emptySdkKeyRing();
    const walletManager = {
      buildSendAdaTxDraftOutcome: jest.fn(),
    };
    jest.spyOn(service as any, "getWalletManager").mockReturnValue(walletManager);

    await expect(service.buildSendAdaTxDraft(baseBuildParams)).rejects.toThrow(
      CARDANO_SEND_CONFLICT_PENDING_MESSAGE
    );
    expect(walletManager.buildSendAdaTxDraftOutcome).not.toHaveBeenCalled();
  });

  it("does not block when local pending is older than grace and SDK is empty; map unchanged", async () => {
    const service = new CardanoService();
    const staleCreatedAt = Date.now() - LOCAL_OUTGOING_GUARD_GRACE_MS - 2000;
    const pendingMap = new Map([
      ["txhash", { createdAt: staleCreatedAt, amount: "1" }],
    ]);
    (service as any).locallyPendingSentTxs.set("cardano-preview", pendingMap);
    (service as any).keyRing = emptySdkKeyRing();

    expect(
      await (service as any).hasConflictingOutgoingSpend("cardano-preview")
    ).toBe(false);
    expect(await service.getHasOutgoingPendingSpend("cardano-preview")).toBe(
      false
    );
    const after = (service as any).locallyPendingSentTxs.get("cardano-preview");
    expect(after?.get("txhash")?.createdAt).toBe(staleCreatedAt);
  });

  it("getHasOutgoingPendingSpend is true when signed$ is non-empty", async () => {
    const service = new CardanoService();
    (service as any).keyRing = {
      getWalletManager: () => ({
        hasWallet: () => true,
        getWallet: () => ({
          transactions: {
            outgoing: {
              inFlight$: of([]),
              signed$: of([{ tx: {} }]),
            },
          },
        }),
      }),
    };

    expect(await service.getHasOutgoingPendingSpend(undefined)).toBe(true);
  });

  it("getHasOutgoingPendingSpend is true when inFlight$ is non-empty", async () => {
    const service = new CardanoService();
    (service as any).keyRing = {
      getWalletManager: () => ({
        hasWallet: () => true,
        getWallet: () => ({
          transactions: {
            outgoing: {
              inFlight$: of([{ tx: {} }]),
              signed$: of([]),
            },
          },
        }),
      }),
    };

    expect(await service.getHasOutgoingPendingSpend(undefined)).toBe(true);
  });

  it("after submitTx failure removes draft-pending, draft, and leaves no blocking local guard", async () => {
    const service = new CardanoService();
    const draftId = "cad_fail_cleanup";
    const submitTx = jest
      .fn()
      .mockRejectedValue(new Error("submit failed"));
    const sign = jest.fn().mockResolvedValue({ cbor: "00" });

    const draftBase = {
      createdAt: Date.now(),
      chainId: "cardano-preview",
      walletId: "w",
      selectedAccountAddress: "addr_test1qsender",
      selectedKeyStoreId: "k",
      networkId: "cardano-preview",
      unlockSessionId: "s",
      source: "wallet-ui",
      to: "addr_test1qrecipient",
      amount: "1000000",
      memo: "",
      assets: undefined as undefined,
      fee: "170000",
      total: "1170000",
      minAdaForTokens: "",
      tx: { cbor: "00", sign },
    };

    const payloadHash = (service as any).computeDraftPayloadHash(draftBase);
    const draft = { ...draftBase, payloadHash };
    (service as any).sendAdaTxDrafts.set(draftId, draft);
    const summaryHash = (service as any).getDraftSummaryHash(draft);

    jest.spyOn(service as any, "getWalletManager").mockReturnValue({
      hasWallet: () => true,
      submitTx,
      getWallet: () => ({
        transactions: {
          outgoing: {
            inFlight$: of([]),
            signed$: of([]),
          },
        },
      }),
    });

    const submitParams = {
      draftId,
      chainId: "cardano-preview",
      walletId: "w",
      selectedAccountAddress: "addr_test1qsender",
      selectedKeyStoreId: "k",
      networkId: "cardano-preview",
      unlockSessionId: "s",
      approvedSummaryHash: summaryHash,
      approvedPayloadHash: payloadHash,
    };

    const draftPendingId = `draft-pending:${draftId}`;

    await expect(service.submitSendAdaTxDraft(submitParams)).rejects.toThrow(
      "submit failed"
    );

    expect((service as any).sendAdaTxDrafts.has(draftId)).toBe(false);
    const perChain = (service as any).locallyPendingSentTxs.get(
      "cardano-preview"
    );
    expect(perChain?.has(draftPendingId)).toBeFalsy();
    expect(submitTx).toHaveBeenCalledTimes(1);
    expect(
      await (service as any).hasConflictingOutgoingSpend("cardano-preview")
    ).toBe(false);
  });

  it("after sign failure removes draft-pending, draft, and leaves no blocking local guard", async () => {
    const service = new CardanoService();
    const draftId = "cad_fail_sign_cleanup";
    const submitTx = jest.fn();
    const sign = jest.fn().mockRejectedValue(new Error("sign failed"));

    const draftBase = {
      createdAt: Date.now(),
      chainId: "cardano-preview",
      walletId: "w",
      selectedAccountAddress: "addr_test1qsender",
      selectedKeyStoreId: "k",
      networkId: "cardano-preview",
      unlockSessionId: "s",
      source: "wallet-ui",
      to: "addr_test1qrecipient",
      amount: "1000000",
      memo: "",
      assets: undefined as undefined,
      fee: "170000",
      total: "1170000",
      minAdaForTokens: "",
      tx: { cbor: "00", sign },
    };

    const payloadHash = (service as any).computeDraftPayloadHash(draftBase);
    const draft = { ...draftBase, payloadHash };
    (service as any).sendAdaTxDrafts.set(draftId, draft);
    const summaryHash = (service as any).getDraftSummaryHash(draft);

    jest.spyOn(service as any, "getWalletManager").mockReturnValue({
      hasWallet: () => true,
      submitTx,
      getWallet: () => ({
        transactions: {
          outgoing: {
            inFlight$: of([]),
            signed$: of([]),
          },
        },
      }),
    });

    const submitParams = {
      draftId,
      chainId: "cardano-preview",
      walletId: "w",
      selectedAccountAddress: "addr_test1qsender",
      selectedKeyStoreId: "k",
      networkId: "cardano-preview",
      unlockSessionId: "s",
      approvedSummaryHash: summaryHash,
      approvedPayloadHash: payloadHash,
    };

    const draftPendingId = `draft-pending:${draftId}`;

    await expect(service.submitSendAdaTxDraft(submitParams)).rejects.toThrow(
      "sign failed"
    );

    expect((service as any).sendAdaTxDrafts.has(draftId)).toBe(false);
    const perChain = (service as any).locallyPendingSentTxs.get(
      "cardano-preview"
    );
    expect(perChain?.has(draftPendingId)).toBeFalsy();
    expect(submitTx).not.toHaveBeenCalled();
    expect(
      await (service as any).hasConflictingOutgoingSpend("cardano-preview")
    ).toBe(false);
  });

  it("parallel submitSendAdaTxDraft for same draft calls submitTx exactly once", async () => {
    const service = new CardanoService();
    const draftId = "cad_test_double_submit";
    const submitTx = jest.fn().mockResolvedValue("txhash1");
    const sign = jest.fn().mockResolvedValue({ cbor: "00" });

    const draftBase = {
      createdAt: Date.now(),
      chainId: "cardano-preview",
      walletId: "w",
      selectedAccountAddress: "addr_test1qsender",
      selectedKeyStoreId: "k",
      networkId: "cardano-preview",
      unlockSessionId: "s",
      source: "wallet-ui",
      to: "addr_test1qrecipient",
      amount: "1000000",
      memo: "",
      assets: undefined as undefined,
      fee: "170000",
      total: "1170000",
      minAdaForTokens: "",
      tx: { cbor: "00", sign },
    };

    const payloadHash = (service as any).computeDraftPayloadHash(draftBase);
    const draft = { ...draftBase, payloadHash };
    (service as any).sendAdaTxDrafts.set(draftId, draft);

    const summaryHash = (service as any).getDraftSummaryHash(draft);

    jest.spyOn(service as any, "getWalletManager").mockReturnValue({
      hasWallet: () => true,
      submitTx,
      getWallet: () => ({
        transactions: {
          outgoing: {
            inFlight$: of([]),
            signed$: of([]),
          },
        },
      }),
    });

    const submitParams = {
      draftId,
      chainId: "cardano-preview",
      walletId: "w",
      selectedAccountAddress: "addr_test1qsender",
      selectedKeyStoreId: "k",
      networkId: "cardano-preview",
      unlockSessionId: "s",
      approvedSummaryHash: summaryHash,
      approvedPayloadHash: payloadHash,
    };

    const results = await Promise.allSettled([
      service.submitSendAdaTxDraft(submitParams),
      service.submitSendAdaTxDraft(submitParams),
    ]);

    expect(submitTx).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(results.filter((r) => r.status === "rejected").length).toBe(1);
  });
});
