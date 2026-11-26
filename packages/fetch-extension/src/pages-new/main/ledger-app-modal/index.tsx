import React, { FunctionComponent, useEffect, useState } from "react";
import { Modal, ModalBody } from "reactstrap";
import { ButtonV2 } from "@components-v2/buttons/button";
import style from "./ledger-app-modal.module.scss";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { TryLedgerInitMsg, LedgerApp } from "@keplr-wallet/background";
import { dispatchGlobalEventExceptSelf } from "@utils/global-events";
import { getRejectionMessage, isKeyRingRejection } from "@utils/rejection";
import { useNotification } from "@components/notification";

export const LedgerAppModal: FunctionComponent = observer(() => {
  const { chainStore, accountStore, ledgerInitStore, keyRingStore } =
    useStore();
  const accountInfo = accountStore.getAccount(chainStore.current.chainId);
  const notification = useNotification();

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

  const [isLoading, setIsLoading] = useState(false);
  const isOpen = isKeyRingRejection(accountInfo.rejectionReason, 901);

  useEffect(() => {
    if (!isOpen) {
      setIsLoading(false);
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      centered
      backdropClassName={style["ledgerModalBackdrop"]}
    >
      <ModalBody className={style["ledgerModalBody"]}>
        <div className={style["title"]}>Please Connect your Ledger device</div>
        <div className={style["paragraph"]}>
          For making address of {chainStore.current.chainName}, you need to
          connect your Ledger device through Ethereum app
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "5px",
          }}
        >
          <ButtonV2
            text="Cancel"
            styleProps={{
              padding: "12px",
              height: "50px",
            }}
            disabled={isLoading}
            onClick={(e: any) => {
              e.preventDefault();

              if (prevChainId[0]) {
                chainStore.selectChain(prevChainId[0]);
              } else {
                chainStore.selectChain(chainStore.chainInfos[0].chainId);
              }
              chainStore.saveLastViewChainId();
            }}
          />
          <ButtonV2
            variant="dark"
            text={isLoading ? "Connecting..." : "Connect"}
            styleProps={{
              padding: "12px",
              height: "50px",
              margin: 0,
              color: "#FFFFFF",
            }}
            disabled={isLoading}
            dataLoading={isLoading}
            onClick={async () => {
              setIsLoading(true);

              try {
                const pubkey =
                  await new InExtensionMessageRequester().sendMessage(
                    BACKGROUND_PORT,
                    new TryLedgerInitMsg(
                      LedgerApp.Ethereum,
                      ledgerInitStore.cosmosLikeApp || "Cosmos"
                    )
                  );
                if (keyRingStore?.selectedKeyInfo) {
                  if (!keyRingStore.selectedKeyInfo.insensitive?.["Ethereum"]) {
                    await keyRingStore.appendLedgerKeyApp(
                      keyRingStore.selectedKeyInfo.id,
                      pubkey,
                      "Ethereum"
                    );
                    dispatchGlobalEventExceptSelf(
                      "keplr_ledger_app_connected",
                      keyRingStore.selectedKeyInfo.id
                    );
                  }
                  accountInfo.disconnect();
                  await accountInfo.init();
                }
              } catch (e) {
                const message =
                  getRejectionMessage(e) ||
                  (e instanceof Error ? e.message : "") ||
                  "Failed to connect Ledger. Open the Ethereum app and try again.";
                notification.push({
                  type: "warning",
                  placement: "top-center",
                  duration: 5,
                  content: message,
                  canDelete: true,
                  transition: {
                    duration: 0.25,
                  },
                });
              } finally {
                setIsLoading(false);
              }
            }}
          />
        </div>
      </ModalBody>
    </Modal>
  );
});
