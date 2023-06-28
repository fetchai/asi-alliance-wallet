import React, { FunctionComponent, useMemo, useState } from "react";
import { SignEthereumInteractionStore } from "@keplr-wallet/stores";
import { Box } from "../../../components/box";
import { XAxis } from "../../../components/axis";
import { Body2, Subtitle3 } from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { BackButton } from "../../../layouts/header/components";
import { HeaderLayout } from "../../../layouts/header";
import { useInteractionInfo } from "../../../hooks";
import { KeplrError } from "@keplr-wallet/router";
import { ErrModuleLedgerSign } from "../utils/ledger-types";
import { Buffer } from "buffer/";
import { LedgerGuideBox } from "../components/ledger-guide-box";
import { EthSignType } from "@keplr-wallet/types";
import { handleEthereumPreSign } from "../utils/handle-eth-sign";

/**
 * CosmosTxView의 주석을 꼭 참고하셈
 * 이 View는 아직 실험적이고 임시로 구현한거임
 * evmos에서 ADR-036 view랑 똑같이 구현해놔서 그게 마음에 안들어서 2.0에서 잠시 뺐다가
 * 쓰는 사람들이 약간 있길래 최소한의 UI로 먼저 구현함
 */
export const EthereumSigningView: FunctionComponent<{
  interactionData: NonNullable<SignEthereumInteractionStore["waitingData"]>;
}> = observer(({ interactionData }) => {
  const { chainStore, uiConfigStore, signEthereumInteractionStore } =
    useStore();

  const interactionInfo = useInteractionInfo(() => {
    signEthereumInteractionStore.rejectAll();
  });

  const messageText = useMemo(() => {
    switch (interactionData.data.signType) {
      case EthSignType.MESSAGE:
        return Buffer.from(interactionData.data.message).toString("hex");
      case EthSignType.TRANSACTION:
        return JSON.stringify(
          JSON.parse(Buffer.from(interactionData.data.message).toString()),
          null,
          2
        );
      case EthSignType.EIP712:
        return JSON.stringify(
          JSON.parse(Buffer.from(interactionData.data.message).toString()),
          null,
          2
        );
      default:
        return Buffer.from(interactionData.data.message).toString("hex");
    }
  }, [interactionData.data]);

  const [isLedgerInteracting, setIsLedgerInteracting] = useState(false);
  const [ledgerInteractingError, setLedgerInteractingError] = useState<
    Error | undefined
  >(undefined);

  return (
    <HeaderLayout
      title="Sign Ethereum"
      fixedHeight={true}
      left={
        <BackButton
          hidden={
            interactionInfo.interaction && !interactionInfo.interactionInternal
          }
        />
      }
      bottomButton={{
        text: "Approve",
        color: "primary",
        size: "large",
        isLoading:
          signEthereumInteractionStore.isObsoleteInteraction(
            interactionData.id
          ) || isLedgerInteracting,
        onClick: async () => {
          if (interactionData.data.keyType === "ledger") {
            setIsLedgerInteracting(true);
            setLedgerInteractingError(undefined);
          }

          try {
            const signature = await handleEthereumPreSign(
              uiConfigStore.useWebHIDLedger,
              interactionData
            );

            await signEthereumInteractionStore.approveWithProceedNext(
              interactionData.id,
              signature,
              (proceedNext) => {
                if (!proceedNext) {
                  if (
                    interactionInfo.interaction &&
                    !interactionInfo.interactionInternal
                  ) {
                    window.close();
                  }
                }
              }
            );
          } catch (e) {
            console.log(e);

            if (e instanceof KeplrError) {
              if (e.module === ErrModuleLedgerSign) {
                setLedgerInteractingError(e);
              } else {
                setLedgerInteractingError(undefined);
              }
            } else {
              setLedgerInteractingError(undefined);
            }
          } finally {
            setIsLedgerInteracting(false);
          }
        },
      }}
    >
      <Box
        height="100%"
        padding="0.75rem"
        paddingTop="0.5rem"
        paddingBottom="0"
        style={{
          overflow: "auto",
        }}
      >
        <Box
          height="17.5rem"
          padding="1rem"
          backgroundColor={ColorPalette["gray-600"]}
          borderRadius="0.375rem"
          style={{
            overflow: "auto",
          }}
        >
          <pre
            style={{
              color: ColorPalette["gray-10"],
              // Remove normalized style of pre tag
              margin: 0,
            }}
          >
            {messageText}
          </pre>
        </Box>

        <div style={{ flex: 1 }} />
        <Box
          padding="1rem"
          backgroundColor={ColorPalette["gray-600"]}
          borderRadius="0.375rem"
        >
          <XAxis alignY="center">
            <Body2 color={ColorPalette["gray-200"]}>Requested Network</Body2>
            <div style={{ flex: 1 }} />
            <Subtitle3 color={ColorPalette["gray-50"]}>
              {chainStore.getChain(interactionData.data.chainId).chainName}
            </Subtitle3>
          </XAxis>
        </Box>

        <LedgerGuideBox
          data={{
            keyInsensitive: interactionData.data.keyInsensitive,
            isEthereum: true,
          }}
          isLedgerInteracting={isLedgerInteracting}
          ledgerInteractingError={ledgerInteractingError}
        />
      </Box>
    </HeaderLayout>
  );
});
