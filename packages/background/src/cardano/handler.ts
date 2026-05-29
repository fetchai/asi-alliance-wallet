import { Env, Handler, InternalHandler, Message } from "@keplr-wallet/router";
import {
  GetCardanoBalanceMsg,
  IsCardanoReadyMsg,
  EstimateSendAdaMsg,
  BuildSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftWithPasswordMsg,
  DiscardSendAdaTxDraftMsg,
  GetCardanoSyncStatusMsg,
  GetCardanoTxHistoryMsg,
  GetCardanoTrackedTxStatusMsg,
  GetCardanoTelemetryRequestCountsByTypeMsg,
  GetCardanoTelemetrySnapshotMsg,
  CaptureCardanoTelemetryBaselineMsg,
  GetCardanoTelemetryBaselinesMsg,
  LoadMoreCardanoTxHistoryMsg,
  GetMaxSpendableAdaMsg,
  GetBlockfrostCredentialsMsg,
  SetBlockfrostCredentialsMsg,
  ClearBlockfrostCredentialsMsg,
  CardanoServiceState,
  type CardanoSyncStatusResponse,
  type CardanoTxHistoryStateResponse,
  type CardanoTrackedTxServiceState,
} from "./messages";
import { CardanoService } from "./service";
import { KeyRingService } from "../keyring/service";
import { Buffer } from "buffer/";
import { formatErrorForLog } from "../logging/safe-error";
import {
  encodeCardanoUiError,
  isBlockfrostRateLimitError,
  isBlockfrostRateLimitMessage,
  CARDANO_UI_ERROR_PREFIX,
} from "@keplr-wallet/cardano";
import {
  classifyEnsureCardanoServiceReadyError,
  stateFromErrorMessage,
} from "./ensure-errors";
import {
  applyClearBlockfrostCredentials,
  applySetBlockfrostCredentials,
  getBlockfrostCredentialsResponse,
} from "./blockfrost-credentials-ops";
import { afterBlockfrostCredentialsChanged } from "./blockfrost-credentials-post-save";
import {
  encodeCardanoSendError,
  withBlockfrostLimitPresentation,
} from "./blockfrost-limit-presentation";

const stateFromError = (error: unknown): CardanoServiceState => {
  if (isBlockfrostRateLimitError(error)) {
    return "blockfrost_rate_limited";
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (isBlockfrostRateLimitMessage(message)) {
    return "blockfrost_rate_limited";
  }
  return stateFromErrorMessage(message);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "unknown_error");

const getSubmitErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const maybeObj = error as
    | {
        message?: unknown;
        details?: unknown;
        response?: { data?: { message?: unknown } };
      }
    | undefined;
  const responseMessage = maybeObj?.response?.data?.message;
  if (
    typeof responseMessage === "string" &&
    responseMessage.trim().length > 0
  ) {
    return responseMessage;
  }

  const details = maybeObj?.details;
  if (typeof details === "string" && details.trim().length > 0) {
    return details;
  }

  const message = maybeObj?.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  return "Cardano transaction submission failed";
};

const toCardanoUiSubmitError = (rawMessage: string): string => {
  if (rawMessage.startsWith(CARDANO_UI_ERROR_PREFIX)) {
    return rawMessage;
  }

  const normalized = rawMessage.toLowerCase();
  if (
    normalized.includes("invalid password") ||
    normalized.includes("fail to decrypt")
  ) {
    return encodeCardanoUiError("invalid_password", rawMessage);
  }
  if (normalized.includes("password is required")) {
    return encodeCardanoUiError("password_required", rawMessage);
  }
  if (normalized.includes("please unlock wallet first")) {
    return encodeCardanoUiError("wallet_locked", rawMessage);
  }
  if (
    normalized.includes("wallet is syncing") ||
    normalized.includes("syncing:")
  ) {
    return encodeCardanoUiError("wallet_syncing", rawMessage);
  }
  return rawMessage;
};

export const getHandler: (
  service: CardanoService,
  keyRingService: KeyRingService
) => Handler = (service: CardanoService, keyRingService: KeyRingService) => {
  return (env: Env, msg: Message<unknown>) => {
    // Use msg.type() instead of constructor comparison because parseMessage uses Object.setPrototypeOf
    // which may not preserve exact constructor reference
    const msgType = msg.type();

    switch (msgType) {
      case BuildSendAdaTxDraftMsg.type():
        return handleBuildSendAdaTxDraftMsg(service, keyRingService)(
          env,
          msg as BuildSendAdaTxDraftMsg
        );
      case SubmitSendAdaTxDraftMsg.type():
        return handleSubmitSendAdaTxDraftMsg(service, keyRingService)(
          env,
          msg as SubmitSendAdaTxDraftMsg
        );
      case SubmitSendAdaTxDraftWithPasswordMsg.type():
        return handleSubmitSendAdaTxDraftWithPasswordMsg(
          service,
          keyRingService
        )(env, msg as SubmitSendAdaTxDraftWithPasswordMsg);
      case DiscardSendAdaTxDraftMsg.type():
        return handleDiscardSendAdaTxDraftMsg(service)(
          env,
          msg as DiscardSendAdaTxDraftMsg
        );
      case GetCardanoBalanceMsg.type():
        return handleGetCardanoBalanceMsg(service)(
          env,
          msg as GetCardanoBalanceMsg
        );
      case IsCardanoReadyMsg.type():
        return handleIsCardanoReadyMsg(service)(env, msg as IsCardanoReadyMsg);
      case EstimateSendAdaMsg.type():
        return handleEstimateSendAdaMsg(service, keyRingService)(
          env,
          msg as EstimateSendAdaMsg
        );
      case GetCardanoSyncStatusMsg.type():
        return handleGetCardanoSyncStatusMsg(service, keyRingService)(
          env,
          msg as GetCardanoSyncStatusMsg
        );
      case GetCardanoTxHistoryMsg.type():
        return handleGetCardanoTxHistoryMsg(service, keyRingService)(
          env,
          msg as GetCardanoTxHistoryMsg
        );
      case GetCardanoTrackedTxStatusMsg.type():
        return handleGetCardanoTrackedTxStatusMsg(service, keyRingService)(
          env,
          msg as GetCardanoTrackedTxStatusMsg
        );
      case GetCardanoTelemetryRequestCountsByTypeMsg.type():
        return handleGetCardanoTelemetryRequestCountsByTypeMsg(service)(
          env,
          msg as GetCardanoTelemetryRequestCountsByTypeMsg
        );
      case GetCardanoTelemetrySnapshotMsg.type():
        return handleGetCardanoTelemetrySnapshotMsg(service)(
          env,
          msg as GetCardanoTelemetrySnapshotMsg
        );
      case CaptureCardanoTelemetryBaselineMsg.type():
        return handleCaptureCardanoTelemetryBaselineMsg(service)(
          env,
          msg as CaptureCardanoTelemetryBaselineMsg
        );
      case GetCardanoTelemetryBaselinesMsg.type():
        return handleGetCardanoTelemetryBaselinesMsg(service)(
          env,
          msg as GetCardanoTelemetryBaselinesMsg
        );
      case LoadMoreCardanoTxHistoryMsg.type():
        return handleLoadMoreCardanoTxHistoryMsg(service, keyRingService)(
          env,
          msg as LoadMoreCardanoTxHistoryMsg
        );
      case GetMaxSpendableAdaMsg.type():
        return handleGetMaxSpendableAdaMsg(service, keyRingService)(
          env,
          msg as GetMaxSpendableAdaMsg
        );
      case GetBlockfrostCredentialsMsg.type():
        return handleGetBlockfrostCredentialsMsg(service, keyRingService)(
          env,
          msg as GetBlockfrostCredentialsMsg
        );
      case SetBlockfrostCredentialsMsg.type():
        return handleSetBlockfrostCredentialsMsg(service, keyRingService)(
          env,
          msg as SetBlockfrostCredentialsMsg
        );
      case ClearBlockfrostCredentialsMsg.type():
        return handleClearBlockfrostCredentialsMsg(service, keyRingService)(
          env,
          msg as ClearBlockfrostCredentialsMsg
        );
      default:
        console.error(
          "[Cardano Handler] Unknown message type",
          formatErrorForLog(new Error("Unknown message type"), { msgType })
        );
        throw new Error(`Unknown msg type: ${msgType}`);
    }
  };
};

/**
 * Handler for getting Cardano balance
 */
const handleGetCardanoBalanceMsg: (
  service: CardanoService
) => InternalHandler<GetCardanoBalanceMsg> = (service) => {
  return async (env, _msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    if (!service.isReady()) {
      const runtimeState = service.getRuntimeState();
      return {
        state:
          runtimeState === "provider_unavailable"
            ? "provider_error"
            : "temporarily_unavailable",
        error:
          runtimeState === "provider_unavailable"
            ? "provider_unavailable"
            : "cardano_not_ready",
      };
    }
    try {
      const balanceRaw = await service.getBalance();
      const available = (
        balanceRaw?.utxo?.available?.coins ?? BigInt(0)
      ).toString();
      const total = (balanceRaw?.utxo?.total?.coins ?? BigInt(0)).toString();
      const rewards = (balanceRaw?.rewards ?? BigInt(0)).toString();
      const hasAnyFunds = available !== "0" || total !== "0" || rewards !== "0";
      return {
        state: hasAnyFunds ? "ready_with_data" : "empty_valid",
        balance: {
          available,
          total,
          rewards,
        },
      };
    } catch (error) {
      return {
        state: stateFromError(error),
        error: errorMessage(error),
      };
    }
  };
};

/**
 * Handler for checking Cardano service readiness
 */
const handleIsCardanoReadyMsg: (
  service: CardanoService
) => InternalHandler<IsCardanoReadyMsg> = (service) => {
  return async (env, _msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    return service.isReady();
  };
};

/**
 * Handler for estimating Cardano transaction fee
 */
const handleEstimateSendAdaMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<EstimateSendAdaMsg> = (service, keyRingService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    // If chainId is provided, ensure service is ready for that network
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }

    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }
    await waitForCardanoWalletSettled(service);

    try {
      return await service.estimateSendAda({
        to: msg.to,
        amount: msg.amount,
        memo: msg.memo,
        assets: msg.assets,
      });
    } catch (error) {
      throw error;
    }
  };
};

const waitForCardanoWalletSettled = async (service: CardanoService) => {
  const walletManager = service.getWalletManager();
  if (!walletManager || !walletManager.hasWallet()) {
    throw new Error("temporarily_unavailable: wallet_not_ready");
  }
  // eslint-disable-next-line import/no-extraneous-dependencies -- rxjs is not a direct dependency of this package
  const { firstValueFrom } = await import("rxjs");
  // eslint-disable-next-line import/no-extraneous-dependencies -- rxjs is not a direct dependency of this package
  const { filter, take, timeout } = await import("rxjs/operators");

  try {
    await firstValueFrom(
      walletManager.syncStatus$.pipe(
        filter((isSettled: boolean) => isSettled === true),
        take(1),
        timeout(5000)
      )
    );
  } catch {
    const isSettled = await firstValueFrom(walletManager.syncStatus$).catch(
      () => false
    );
    if (!isSettled) {
      throw new Error("syncing: wallet_sync_in_progress");
    }
  }
};

const readCardanoWalletSettled = async (
  service: CardanoService
): Promise<boolean> => {
  const walletManager = service.getWalletManager();
  if (!walletManager || !walletManager.hasWallet()) {
    throw new Error("temporarily_unavailable: wallet_not_ready");
  }
  // eslint-disable-next-line import/no-extraneous-dependencies -- rxjs is not a direct dependency of this package
  const { firstValueFrom } = await import("rxjs");
  return (await firstValueFrom(walletManager.syncStatus$).catch(
    () => false
  )) as boolean;
};

const getCardanoDraftContext = async (
  service: CardanoService,
  keyRingService: KeyRingService,
  chainId?: string
): Promise<{
  walletId: string;
  selectedAccountAddress: string;
  selectedKeyStoreId: string;
  networkId: string;
  unlockSessionId: string;
}> => {
  const selectedKeyStoreId =
    keyRingService.getKeyRing().getCurrentKeyStore()?.meta?.["__id__"] || "";
  const key = await service.getKey(chainId);
  const selectedAccountAddress = Buffer.from(key.address).toString("utf8");

  let networkId = chainId || "";
  if (!networkId) {
    try {
      networkId = await keyRingService.chainsService.getSelectedChain();
    } catch {
      networkId = "cardano-unknown";
    }
  }

  return {
    walletId: selectedKeyStoreId,
    selectedAccountAddress,
    selectedKeyStoreId,
    networkId,
    unlockSessionId:
      keyRingService.getCurrentUnlockSessionId() ||
      service.getCurrentRuntimeSessionId(),
  };
};

const handleBuildSendAdaTxDraftMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<BuildSendAdaTxDraftMsg> = (service, keyRingService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }
    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }
    await waitForCardanoWalletSettled(service);
    const context = await getCardanoDraftContext(
      service,
      keyRingService,
      msg.chainId
    );
    try {
      const result = await service.buildSendAdaTxDraft({
        to: msg.to,
        amount: msg.amount,
        memo: msg.memo,
        chainId: msg.chainId,
        assets: msg.assets,
        walletId: context.walletId,
        selectedAccountAddress: context.selectedAccountAddress,
        selectedKeyStoreId: context.selectedKeyStoreId,
        networkId: context.networkId,
        unlockSessionId: context.unlockSessionId,
        source: "wallet-ui",
      });

      return await withBlockfrostLimitPresentation(
        result,
        service,
        keyRingService,
        msg.chainId
      );
    } catch (error) {
      const rawMessage = errorMessage(error);
      const encoded = await encodeCardanoSendError(
        error,
        rawMessage,
        service,
        keyRingService,
        msg.chainId
      );
      throw new Error(toCardanoUiSubmitError(encoded));
    }
  };
};

const handleSubmitSendAdaTxDraftMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<SubmitSendAdaTxDraftMsg> = (service, keyRingService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }
    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }
    await waitForCardanoWalletSettled(service);
    const context = await getCardanoDraftContext(
      service,
      keyRingService,
      msg.chainId
    );
    const approvalData = service.getSendAdaTxDraftApprovalData({
      draftId: msg.draftId,
      chainId: msg.chainId,
      walletId: context.walletId,
      selectedAccountAddress: context.selectedAccountAddress,
      selectedKeyStoreId: context.selectedKeyStoreId,
      networkId: context.networkId,
      unlockSessionId: context.unlockSessionId,
    });
    const approvedSummaryHash = approvalData.summaryHash;
    const approvedPayloadHash = approvalData.payloadHash;

    try {
      return await service.submitSendAdaTxDraft({
        draftId: msg.draftId,
        chainId: msg.chainId,
        walletId: context.walletId,
        selectedAccountAddress: context.selectedAccountAddress,
        selectedKeyStoreId: context.selectedKeyStoreId,
        networkId: context.networkId,
        unlockSessionId: context.unlockSessionId,
        approvedSummaryHash,
        approvedPayloadHash,
      });
    } catch (error) {
      const rawMessage = getSubmitErrorMessage(error);
      const encoded = await encodeCardanoSendError(
        error,
        rawMessage,
        service,
        keyRingService,
        msg.chainId
      );
      throw new Error(toCardanoUiSubmitError(encoded));
    }
  };
};

const handleSubmitSendAdaTxDraftWithPasswordMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<SubmitSendAdaTxDraftWithPasswordMsg> = (
  service,
  keyRingService
) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    if (!keyRingService.checkPassword(msg.password)) {
      throw new Error(
        encodeCardanoUiError("invalid_password", "Invalid password")
      );
    }
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }
    if (!service.isReady()) {
      throw new Error(
        encodeCardanoUiError(
          "wallet_locked",
          "Cardano service not ready. Please unlock wallet first."
        )
      );
    }
    await waitForCardanoWalletSettled(service);
    const context = await getCardanoDraftContext(
      service,
      keyRingService,
      msg.chainId
    );
    const approvalData = service.getSendAdaTxDraftApprovalData({
      draftId: msg.draftId,
      chainId: msg.chainId,
      walletId: context.walletId,
      selectedAccountAddress: context.selectedAccountAddress,
      selectedKeyStoreId: context.selectedKeyStoreId,
      networkId: context.networkId,
      unlockSessionId: context.unlockSessionId,
    });
    const approvedSummaryHash = approvalData.summaryHash;
    const approvedPayloadHash = approvalData.payloadHash;

    try {
      return await service.submitSendAdaTxDraft({
        draftId: msg.draftId,
        chainId: msg.chainId,
        walletId: context.walletId,
        selectedAccountAddress: context.selectedAccountAddress,
        selectedKeyStoreId: context.selectedKeyStoreId,
        networkId: context.networkId,
        unlockSessionId: context.unlockSessionId,
        approvedSummaryHash,
        approvedPayloadHash,
      });
    } catch (error) {
      const rawMessage = getSubmitErrorMessage(error);
      const encoded = await encodeCardanoSendError(
        error,
        rawMessage,
        service,
        keyRingService,
        msg.chainId
      );
      throw new Error(toCardanoUiSubmitError(encoded));
    }
  };
};

const handleDiscardSendAdaTxDraftMsg: (
  service: CardanoService
) => InternalHandler<DiscardSendAdaTxDraftMsg> = (service) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    service.discardSendAdaTxDraft(msg.draftId);
  };
};

/** Handler for getting Cardano wallet sync status (for UI sync status check). */
const handleGetCardanoSyncStatusMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<GetCardanoSyncStatusMsg> = (service, keyRingService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    const attachLimit = (response: CardanoSyncStatusResponse) =>
      withBlockfrostLimitPresentation(
        response,
        service,
        keyRingService,
        msg.chainId
      );

    // If chainId is provided, ensure service is ready for that network
    if (msg.chainId) {
      try {
        await keyRingService.ensureCardanoServiceReady(msg.chainId);
      } catch (error) {
        const classified = classifyEnsureCardanoServiceReadyError(error);
        const rateLimited = stateFromError(error) === "blockfrost_rate_limited";

        if (classified === null && !rateLimited) {
          throw error;
        }

        return attachLimit({
          state: rateLimited ? "blockfrost_rate_limited" : classified!,
          isSettled: false,
          hasOutgoingPendingSpend: false,
          error: errorMessage(error),
        });
      }
    }

    if (!service.isReady()) {
      const runtimeState = service.getRuntimeState();
      return attachLimit({
        state:
          runtimeState === "provider_unavailable"
            ? "provider_error"
            : "temporarily_unavailable",
        isSettled: false,
        hasOutgoingPendingSpend: false,
        error:
          runtimeState === "provider_unavailable"
            ? "provider_unavailable"
            : "cardano_not_ready",
      });
    }

    const visibility =
      msg.pollingVisibility === "background" ? "background" : "foreground";

    const polled = await service.runOwnedPolling({
      scope: "sync-status",
      key: msg.chainId ?? "default",
      chainId: msg.chainId,
      visibility,
      compute: async () => {
        try {
          const walletManager = service.getWalletManager();
          if (!walletManager || !walletManager.hasWallet()) {
            const runtimeState = service.getRuntimeState();
            return {
              state:
                runtimeState === "provider_unavailable"
                  ? "provider_error"
                  : "temporarily_unavailable",
              isSettled: false,
              hasOutgoingPendingSpend: false,
              error:
                runtimeState === "provider_unavailable"
                  ? "provider_unavailable"
                  : "wallet_not_ready",
            };
          }

          // eslint-disable-next-line import/no-extraneous-dependencies -- rxjs is not a direct dependency of this package
          const { firstValueFrom } = await import("rxjs");
          const isSettled = (await firstValueFrom(
            walletManager.syncStatus$
          ).catch(() => false)) as boolean;
          const hasOutgoingPendingSpend =
            await service.getHasOutgoingPendingSpend(msg.chainId);
          return {
            state: isSettled ? "ready_with_data" : "syncing",
            isSettled,
            hasOutgoingPendingSpend,
          };
        } catch (error) {
          return {
            state: stateFromError(error),
            isSettled: false,
            hasOutgoingPendingSpend: false,
            error: errorMessage(error),
          };
        }
      },
    });

    return attachLimit(polled as CardanoSyncStatusResponse);
  };
};

/** Handler for getting Cardano tx history (internal-only). */
const handleGetCardanoTxHistoryMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<GetCardanoTxHistoryMsg> = (service, keyRingService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    const attachLimit = (response: CardanoTxHistoryStateResponse) =>
      withBlockfrostLimitPresentation(
        response,
        service,
        keyRingService,
        msg.chainId
      );

    if (msg.chainId) {
      try {
        await keyRingService.ensureCardanoServiceReady(msg.chainId);
      } catch (error) {
        return attachLimit({
          state: stateFromError(error),
          items: [],
          mightHaveMore: false,
          hasDegradedItems: false,
          error: errorMessage(error),
        });
      }
    }

    if (!service.isInitialized()) {
      return attachLimit({
        state: "temporarily_unavailable",
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error: "cardano_not_initialized",
      });
    }

    if (!service.isReady()) {
      const runtimeState = service.getRuntimeState();
      return attachLimit({
        state:
          runtimeState === "provider_unavailable"
            ? "provider_error"
            : "temporarily_unavailable",
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error:
          runtimeState === "provider_unavailable"
            ? "provider_unavailable"
            : "cardano_not_ready",
      });
    }

    const walletId =
      keyRingService.getKeyRing().getCurrentKeyStore()?.meta?.["__id__"] || "";

    try {
      const isSettled = await readCardanoWalletSettled(service);
      if (!isSettled) {
        return attachLimit({
          state: "syncing",
          items: [],
          mightHaveMore: false,
          hasDegradedItems: false,
          error: "wallet_sync_in_progress",
        });
      }
      const res = await service.getTxHistory({
        pageSize: msg.pageSize,
        chainId: msg.chainId,
        walletId,
      });
      return attachLimit({
        state: res.items.length > 0 ? "ready_with_data" : "empty_valid",
        items: res.items,
        mightHaveMore: res.mightHaveMore,
        hasDegradedItems: Boolean(res.hasDegradedItems),
        error: res.hasDegradedItems ? "tx_history_partial_data" : undefined,
      });
    } catch (error) {
      return attachLimit({
        state: stateFromError(error),
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error: errorMessage(error),
      });
    }
  };
};

const assertNever = (value: never): never => {
  throw new Error(`Unhandled Cardano service state: ${value}`);
};

const toTrackedTxServiceState = (
  s: CardanoServiceState
): CardanoTrackedTxServiceState => {
  switch (s) {
    case "empty_valid":
      return "ready_with_data";
    case "blockfrost_rate_limited":
      return "provider_error";
    case "ready_with_data":
    case "syncing":
    case "temporarily_unavailable":
    case "provider_error":
      return s;
    default:
      return assertNever(s);
  }
};

/** Handler for tracked tx send status (internal-only). Does not wait for wallet settled. */
const handleGetCardanoTrackedTxStatusMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<GetCardanoTrackedTxStatusMsg> = (
  service,
  keyRingService
) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    if (msg.chainId) {
      try {
        await keyRingService.ensureCardanoServiceReady(msg.chainId);
      } catch (error) {
        const classified = classifyEnsureCardanoServiceReadyError(error);
        if (classified === null) {
          throw error;
        }
        return {
          state: toTrackedTxServiceState(classified),
          txStatus: "pending",
          error: errorMessage(error),
        };
      }
    }

    if (!service.isInitialized()) {
      return {
        state: "temporarily_unavailable",
        txStatus: "pending",
        error: "cardano_not_initialized",
      };
    }

    if (!service.isReady()) {
      const runtimeState = service.getRuntimeState();
      return {
        state:
          runtimeState === "provider_unavailable"
            ? "provider_error"
            : "temporarily_unavailable",
        txStatus: "pending",
        error:
          runtimeState === "provider_unavailable"
            ? "provider_unavailable"
            : "cardano_not_ready",
      };
    }

    const walletId =
      keyRingService.getKeyRing().getCurrentKeyStore()?.meta?.["__id__"] || "";

    if (!walletId || !msg.chainId) {
      return {
        state: "temporarily_unavailable",
        txStatus: "pending",
        error: "missing_wallet_or_chain_context",
      };
    }

    const visibility =
      msg.pollingVisibility === "background" ? "background" : "foreground";

    return service.runOwnedPolling({
      scope: "tracked-tx-status",
      key: `${walletId}:${msg.chainId}:${msg.txId}`,
      chainId: msg.chainId,
      visibility,
      compute: async () => {
        try {
          return await service.getTrackedTxStatus({
            txId: msg.txId,
            chainId: msg.chainId,
            walletId,
          });
        } catch (error) {
          return {
            state: toTrackedTxServiceState(stateFromError(error)),
            txStatus: "pending",
            error: errorMessage(error),
          };
        }
      },
    });
  };
};

const handleGetCardanoTelemetryRequestCountsByTypeMsg: (
  service: CardanoService
) => InternalHandler<GetCardanoTelemetryRequestCountsByTypeMsg> = (service) => {
  return async (env, _msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    return service.getTelemetryRequestCountsByType();
  };
};

const handleGetCardanoTelemetrySnapshotMsg: (
  service: CardanoService
) => InternalHandler<GetCardanoTelemetrySnapshotMsg> = (service) => {
  return async (env, _msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    return service.getTelemetrySnapshot();
  };
};

const handleCaptureCardanoTelemetryBaselineMsg: (
  service: CardanoService
) => InternalHandler<CaptureCardanoTelemetryBaselineMsg> = (service) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    return service.captureTelemetryBaseline(msg.label);
  };
};

const handleGetCardanoTelemetryBaselinesMsg: (
  service: CardanoService
) => InternalHandler<GetCardanoTelemetryBaselinesMsg> = (service) => {
  return async (env, _msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }
    return service.getTelemetryBaselines();
  };
};

/** Handler for loading more Cardano tx history (internal-only). */
const handleLoadMoreCardanoTxHistoryMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<LoadMoreCardanoTxHistoryMsg> = (
  service,
  keyRingService
) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    const attachLimit = (response: CardanoTxHistoryStateResponse) =>
      withBlockfrostLimitPresentation(
        response,
        service,
        keyRingService,
        msg.chainId
      );

    if (msg.chainId) {
      try {
        await keyRingService.ensureCardanoServiceReady(msg.chainId);
      } catch (error) {
        return attachLimit({
          state: stateFromError(error),
          items: [],
          mightHaveMore: false,
          hasDegradedItems: false,
          error: errorMessage(error),
        });
      }
    }

    if (!service.isInitialized()) {
      return attachLimit({
        state: "temporarily_unavailable",
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error: "cardano_not_initialized",
      });
    }

    // When wallet is unlocked but walletManager is not ready for this network
    // (e.g. after network switch or no Blockfrost for this chain), return empty history
    // instead of misleading "unlock wallet" so UI shows "No Activity Yet".
    if (!service.isReady()) {
      const runtimeState = service.getRuntimeState();
      return attachLimit({
        state:
          runtimeState === "provider_unavailable"
            ? "provider_error"
            : "temporarily_unavailable",
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error:
          runtimeState === "provider_unavailable"
            ? "provider_unavailable"
            : "cardano_not_ready",
      });
    }

    const walletId =
      keyRingService.getKeyRing().getCurrentKeyStore()?.meta?.["__id__"] || "";

    try {
      const isSettled = await readCardanoWalletSettled(service);
      if (!isSettled) {
        return attachLimit({
          state: "syncing",
          items: [],
          mightHaveMore: false,
          hasDegradedItems: false,
          error: "wallet_sync_in_progress",
        });
      }
      const res = await service.loadMoreTxHistory({
        pageSize: msg.pageSize,
        chainId: msg.chainId,
        walletId,
      });
      return attachLimit({
        state: res.items.length > 0 ? "ready_with_data" : "empty_valid",
        items: res.items,
        mightHaveMore: res.mightHaveMore,
        hasDegradedItems: Boolean(res.hasDegradedItems),
        error: res.hasDegradedItems ? "tx_history_partial_data" : undefined,
      });
    } catch (error) {
      return attachLimit({
        state: stateFromError(error),
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error: errorMessage(error),
      });
    }
  };
};

/** Internal-only: compute max spendable ADA via real coin-selection fee estimation. */
const handleGetMaxSpendableAdaMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<GetMaxSpendableAdaMsg> = (service, keyRingService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    await keyRingService.ensureCardanoServiceReady(msg.chainId);

    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    return service.getMaxSpendableAda({
      sender: msg.sender,
      recipient: msg.recipient,
      memo: msg.memo,
    });
  };
};

const handleGetBlockfrostCredentialsMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<GetBlockfrostCredentialsMsg> = (
  service,
  keyRingService
) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    const keyRing = keyRingService.getKeyRing();
    const locked = keyRing.isLocked();

    return getBlockfrostCredentialsResponse(
      service.getBlockfrostCredentialsStore(),
      {
        chainId: msg.chainId,
        network: msg.network,
        locked,
        password: locked ? undefined : keyRing.currentPassword,
      }
    );
  };
};

const handleSetBlockfrostCredentialsMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<SetBlockfrostCredentialsMsg> = (
  service,
  keyRingService
) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    const keyRing = keyRingService.getKeyRing();

    await applySetBlockfrostCredentials(
      service.getBlockfrostCredentialsStore(),
      msg,
      {
        isLocked: keyRing.isLocked(),
        password: keyRing.isLocked() ? undefined : keyRing.currentPassword,
      }
    );

    await afterBlockfrostCredentialsChanged({
      chainId: msg.chainId,
      network: msg.network,
      keyRingService,
    });
  };
};

const handleClearBlockfrostCredentialsMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<ClearBlockfrostCredentialsMsg> = (
  service,
  keyRingService
) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    const keyRing = keyRingService.getKeyRing();

    await applyClearBlockfrostCredentials(
      service.getBlockfrostCredentialsStore(),
      msg,
      {
        isLocked: keyRing.isLocked(),
      }
    );

    await afterBlockfrostCredentialsChanged({
      chainId: msg.chainId,
      network: msg.network,
      keyRingService,
    });
  };
};
