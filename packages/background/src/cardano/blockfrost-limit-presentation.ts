import {
  encodeCardanoUiError,
  getBlockfrostChainNameFromNetwork,
  getBlockfrostConfigSource,
  getCardanoNetworkFromChainId,
  isBlockfrostRateLimitError,
  wasRateLimitedRecently,
  type UserBlockfrostPrefs,
} from "@keplr-wallet/cardano";
import type { CardanoService } from "./service";
import type { KeyRingService } from "../keyring/service";

export type BlockfrostActiveKeySource = "builtin" | "custom" | "none";

export interface BlockfrostLimitPresentation {
  activeKeySource: BlockfrostActiveKeySource;
  showBuiltinLimitCta: boolean;
  showUserKeyLimitWarning: boolean;
}

export async function getBlockfrostLimitPresentation(
  cardanoService: CardanoService,
  keyRingService: KeyRingService,
  chainId: string,
  options?: { forceRateLimited?: boolean }
): Promise<BlockfrostLimitPresentation> {
  const network = getCardanoNetworkFromChainId(chainId);
  const userPrefs = await readUserBlockfrostPrefs(
    cardanoService,
    keyRingService,
    network
  );
  const activeKeySource = getBlockfrostConfigSource(network, userPrefs);
  const chainName = getBlockfrostChainNameFromNetwork(network);
  const rateLimitedRecently =
    options?.forceRateLimited === true || wasRateLimitedRecently(chainName);

  return {
    activeKeySource,
    showBuiltinLimitCta: rateLimitedRecently && activeKeySource === "builtin",
    showUserKeyLimitWarning:
      rateLimitedRecently && activeKeySource === "custom",
  };
}

export async function withBlockfrostLimitPresentation<T>(
  response: T,
  cardanoService: CardanoService,
  keyRingService: KeyRingService,
  chainId: string | undefined
): Promise<T & { blockfrostLimit?: BlockfrostLimitPresentation }> {
  if (!chainId) {
    return response as T & { blockfrostLimit?: BlockfrostLimitPresentation };
  }

  const forceRateLimited =
    (response as { state?: unknown }).state === "blockfrost_rate_limited";

  return {
    ...response,
    blockfrostLimit: await getBlockfrostLimitPresentation(
      cardanoService,
      keyRingService,
      chainId,
      { forceRateLimited }
    ),
  } as T & { blockfrostLimit?: BlockfrostLimitPresentation };
}

export async function encodeCardanoSendError(
  error: unknown,
  rawMessage: string,
  cardanoService: CardanoService,
  keyRingService: KeyRingService,
  chainId: string | undefined
): Promise<string> {
  if (!chainId || !isBlockfrostRateLimitError(error)) {
    return rawMessage;
  }

  const presentation = await getBlockfrostLimitPresentation(
    cardanoService,
    keyRingService,
    chainId,
    { forceRateLimited: true }
  );

  if (presentation.showUserKeyLimitWarning) {
    return encodeCardanoUiError("blockfrost_user_limit", rawMessage);
  }

  if (presentation.showBuiltinLimitCta) {
    return encodeCardanoUiError("blockfrost_builtin_limit", rawMessage);
  }

  return rawMessage;
}

async function readUserBlockfrostPrefs(
  cardanoService: CardanoService,
  keyRingService: KeyRingService,
  network: ReturnType<typeof getCardanoNetworkFromChainId>
): Promise<UserBlockfrostPrefs | undefined> {
  const store = cardanoService.getBlockfrostCredentialsStore();
  if (!store) {
    return undefined;
  }

  const keyRing = keyRingService.getKeyRing();
  if (keyRing.isLocked() || !keyRing.currentPassword) {
    return undefined;
  }

  if (!(await store.hasPrefs(network))) {
    return undefined;
  }

  try {
    return (
      (await store.getPrefs(network, keyRing.currentPassword)) ?? undefined
    );
  } catch {
    return undefined;
  }
}
