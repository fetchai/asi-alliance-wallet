import React, { FunctionComponent, useEffect, useState } from "react";
import { ConfirmCardModel } from "components/new/confirm-modal";
import { useStore } from "stores/index";
import { observer } from "mobx-react-lite";
import { useLoadingScreen } from "providers/loading-screen";

export const LedgerEvmModel: FunctionComponent = observer(() => {
  const [isLedgerEVM, setIsLedgerEVM] = useState(false);
  const { chainStore, ledgerInitStore, accountStore } = useStore();
  const account = accountStore.getAccount(chainStore.current.chainId);
  const loadingScreen = useLoadingScreen();

  // [prev, current]
  const [prevChainId, setPrevChainId] = useState<[string | undefined, string]>(
    () => [undefined, chainStore.current.chainId]
  );
  useEffect(() => {
    setPrevChainId((state) => {
      if (state[1] !== chainStore.current.chainId) {
        return [state[1], chainStore.current.chainId];
      } else {
        return [state[0], state[1]];
      }
    });
  }, [chainStore, chainStore.current.chainId]);

  const isOpen = (() => {
    if (
      account.rejectionReason &&
      account.rejectionReason.message ===
        "No Ethereum public key. Initialize Ethereum app on Ledger by selecting the chain in the extension"
    ) {
      return true;
    }

    return false;
  })();

  useEffect(() => {
    if (isOpen) {
      setIsLedgerEVM(true);
    }
  }, [isOpen]);

  return (
    <ConfirmCardModel
      isOpen={isLedgerEVM}
      close={() => setIsLedgerEVM(false)}
      confirmButtonText={"Connect"}
      title={"Please Connect your Ledger device"}
      subtitle={`
                For making an address for ${chainStore.current.chainName}, you need to
                connect your Ledger device through the Ethereum app.
            `}
      select={async (confirm) => {
        if (confirm) {
          loadingScreen.setIsLoading(true);

          try {
            await ledgerInitStore.tryNonDefaultLedgerAppOpen();
            account.disconnect();

            await account.init();
          } catch (e) {
            console.log("Ledger EVM Error", e);
          } finally {
            loadingScreen.setIsLoading(false);
          }
        } else {
          if (prevChainId[0]) {
            chainStore.selectChain(prevChainId[0]);
          } else {
            chainStore.selectChain(chainStore.chainInfos[0].chainId);
          }
          chainStore.saveLastViewChainId();
        }
      }}
    />
  );
});
