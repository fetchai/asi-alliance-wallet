import { getHandler } from "./handler";
import {
  GetCardanoTxHistoryMsg,
  GetCardanoSyncStatusMsg,
  LoadMoreCardanoTxHistoryMsg,
} from "./messages";
import type {
  CardanoSyncStatusResponse,
  CardanoTxHistoryStateResponse,
} from "./messages";

jest.mock("./blockfrost-limit-presentation", () => ({
  ...jest.requireActual("./blockfrost-limit-presentation"),
  withBlockfrostLimitPresentation: jest.fn(
    async (response: unknown) => response
  ),
  encodeCardanoSendError: jest.fn(),
}));

const internalEnv = { isInternalMsg: true } as any;

function makeKeyRingService(ensureError?: unknown): any {
  return {
    ensureCardanoServiceReady: ensureError
      ? jest.fn().mockRejectedValue(ensureError)
      : jest.fn().mockResolvedValue(undefined),
    getKeyRing: () => ({
      getCurrentKeyStore: () => ({ meta: { __id__: "wallet-1" } }),
    }),
  };
}

function makeService(): any {
  return {
    isInitialized: jest.fn().mockReturnValue(true),
    isReady: jest.fn().mockReturnValue(true),
    getRuntimeState: jest.fn().mockReturnValue("ready"),
    getWalletManager: jest.fn().mockReturnValue(null),
    getBlockfrostCredentialsStore: jest.fn().mockReturnValue(undefined),
    getTxHistory: jest
      .fn()
      .mockResolvedValue({ items: [], mightHaveMore: false }),
    loadMoreTxHistory: jest
      .fn()
      .mockResolvedValue({ items: [], mightHaveMore: false }),
  };
}

describe("Cardano tx history handler — Blockfrost rate limit", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("GetCardanoTxHistoryMsg", () => {
    it("returns state blockfrost_rate_limited and does not throw when ensureCardanoServiceReady throws HTTP 429", async () => {
      const rateLimitError = { status: 429 };
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new GetCardanoTxHistoryMsg(10, "cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoTxHistoryStateResponse;

      expect(result.state).toBe("blockfrost_rate_limited");
      expect(result.items).toEqual([]);
    });

    it("returns state blockfrost_rate_limited when ensureCardanoServiceReady throws a rate-limit message error", async () => {
      const rateLimitError = new Error("quota exceeded");
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new GetCardanoTxHistoryMsg(10, "cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoTxHistoryStateResponse;

      expect(result.state).toBe("blockfrost_rate_limited");
    });

    it("does not classify a non-rate-limit error as blockfrost_rate_limited (regression)", async () => {
      // ensureCardanoServiceReady throws a generic, non-rate-limit error
      const genericError = new Error(
        "temporarily_unavailable: wallet_not_ready"
      );
      const service = makeService();
      const keyRingService = makeKeyRingService(genericError);
      const handler = getHandler(service, keyRingService);
      const msg = new GetCardanoTxHistoryMsg(10, "cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoTxHistoryStateResponse;

      expect(result.state).not.toBe("blockfrost_rate_limited");
      // The error text contains "temporarily_unavailable" which maps to that state
      expect(["temporarily_unavailable", "syncing"]).toContain(result.state);
    });
  });

  describe("LoadMoreCardanoTxHistoryMsg", () => {
    it("returns state blockfrost_rate_limited and does not throw when ensureCardanoServiceReady throws HTTP 429", async () => {
      const rateLimitError = { status: 429 };
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new LoadMoreCardanoTxHistoryMsg(10, "cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoTxHistoryStateResponse;

      expect(result.state).toBe("blockfrost_rate_limited");
      expect(result.items).toEqual([]);
    });

    it("returns state blockfrost_rate_limited when ensureCardanoServiceReady throws HTTP 402", async () => {
      const rateLimitError = { status: 402 };
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new LoadMoreCardanoTxHistoryMsg(10, "cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoTxHistoryStateResponse;

      expect(result.state).toBe("blockfrost_rate_limited");
    });
  });

  describe("GetCardanoSyncStatusMsg", () => {
    it("returns state blockfrost_rate_limited when ensureCardanoServiceReady throws HTTP 429", async () => {
      const rateLimitError = { status: 429 };
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new GetCardanoSyncStatusMsg("cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoSyncStatusResponse;

      expect(result.state).toBe("blockfrost_rate_limited");
      expect(result.isSettled).toBe(false);
    });

    it("returns state blockfrost_rate_limited when ensureCardanoServiceReady throws quota message", async () => {
      const rateLimitError = new Error("quota exceeded");
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new GetCardanoSyncStatusMsg("cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoSyncStatusResponse;

      expect(result.state).toBe("blockfrost_rate_limited");
    });
  });
});
