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
  LoadMoreCardanoTxHistoryMsg,
  GetMaxSpendableAdaMsg,
  CardanoServiceState,
} from "./messages";
import { CardanoService } from "./service";
import { KeyRingService } from "../keyring/service";
import { Buffer } from "buffer/";
import { formatErrorForLog } from "../logging/safe-error";
import { encodeCardanoUiError } from "@keplr-wallet/cardano";
import {
  classifyEnsureCardanoServiceReadyError,
  stateFromErrorMessage,
} from "./ensure-errors";

const stateFromError = (error: unknown): CardanoServiceState => {
  const message = error instanceof Error ? error.message : String(error ?? "");
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
    return await service.buildSendAdaTxDraft({
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
      throw new Error(toCardanoUiSubmitError(getSubmitErrorMessage(error)));
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
      throw new Error(toCardanoUiSubmitError(getSubmitErrorMessage(error)));
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
    // If chainId is provided, ensure service is ready for that network
    if (msg.chainId) {
      try {
        await keyRingService.ensureCardanoServiceReady(msg.chainId);
      } catch (error) {
        const classified = classifyEnsureCardanoServiceReadyError(error);
        if (classified === null) {
          throw error;
        }
        return {
          state: classified,
          isSettled: false,
          hasOutgoingPendingSpend: false,
          error: errorMessage(error),
        };
      }
    }

    if (!service.isReady()) {
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
            : "cardano_not_ready",
      };
    }

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
      const isSettled = (await firstValueFrom(walletManager.syncStatus$).catch(
        () => false
      )) as boolean;
      const hasOutgoingPendingSpend = await service.getHasOutgoingPendingSpend(
        msg.chainId
      );
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

    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }

    if (!service.isInitialized()) {
      return {
        state: "temporarily_unavailable",
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
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
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error:
          runtimeState === "provider_unavailable"
            ? "provider_unavailable"
            : "cardano_not_ready",
      };
    }

    const walletId =
      keyRingService.getKeyRing().getCurrentKeyStore()?.meta?.["__id__"] || "";

    try {
      const isSettled = await readCardanoWalletSettled(service);
      if (!isSettled) {
        return {
          state: "syncing",
          items: [],
          mightHaveMore: false,
          hasDegradedItems: false,
          error: "wallet_sync_in_progress",
        };
      }
      const res = await service.getTxHistory({
        pageSize: msg.pageSize,
        chainId: msg.chainId,
        walletId,
      });
      return {
        state: res.items.length > 0 ? "ready_with_data" : "empty_valid",
        items: res.items,
        mightHaveMore: res.mightHaveMore,
        hasDegradedItems: Boolean(res.hasDegradedItems),
        error: res.hasDegradedItems ? "tx_history_partial_data" : undefined,
      };
    } catch (error) {
      return {
        state: stateFromError(error),
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error: errorMessage(error),
      };
    }
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

    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }

    if (!service.isInitialized()) {
      return {
        state: "temporarily_unavailable",
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error: "cardano_not_initialized",
      };
    }

    // When wallet is unlocked but walletManager is not ready for this network
    // (e.g. after network switch or no Blockfrost for this chain), return empty history
    // instead of misleading "unlock wallet" so UI shows "No Activity Yet".
    if (!service.isReady()) {
      const runtimeState = service.getRuntimeState();
      return {
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
      };
    }

    const walletId =
      keyRingService.getKeyRing().getCurrentKeyStore()?.meta?.["__id__"] || "";

    try {
      const isSettled = await readCardanoWalletSettled(service);
      if (!isSettled) {
        return {
          state: "syncing",
          items: [],
          mightHaveMore: false,
          hasDegradedItems: false,
          error: "wallet_sync_in_progress",
        };
      }
      const res = await service.loadMoreTxHistory({
        pageSize: msg.pageSize,
        chainId: msg.chainId,
        walletId,
      });
      return {
        state: res.items.length > 0 ? "ready_with_data" : "empty_valid",
        items: res.items,
        mightHaveMore: res.mightHaveMore,
        hasDegradedItems: Boolean(res.hasDegradedItems),
        error: res.hasDegradedItems ? "tx_history_partial_data" : undefined,
      };
    } catch (error) {
      return {
        state: stateFromError(error),
        items: [],
        mightHaveMore: false,
        hasDegradedItems: false,
        error: errorMessage(error),
      };
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
