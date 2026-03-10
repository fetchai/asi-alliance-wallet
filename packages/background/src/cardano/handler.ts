import { Env, Handler, InternalHandler, Message } from "@keplr-wallet/router";
import {
  SendAdaMsg,
  SendAdaWithPasswordMsg,
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
} from "./messages";
import { CardanoService } from "./service";
import { KeyRingService } from "../keyring/service";
import { PermissionService } from "../permission/service";

export const getHandler: (
  service: CardanoService,
  keyRingService: KeyRingService,
  permissionService: PermissionService
) => Handler = (
  service: CardanoService,
  keyRingService: KeyRingService,
  permissionService: PermissionService
) => {
  return (env: Env, msg: Message<unknown>) => {
    // Use msg.type() instead of constructor comparison because parseMessage uses Object.setPrototypeOf
    // which may not preserve exact constructor reference
    const msgType = msg.type();

    switch (msgType) {
      case SendAdaMsg.type():
        return handleSendAdaMsg(service, keyRingService, permissionService)(
          env,
          msg as SendAdaMsg
        );
      case SendAdaWithPasswordMsg.type():
        return handleSendAdaWithPasswordMsg(service, keyRingService)(
          env,
          msg as SendAdaWithPasswordMsg
        );
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
        return handleSubmitSendAdaTxDraftWithPasswordMsg(service, keyRingService)(
          env,
          msg as SubmitSendAdaTxDraftWithPasswordMsg
        );
      case DiscardSendAdaTxDraftMsg.type():
        return handleDiscardSendAdaTxDraftMsg(service)(
          env,
          msg as DiscardSendAdaTxDraftMsg
        );
      case GetCardanoBalanceMsg.type():
        return handleGetCardanoBalanceMsg(service)(env, msg as GetCardanoBalanceMsg);
      case IsCardanoReadyMsg.type():
        return handleIsCardanoReadyMsg(service)(env, msg as IsCardanoReadyMsg);
      case EstimateSendAdaMsg.type():
        return handleEstimateSendAdaMsg(service, keyRingService, permissionService)(
          env,
          msg as EstimateSendAdaMsg
        );
      case GetCardanoSyncStatusMsg.type():
        return handleGetCardanoSyncStatusMsg(service, keyRingService)(env, msg as GetCardanoSyncStatusMsg);
      case GetCardanoTxHistoryMsg.type():
        return handleGetCardanoTxHistoryMsg(service, keyRingService)(env, msg as GetCardanoTxHistoryMsg);
      case LoadMoreCardanoTxHistoryMsg.type():
        return handleLoadMoreCardanoTxHistoryMsg(service, keyRingService)(env, msg as LoadMoreCardanoTxHistoryMsg);
      case GetMaxSpendableAdaMsg.type():
        return handleGetMaxSpendableAdaMsg(service, keyRingService)(env, msg as GetMaxSpendableAdaMsg);
      default:
        console.error("[Cardano Handler] Unknown message type:", msgType);
        throw new Error(`Unknown msg type: ${msgType}`);
    }
  };
};

/**
 * Handler for sending ADA transaction with password confirmation (internal only).
 */
const handleSendAdaWithPasswordMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<SendAdaWithPasswordMsg> = (service, keyRingService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    // Password confirmation step: require correct password even if the keyring is already unlocked.
    if (!keyRingService.checkPassword(msg.password)) {
      throw new Error("Invalid password");
    }

    // Ensure Cardano service is initialized for the requested network (requires unlocked keyring).
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }

    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    // Keep existing sync safety check.
    try {
      const walletManager = service.getWalletManager();
      if (walletManager && walletManager.hasWallet()) {
        const { firstValueFrom } = await import("rxjs");
        const { filter, take, timeout } = await import("rxjs/operators");

        try {
          await firstValueFrom(
            walletManager.syncStatus$.pipe(
              filter((isSettled: boolean) => isSettled === true),
              take(1),
              timeout(5000)
            )
          );
        } catch (syncError: any) {
          const isSettled = await firstValueFrom(walletManager.syncStatus$).catch(
            () => false
          );
          if (!isSettled) {
            throw new Error("Wallet is syncing. Please wait and try again.");
          }
        }
      }
    } catch (error: any) {
      if (error?.message?.includes("syncing")) {
        throw error;
      }
      // Continue if sync check fails (wallet might not have this capability)
    }

    return await service.sendAda({
      to: msg.to,
      amount: msg.amount,
      memo: msg.memo,
      assets: msg.assets,
    });
  };
};

/**
 * Handler for sending ADA transaction
 */
const handleSendAdaMsg: (
  service: CardanoService,
  keyRingService: KeyRingService,
  permissionService: PermissionService
) => InternalHandler<SendAdaMsg> = (service, keyRingService, permissionService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      if (!msg.chainId) {
        throw new Error("chainId is required");
      }
      await permissionService.checkOrGrantBasicAccessPermission(
        env,
        msg.chainId,
        msg.origin
      );
    }

    // If chainId is provided, ensure service is ready for that network
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }

    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    try {
      const walletManager = service.getWalletManager();
      if (walletManager && walletManager.hasWallet()) {
        const { firstValueFrom } = await import('rxjs');
        const { filter, take, timeout } = await import('rxjs/operators');

        try {
          await firstValueFrom(
            walletManager.syncStatus$.pipe(
              filter((isSettled: boolean) => isSettled === true),
              take(1),
              timeout(5000) // 5 seconds - if already synced, will return immediately
            )
          );
        } catch (syncError: any) {
          // Check current state
          const isSettled = await firstValueFrom(walletManager.syncStatus$).catch(() => false);
          if (!isSettled) {
            throw new Error("Wallet is syncing. Please wait and try again.");
          }
        }
      }
    } catch (error: any) {
      if (error?.message?.includes('syncing')) {
        throw error;
      }
      // Continue if sync check fails (wallet might not have this capability)
    }

    try {
      const txHash = await service.sendAda({
        to: msg.to,
        amount: msg.amount,
        memo: msg.memo,
        assets: msg.assets,
      });
      return txHash;
    } catch (error) {
      throw error;
    }
  };
};

/**
 * Handler for getting Cardano balance
 */
const handleGetCardanoBalanceMsg: (
  service: CardanoService
) => InternalHandler<GetCardanoBalanceMsg> = (service) => {
  return async (_, _msg) => {
    // Check that service is ready
    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    return await service.getBalance();
  };
};

/**
 * Handler for checking Cardano service readiness
 */
const handleIsCardanoReadyMsg: (
  service: CardanoService
) => InternalHandler<IsCardanoReadyMsg> = (service) => {
  return async (_, _msg) => {
    return service.isReady();
  };
};

/**
 * Handler for estimating Cardano transaction fee
 */
const handleEstimateSendAdaMsg: (
  service: CardanoService,
  keyRingService: KeyRingService,
  permissionService: PermissionService
) => InternalHandler<EstimateSendAdaMsg> = (service, keyRingService, permissionService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      if (!msg.chainId) {
        throw new Error("chainId is required");
      }
      await permissionService.checkOrGrantBasicAccessPermission(
        env,
        msg.chainId,
        msg.origin
      );
    }

    // If chainId is provided, ensure service is ready for that network
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }
    
    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

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
  try {
    const walletManager = service.getWalletManager();
    if (walletManager && walletManager.hasWallet()) {
      const { firstValueFrom } = await import("rxjs");
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
          throw new Error("Wallet is syncing. Please wait and try again.");
        }
      }
    }
  } catch (error: any) {
    if (error?.message?.includes("syncing")) {
      throw error;
    }
    // Continue if sync check fails (wallet might not have this capability)
  }
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
    return await service.buildSendAdaTxDraft({
      to: msg.to,
      amount: msg.amount,
      memo: msg.memo,
      chainId: msg.chainId,
      assets: msg.assets,
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
    return await service.submitSendAdaTxDraft({ draftId: msg.draftId, chainId: msg.chainId });
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
      throw new Error("Invalid password");
    }
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }
    if (!service.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }
    await waitForCardanoWalletSettled(service);
    return await service.submitSendAdaTxDraft({ draftId: msg.draftId, chainId: msg.chainId });
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
  return async (_, msg) => {
    // If chainId is provided, ensure service is ready for that network
    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }
    
    if (!service.isReady()) {
      return { isSettled: false };
    }

    try {
      const walletManager = service.getWalletManager();
      if (!walletManager || !walletManager.hasWallet()) {
        return { isSettled: false };
      }
      
      const { firstValueFrom } = await import('rxjs');
      const isSettled = await firstValueFrom(walletManager.syncStatus$).catch(() => false) as boolean;
      return { isSettled };
    } catch (error) {
      return { isSettled: false };
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
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    if (!service.isReady()) {
      return { items: [], mightHaveMore: false };
    }

    const walletId =
      keyRingService.getKeyRing().getCurrentKeyStore()?.meta?.["__id__"] || "";

    return await service.getTxHistory({
      pageSize: msg.pageSize,
      chainId: msg.chainId,
      walletId,
    });
  };
};

/** Handler for loading more Cardano tx history (internal-only). */
const handleLoadMoreCardanoTxHistoryMsg: (
  service: CardanoService,
  keyRingService: KeyRingService
) => InternalHandler<LoadMoreCardanoTxHistoryMsg> = (service, keyRingService) => {
  return async (env, msg) => {
    if (!env.isInternalMsg) {
      throw new Error("This message is only supported for internal requests");
    }

    if (msg.chainId) {
      await keyRingService.ensureCardanoServiceReady(msg.chainId);
    }

    if (!service.isInitialized()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    // When wallet is unlocked but walletManager is not ready for this network
    // (e.g. after network switch or no Blockfrost for this chain), return empty history
    // instead of misleading "unlock wallet" so UI shows "No Activity Yet".
    if (!service.isReady()) {
      return { items: [], mightHaveMore: false };
    }

    const walletId =
      keyRingService.getKeyRing().getCurrentKeyStore()?.meta?.["__id__"] || "";

    return await service.loadMoreTxHistory({
      pageSize: msg.pageSize,
      chainId: msg.chainId,
      walletId,
    });
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
