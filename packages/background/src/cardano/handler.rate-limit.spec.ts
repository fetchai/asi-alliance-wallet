import { getHandler } from "./handler";
import {
  BuildSendAdaTxDraftMsg,
  GetCardanoTxHistoryMsg,
  GetCardanoSyncStatusMsg,
  LoadMoreCardanoTxHistoryMsg,
} from "./messages";
import type {
  CardanoSyncStatusResponse,
  CardanoTxHistoryStateResponse,
} from "./messages";
import { encodeCardanoUiError } from "@keplr-wallet/cardano";
import { Buffer } from "buffer/";

jest.mock("rxjs", () => ({
  firstValueFrom: jest.fn(),
}));

jest.mock("./blockfrost-limit-presentation", () => ({
  ...jest.requireActual("./blockfrost-limit-presentation"),
  withBlockfrostLimitPresentation: jest.fn(
    async (response: unknown) => response
  ),
}));

jest.mock("@keplr-wallet/cardano", () => {
  const actual = jest.requireActual("@keplr-wallet/cardano");
  return {
    ...actual,
    wasRateLimitedRecently: jest.fn(),
    getBlockfrostConfigSource: jest.fn(),
  };
});

const { wasRateLimitedRecently, getBlockfrostConfigSource } = jest.requireMock(
  "@keplr-wallet/cardano"
);
const { firstValueFrom } = jest.requireMock("rxjs");

const internalEnv = { isInternalMsg: true } as any;

function makeKeyRingService(ensureError?: unknown): any {
  return {
    ensureCardanoServiceReady: ensureError
      ? jest.fn().mockRejectedValue(ensureError)
      : jest.fn().mockResolvedValue(undefined),
    getKeyRing: () => ({
      getCurrentKeyStore: () => ({ meta: { __id__: "wallet-1" } }),
    }),
    getCurrentUnlockSessionId: jest.fn().mockReturnValue("session-1"),
    chainsService: {
      getSelectedChain: jest.fn().mockResolvedValue("cardano-preprod"),
    },
  };
}

function makeService(overrides: Record<string, unknown> = {}): any {
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
    runOwnedPolling: jest.fn(async ({ compute }: { compute: () => unknown }) =>
      compute()
    ),
    getHasOutgoingPendingSpend: jest.fn().mockResolvedValue(false),
    getKey: jest.fn().mockResolvedValue({ address: Buffer.from("addr1") }),
    buildSendAdaTxDraft: jest.fn(),
    ...overrides,
  };
}

describe("Cardano tx history handler — Blockfrost rate limit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (wasRateLimitedRecently as jest.Mock).mockReturnValue(false);
    (getBlockfrostConfigSource as jest.Mock).mockReturnValue("builtin");
    (firstValueFrom as jest.Mock).mockReset();
  });

  describe("GetCardanoTxHistoryMsg", () => {
    it("does not classify HTTP 429 burst throttle as blockfrost_rate_limited", async () => {
      const rateLimitError = { status: 429 };
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new GetCardanoTxHistoryMsg(10, "cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoTxHistoryStateResponse;

      expect(result.state).toBe("temporarily_unavailable");
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
    it("does not classify HTTP 429 burst throttle as blockfrost_rate_limited", async () => {
      const rateLimitError = { status: 429 };
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new LoadMoreCardanoTxHistoryMsg(10, "cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoTxHistoryStateResponse;

      expect(result.state).toBe("temporarily_unavailable");
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
    it("propagates HTTP 429 burst throttle instead of blockfrost_rate_limited", async () => {
      const rateLimitError = { status: 429 };
      const service = makeService();
      const keyRingService = makeKeyRingService(rateLimitError);
      const handler = getHandler(service, keyRingService);
      const msg = new GetCardanoSyncStatusMsg("cardano-preprod");

      await expect(handler(internalEnv, msg)).rejects.toEqual(rateLimitError);
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

    it("promotes syncing to blockfrost_rate_limited when wasRateLimitedRecently is true", async () => {
      (wasRateLimitedRecently as jest.Mock).mockReturnValue(true);
      const service = makeService({
        runOwnedPolling: jest.fn().mockResolvedValue({
          state: "syncing",
          isSettled: false,
          hasOutgoingPendingSpend: false,
        }),
      });
      const keyRingService = makeKeyRingService();
      const handler = getHandler(service, keyRingService);
      const msg = new GetCardanoSyncStatusMsg("cardano-preprod");

      const result = (await handler(
        internalEnv,
        msg
      )) as CardanoSyncStatusResponse;

      expect(result.state).toBe("blockfrost_rate_limited");
      expect(result.isSettled).toBe(false);
    });
  });

  describe("BuildSendAdaTxDraftMsg", () => {
    it("returns encoded Blockfrost limit error when wallet is unsettled and recently rate-limited", async () => {
      (wasRateLimitedRecently as jest.Mock).mockReturnValue(true);
      (firstValueFrom as jest.Mock)
        .mockRejectedValueOnce(new Error("Timeout has occurred"))
        .mockResolvedValueOnce(false);

      const service = makeService({
        getKey: jest.fn().mockResolvedValue({ address: Buffer.from("addr1") }),
        getWalletManager: jest.fn().mockReturnValue({
          hasWallet: () => true,
          syncStatus$: { pipe: jest.fn() },
        }),
      });
      const keyRingService = makeKeyRingService();
      const handler = getHandler(service, keyRingService);
      const msg = new BuildSendAdaTxDraftMsg(
        "addr1test",
        "1000000",
        undefined,
        "cardano-preprod"
      );

      await expect(handler(internalEnv, msg)).rejects.toThrow(
        encodeCardanoUiError(
          "blockfrost_builtin_limit",
          "Project rate limit exceeded"
        )
      );
      expect(service.buildSendAdaTxDraft).not.toHaveBeenCalled();
    });
  });
});
