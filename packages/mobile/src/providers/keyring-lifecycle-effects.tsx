import { FunctionComponent, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { WalletStatus } from "@keplr-wallet/stores";
import { useStore } from "stores/index";

/**
 * After unlock only (extension StateRenderer subset):
 * - refresh chain infos / enabled identifiers
 * - warm current + enabled chain accounts once
 *
 * Do NOT call GetChainInfos while locked — that message runs
 * ensureUnlockInteractive() and waits on an unlock approval, which can
 * deadlock under the launch cover.
 */
export const KeyRingLifecycleEffects: FunctionComponent = observer(() => {
  const { keyRingStore, chainStore, accountStore } = useStore();
  const initAccountsOnce = useRef(false);
  const keyRingStatus = keyRingStore.status;

  useEffect(() => {
    if (keyRingStatus !== "unlocked") {
      return;
    }

    chainStore.updateChainInfosFromBackground();
    chainStore.updateEnabledChainIdentifiersFromBackground();
  }, [keyRingStatus, chainStore]);

  useEffect(() => {
    if (keyRingStatus !== "unlocked" || initAccountsOnce.current) {
      return;
    }
    initAccountsOnce.current = true;

    const warm = (chainId: string) => {
      const account = accountStore.getAccount(chainId);
      if (account.walletStatus === WalletStatus.NotInit) {
        account.init();
      }
    };

    warm(chainStore.current.chainId);

    for (const chainInfo of chainStore.chainInfos) {
      if (chainInfo.chainId === chainStore.current.chainId) {
        continue;
      }
      if (!chainStore.isEnabledChain(chainInfo.chainId)) {
        continue;
      }
      if (chainInfo.hideInUI || chainInfo.chainId.startsWith("eip155:")) {
        continue;
      }
      warm(chainInfo.chainId);
    }
  }, [keyRingStatus, chainStore, accountStore]);

  return null;
});
