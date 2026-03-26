import React, { FunctionComponent, useMemo } from "react";
import { SignDocWrapper } from "@keplr-wallet/cosmos";
import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";
import { Buffer } from "buffer/";
import { MsgRender } from "./details-tab";
import styleDetailsTab from "./details-tab.module.scss";
import { Label } from "reactstrap";
import { EthSignType } from "@keplr-wallet/types";
import { renderEvmTxn } from "./evm";
import { useIntl } from "react-intl";
import { UnsignedTransaction } from "@ethersproject/transactions";

export const ADR36SignDocDetailsTab: FunctionComponent<{
  signDocWrapper?: SignDocWrapper;
  isADR36WithString?: boolean;
  ethSignType?: EthSignType;
  ethData?: unknown;
  origin?: string;
}> = observer(
  ({ signDocWrapper, isADR36WithString, ethSignType, ethData, origin }) => {
    const { chainStore, accountStore } = useStore();
    const intl = useIntl();

    const renderTitleText = () => {
      if (
        ethSignType === EthSignType.TRANSACTION ||
        ethSignType === EthSignType.MESSAGE
      ) {
        return "Sign transaction for";
      }
      return "Prove account ownership to";
    };

    let evmRenderedMessage: React.ReactElement | undefined;

    const signValue = useMemo(() => {
      try {
        if (signDocWrapper) {
          const msgs = signDocWrapper.aminoSignDoc.msgs;

          if (msgs.length !== 1) return "Sign doc is inproper ADR-36";

          const msg = msgs[0];
          if (msg.type !== "sign/MsgSignData") {
            return "Sign doc is inproper ADR-36";
          }

          const decoded = Buffer.from(msg.value.data, "base64").toString();

          // ADR36 string case
          if (isADR36WithString) {
            try {
              return JSON.stringify(JSON.parse(decoded), null, 2);
            } catch {
              return decoded;
            }
          }

          return decoded;
        }

        try {
          if (ethSignType) {
            if (ethSignType === EthSignType.TRANSACTION) {
              const txnParams: UnsignedTransaction = JSON.parse(ethData as any);

              const msgContent = renderEvmTxn(
                txnParams,
                chainStore.current.feeCurrencies[0],
                chainStore.current.currencies,
                intl
              );

              evmRenderedMessage = (
                <React.Fragment>
                  <MsgRender title={msgContent.title}>
                    {msgContent.content}
                  </MsgRender>
                  <hr />
                  {txnParams.data &&
                  accountStore.getAccount(chainStore.current.chainId)
                    .isNanoLedger ? (
                    <div
                      className={
                        styleDetailsTab["ethLedgerBlindSigningWarning"]
                      }
                    >
                      <div className={styleDetailsTab["title"]}>
                        Before you click ‘Approve’
                      </div>
                      <ul className={styleDetailsTab["list"]}>
                        <li>
                          Connect your Ledger device and select the Ethereum app
                        </li>
                        <li>Enable ‘blind signing’ on your Ledger device</li>
                      </ul>
                    </div>
                  ) : null}
                </React.Fragment>
              );

              return JSON.stringify(txnParams, null, 2);
            }

            // MESSAGE / SIGN
            if (ethSignType === EthSignType.MESSAGE) {
              return typeof ethData === "string"
                ? ethData
                : JSON.stringify(ethData, null, 2);
            }

            // TYPED DATA
            return JSON.stringify(ethData, null, 2);
          }

          return "No signing data";
        } catch (e) {
          return "Failed to parse signing data";
        }
      } catch (e) {
        return "Failed to parse signing data";
      }
    }, [
      signDocWrapper,
      isADR36WithString,
      ethSignType,
      ethData,
      chainStore,
      accountStore,
      intl,
    ]);

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div
          className={styleDetailsTab["msgContainer"]}
          style={{ flex: "none" }}
        >
          {evmRenderedMessage ? (
            evmRenderedMessage
          ) : (
            <MsgRender title={renderTitleText()}>
              {origin ?? "Unknown"}
            </MsgRender>
          )}
        </div>

        {!evmRenderedMessage && (
          <div>
            <Label
              for="sign-value"
              className={styleDetailsTab["label"]}
              style={{ marginTop: "8px" }}
            >
              Message
            </Label>

            <div
              id="sign-value"
              className={styleDetailsTab["signValueContainer"]}
            >
              <pre className={styleDetailsTab["signValue"]}>{signValue}</pre>
            </div>

            <React.Fragment>
              <Label for="chain-name" className={styleDetailsTab["label"]}>
                Requested Network
              </Label>
              <div id="chain-name">
                <div style={{ color: "var(--font-dark)" }}>
                  {chainStore.current.chainName}
                </div>
              </div>
            </React.Fragment>
          </div>
        )}
      </div>
    );
  }
);
