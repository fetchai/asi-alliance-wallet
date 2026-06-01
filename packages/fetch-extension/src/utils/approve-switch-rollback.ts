import { flowResult } from "mobx";
import { requestKeyringSurfacesSyncBroadcast } from "./keyring-surfaces-sync";

export type KeyStoreEntryForRollback = {
  selected?: boolean;
  meta?: Record<string, unknown>;
};

export type ApproveSwitchRollbackDeps = {
  multiKeyStoreInfo: KeyStoreEntryForRollback[];
  previousWalletId: string;
  previousKeyRingIndex: number;
  previousChainId: string;
  getSelectedChainId: () => string | undefined;
  changeKeyRing: (index: number) => unknown;
  selectChainAndPersist: (chainId: string) => unknown;
};

/**
 * Best-effort restore after account-switch approve failed post local wallet+chain alignment.
 * Resolves target index by wallet __id__ first; falls back to previousKeyRingIndex when needed.
 */
export async function rollbackLocalStateAfterFailedApproveSwitch(
  deps: ApproveSwitchRollbackDeps
): Promise<void> {
  const {
    multiKeyStoreInfo,
    previousWalletId,
    previousKeyRingIndex,
    previousChainId,
    getSelectedChainId,
    changeKeyRing,
    selectChainAndPersist,
  } = deps;

  let rollbackIndex = -1;
  if (previousWalletId) {
    rollbackIndex = multiKeyStoreInfo.findIndex(
      (k: KeyStoreEntryForRollback) =>
        String(k.meta?.["__id__"] ?? "") === previousWalletId
    );
  }
  if (rollbackIndex < 0) {
    if (
      previousKeyRingIndex >= 0 &&
      previousKeyRingIndex < multiKeyStoreInfo.length
    ) {
      rollbackIndex = previousKeyRingIndex;
    }
  }
  if (rollbackIndex < 0) {
    throw new Error(
      "Could not resolve previous wallet to roll back; extension state may not match the dApp."
    );
  }

  await flowResult(changeKeyRing(rollbackIndex));

  const currentChainId = getSelectedChainId();
  if (previousChainId && previousChainId !== currentChainId) {
    await flowResult(selectChainAndPersist(previousChainId));
  }

  await requestKeyringSurfacesSyncBroadcast();
}
