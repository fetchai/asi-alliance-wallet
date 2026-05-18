import {
  getCardanoNetworkFromChainId,
  isUsableProjectIdString,
  type CardanoNetwork,
} from "@keplr-wallet/cardano";
import {
  BlockfrostCredentialsStore,
  maskBlockfrostProjectId,
  type BlockfrostCredentialsPayload,
} from "./blockfrost-credentials-store";
import {
  assertCardanoNetworkMatchesChainId,
  validateBlockfrostProjectId,
} from "./blockfrost-credentials-validation";
import type {
  ClearBlockfrostCredentialsMsg,
  GetBlockfrostCredentialsResponse,
  SetBlockfrostCredentialsMsg,
} from "./messages";

const assertUnlocked = (isLocked: boolean): void => {
  if (isLocked) {
    throw new Error("cardano_wallet_locked");
  }
};

export async function getBlockfrostCredentialsResponse(
  store: BlockfrostCredentialsStore | undefined,
  params: {
    chainId: string;
    network: CardanoNetwork;
    locked: boolean;
    password?: string;
  }
): Promise<GetBlockfrostCredentialsResponse> {
  assertCardanoNetworkMatchesChainId(
    params.chainId,
    params.network,
    getCardanoNetworkFromChainId
  );

  const hasCustomKey = store ? await store.hasPrefs(params.network) : false;

  if (params.locked) {
    return {
      locked: true,
      hasCustomKey,
      network: params.network,
      chainId: params.chainId,
    };
  }

  if (!store || !params.password) {
    return {
      locked: false,
      hasCustomKey: false,
      network: params.network,
      chainId: params.chainId,
      useCustomKey: false,
    };
  }

  try {
    const prefs = await store.getPrefs(params.network, params.password);

    return {
      locked: false,
      hasCustomKey,
      network: params.network,
      chainId: params.chainId,
      useCustomKey: prefs?.useCustomKey ?? false,
      maskedProjectId: prefs
        ? maskBlockfrostProjectId(prefs.projectId)
        : undefined,
    };
  } catch {
    return {
      locked: false,
      hasCustomKey: false,
      network: params.network,
      chainId: params.chainId,
      useCustomKey: false,
    };
  }
}

export async function applySetBlockfrostCredentials(
  store: BlockfrostCredentialsStore | undefined,
  msg: SetBlockfrostCredentialsMsg,
  params: { isLocked: boolean; password?: string }
): Promise<void> {
  if (!store) {
    throw new Error("blockfrost_credentials_unavailable");
  }

  assertUnlocked(params.isLocked);
  if (!params.password) {
    throw new Error("cardano_wallet_locked");
  }

  assertCardanoNetworkMatchesChainId(
    msg.chainId,
    msg.network,
    getCardanoNetworkFromChainId
  );

  const normalizedProjectId =
    msg.projectId !== undefined ? msg.projectId.trim() : undefined;

  if (
    msg.projectId !== undefined &&
    !isUsableProjectIdString(normalizedProjectId)
  ) {
    throw new Error("blockfrost_invalid_project_id");
  }

  const existing = (await store.hasPrefs(msg.network))
    ? await store.getPrefs(msg.network, params.password)
    : undefined;

  const nextProjectId =
    msg.projectId !== undefined ? normalizedProjectId : existing?.projectId;

  if (msg.useCustomKey && !isUsableProjectIdString(nextProjectId)) {
    throw new Error("blockfrost_missing_project_id");
  }

  if (!msg.useCustomKey && !isUsableProjectIdString(nextProjectId)) {
    if (await store.hasPrefs(msg.network)) {
      await store.clearPrefs(msg.network);
    }
    return;
  }

  const projectIdChanged =
    msg.projectId !== undefined &&
    nextProjectId !== undefined &&
    nextProjectId !== existing?.projectId;

  const shouldValidateProjectId =
    projectIdChanged || (msg.useCustomKey && existing?.useCustomKey !== true);

  if (shouldValidateProjectId) {
    const validation = await validateBlockfrostProjectId(
      nextProjectId!,
      msg.network
    );
    if (!validation.ok) {
      if (validation.requiresConfirmation && !msg.allowUnverifiedSave) {
        throw new Error("blockfrost_credentials_requires_confirmation");
      }
      if (!validation.requiresConfirmation) {
        throw new Error(`blockfrost_validation_${validation.reason}`);
      }
    }
  }

  const payload: BlockfrostCredentialsPayload = {
    projectId: nextProjectId!,
    useCustomKey: msg.useCustomKey,
  };

  await store.savePrefs(msg.network, params.password, payload);
}

export async function applyClearBlockfrostCredentials(
  store: BlockfrostCredentialsStore | undefined,
  msg: ClearBlockfrostCredentialsMsg,
  params: { isLocked: boolean }
): Promise<void> {
  if (!store) {
    throw new Error("blockfrost_credentials_unavailable");
  }

  assertUnlocked(params.isLocked);

  assertCardanoNetworkMatchesChainId(
    msg.chainId,
    msg.network,
    getCardanoNetworkFromChainId
  );

  await store.clearPrefs(msg.network);
}
