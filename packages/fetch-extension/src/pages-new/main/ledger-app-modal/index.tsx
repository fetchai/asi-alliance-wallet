import React, { FunctionComponent, useEffect, useState } from "react";
import { Modal, ModalBody } from "reactstrap";
import { ButtonV2 } from "@components-v2/buttons/button";
import style from "./ledger-app-modal.module.scss";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import {
  InitNonDefaultLedgerAppMsg,
  LedgerApp,
} from "@keplr-wallet/background";
import { useNavigate } from "react-router";

export const LedgerAppModal: FunctionComponent = observer(() => {
  const { chainStore, accountStore } = useStore();
  const accountInfo = accountStore.getAccount(chainStore.current.chainId);

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
  const navigate = useNavigate();
  const isOpen = (() => {
    if (
      accountInfo.rejectionReason &&
      accountInfo.rejectionReason.message.includes(
        "No ethereum public key. Initialize ethereum app on Ledger by selecting the chain in the extension"
      )
    ) {
      return true;
    }

    return false;
  })();

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
            dataLoading={isLoading}
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
            text="Connect"
            styleProps={{
              padding: "12px",
              height: "50px",
              margin: 0,
            }}
            dataLoading={isLoading}
            onClick={async () => {
              setIsLoading(true);

              try {
                await new InExtensionMessageRequester().sendMessage(
                  BACKGROUND_PORT,
                  new InitNonDefaultLedgerAppMsg(LedgerApp.Ethereum)
                );
                accountInfo.disconnect();
                await accountInfo.init();
              } catch (e) {
                console.log(e);
              } finally {
                setIsLoading(false);
                navigate("/", { replace: true });
              }
            }}
          />
        </div>
      </ModalBody>
    </Modal>
  );
});
