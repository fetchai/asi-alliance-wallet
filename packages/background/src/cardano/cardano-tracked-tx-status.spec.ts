import { CardanoService } from "./service";

function seedLocalPending(
  service: CardanoService,
  chainId: string,
  txId: string
): void {
  const perChain = new Map([
    [
      txId,
      {
        createdAt: Date.now(),
        amount: "1000000",
      },
    ],
  ]);
  (
    service as unknown as {
      locallyPendingSentTxs: Map<string, Map<string, unknown>>;
    }
  ).locallyPendingSentTxs.set(chainId, perChain);
}

describe("CardanoService.getTrackedTxStatus", () => {
  it("returns pending when local pending exists but getTxHistory throws", async () => {
    const service = new CardanoService();
    const chainId = "cardano-preview";
    const txId = "deadbeef";
    seedLocalPending(service, chainId, txId);

    const getTxHistorySpy = jest
      .spyOn(service, "getTxHistory")
      .mockRejectedValue(new Error("syncing: wallet_sync_in_progress"));

    const res = await service.getTrackedTxStatus({
      txId,
      chainId,
      walletId: "wallet-1",
    });

    expect(getTxHistorySpy).toHaveBeenCalled();
    expect(res.txStatus).toBe("pending");
    expect(res.state).toBe("syncing");

    jest.restoreAllMocks();
  });

  it("returns confirmed when local pending exists and merged history contains confirmed tx", async () => {
    const service = new CardanoService();
    const chainId = "cardano-preview";
    const txId = "AbCdEf";
    seedLocalPending(service, chainId, txId);

    jest.spyOn(service, "getTxHistory").mockResolvedValue({
      items: [
        {
          id: "abcdef",
          status: "confirmed",
          direction: "sent",
          amount: "1000",
        },
      ],
      mightHaveMore: false,
    });

    const res = await service.getTrackedTxStatus({
      txId,
      chainId,
      walletId: "wallet-1",
    });

    expect(res.txStatus).toBe("confirmed");
    expect(res.state).toBe("ready_with_data");

    jest.restoreAllMocks();
  });

  it("returns pending with syncing state when getTxHistory throws and there is no local pending", async () => {
    const service = new CardanoService();
    const chainId = "cardano-preview";
    const txId = "deadbeef";

    jest
      .spyOn(service, "getTxHistory")
      .mockRejectedValue(new Error("syncing: wallet_sync_in_progress"));

    const res = await service.getTrackedTxStatus({
      txId,
      chainId,
      walletId: "wallet-1",
    });

    expect(res.txStatus).toBe("pending");
    expect(res.state).toBe("syncing");

    jest.restoreAllMocks();
  });

  it("returns confirmed when merged history contains normalized tx id", async () => {
    const service = new CardanoService();
    const chainId = "cardano-preview";
    const txId = "AbCdEf";

    jest.spyOn(service, "getTxHistory").mockResolvedValue({
      items: [
        {
          id: "abcdef",
          status: "confirmed",
          direction: "sent",
          amount: "1000",
        },
      ],
      mightHaveMore: false,
    });

    const res = await service.getTrackedTxStatus({
      txId,
      chainId,
      walletId: "wallet-1",
    });

    expect(res.txStatus).toBe("confirmed");
    expect(res.state).toBe("ready_with_data");

    jest.restoreAllMocks();
  });

  it("re-runs bounded deep scan after deep-scan cooldown expires", async () => {
    const service = new CardanoService();
    const chainId = "cardano-preview";
    const txId = "beefdead";
    const walletId = "wallet-deep";

    const emptyPage = {
      items: [],
      mightHaveMore: true,
    };

    jest.spyOn(service, "getTxHistory").mockResolvedValue(emptyPage);
    const loadMoreSpy = jest
      .spyOn(service, "loadMoreTxHistory")
      .mockResolvedValue(emptyPage);

    await service.getTrackedTxStatus({
      txId,
      chainId,
      walletId,
    });

    expect(loadMoreSpy).toHaveBeenCalledTimes(5);

    await service.getTrackedTxStatus({
      txId,
      chainId,
      walletId,
    });

    expect(loadMoreSpy).toHaveBeenCalledTimes(5);

    const deepKey = `${walletId}:${chainId}:${txId.toLowerCase()}`;
    const cooldownMap = (
      service as unknown as {
        trackedTxDeepScanCooldownUntil: Map<string, number>;
      }
    ).trackedTxDeepScanCooldownUntil;
    expect(cooldownMap.has(deepKey)).toBe(true);
    cooldownMap.set(deepKey, Date.now() - 1);

    await service.getTrackedTxStatus({
      txId,
      chainId,
      walletId,
    });

    expect(loadMoreSpy).toHaveBeenCalledTimes(10);

    jest.restoreAllMocks();
  });
});
