import React, { FunctionComponent, useEffect, useMemo, useState } from "react";

import { useStore } from "../../stores";

import { HeaderLayout } from "@layouts-v2/header-layout";

import { observer } from "mobx-react-lite";

import style from "./style.module.scss";
import { useNotification } from "@components/notification";

import { useNavigate, useLocation } from "react-router";
import queryString from "querystring";

import { useGasSimulator, useSendTxConfig } from "@keplr-wallet/hooks";
import {
  fitPopupWindow,
  // openPopupWindow,
  // PopupSize,
} from "@keplr-wallet/popup";
import { DenomHelper, ExtensionKVStore } from "@keplr-wallet/common";

import { SendPhase1 } from "./send-phase-1";
import { SendPhase2 } from "./send-phase-2";
export const SendPage: FunctionComponent = observer(() => {
  const [isNext, setIsNext] = useState(false);
  const [fromPhase1, setFromPhase1] = useState(true);

  const navigate = useNavigate();
  let search = useLocation().search;
  if (search.startsWith("?")) {
    search = search.slice(1);
  }
  const query = queryString.parse(search) as {
    defaultDenom: string | undefined;
    defaultRecipient: string | undefined;
    defaultAmount: string | undefined;
    defaultMemo: string | undefined;
    detached: string | undefined;
  };

  useEffect(() => {
    // Scroll to top on page mounted.
    if (window.scrollTo) {
      window.scrollTo(0, 0);
    }
  }, []);

  const notification = useNotification();

  const {
    chainStore,
    accountStore,
    queriesStore,
    analyticsStore,
    uiConfigStore,
  } = useStore();
  const current = chainStore.current;

  const accountInfo = accountStore.getAccount(current.chainId);

  const sendConfigs = useSendTxConfig(
    chainStore,
    queriesStore,
    accountStore,
    current.chainId,
    accountInfo.bech32Address,
    {
      allowHexAddressOnEthermint: true,
      icns: uiConfigStore.icnsInfo,
      computeTerraClassicTax: true,
    }
  );

  const gasSimulatorKey = useMemo(() => {
    if (sendConfigs.amountConfig.sendCurrency) {
      const denomHelper = new DenomHelper(
        sendConfigs.amountConfig.sendCurrency.coinMinimalDenom
      );

      if (denomHelper.type !== "native") {
        if (denomHelper.type === "cw20") {
          // Probably, the gas can be different per cw20 according to how the contract implemented.
          return `${denomHelper.type}/${denomHelper.contractAddress}`;
        }

        return denomHelper.type;
      }
    }

    return "native";
  }, [sendConfigs.amountConfig.sendCurrency]);

  const gasSimulator = useGasSimulator(
    new ExtensionKVStore("gas-simulator.main.send"),
    chainStore,
    current.chainId,
    sendConfigs.gasConfig,
    sendConfigs.feeConfig,
    gasSimulatorKey,
    () => {
      if (!sendConfigs.amountConfig.sendCurrency) {
        throw new Error("Send currency not set");
      }

      // Prefer not to use the gas config or fee config,
      // because gas simulator can change the gas config and fee config from the result of reaction,
      // and it can make repeated reaction.
      if (
        sendConfigs.amountConfig.error != null ||
        sendConfigs.recipientConfig.error != null
      ) {
        throw new Error("Not ready to simulate tx");
      }

      const denomHelper = new DenomHelper(
        sendConfigs.amountConfig.sendCurrency.coinMinimalDenom
      );
      // I don't know why, but simulation does not work for secret20
      if (denomHelper.type === "secret20") {
        throw new Error("Simulating secret wasm not supported");
      }

      return accountInfo.makeSendTokenTx(
        sendConfigs.amountConfig.amount,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        sendConfigs.amountConfig.sendCurrency!,
        sendConfigs.recipientConfig.recipient
      );
    }
  );

  useEffect(() => {
    // To simulate secretwasm, we need to include the signature in the tx.
    // With the current structure, this approach is not possible.
    if (
      sendConfigs.amountConfig.sendCurrency &&
      new DenomHelper(sendConfigs.amountConfig.sendCurrency.coinMinimalDenom)
        .type === "secret20"
    ) {
      gasSimulator.forceDisable(
        new Error("Simulating secret20 is not supported")
      );
      sendConfigs.gasConfig.setGas(
        accountInfo.secret.msgOpts.send.secret20.gas
      );
    } else {
      gasSimulator.forceDisable(false);
      gasSimulator.setEnabled(true);
    }
  }, [
    accountInfo.secret.msgOpts.send.secret20.gas,
    gasSimulator,
    sendConfigs.amountConfig.sendCurrency,
    sendConfigs.gasConfig,
  ]);

  useEffect(() => {
    if (
      sendConfigs.feeConfig.chainInfo.features &&
      sendConfigs.feeConfig.chainInfo.features.includes("terra-classic-fee")
    ) {
      // When considering stability tax for terra classic.
      // Simulation itself doesn't consider the stability tax send.
      // Thus, it always returns fairly lower gas.
      // To adjust this, for terra classic, increase the default gas adjustment
      gasSimulator.setGasAdjustment(1.6);
    }
  }, [gasSimulator, sendConfigs.feeConfig.chainInfo]);

  useEffect(() => {
    if (query.defaultDenom) {
      const currency = current.currencies.find(
        (cur) => cur.coinMinimalDenom === query.defaultDenom
      );

      if (currency) {
        sendConfigs.amountConfig.setSendCurrency(currency);
      }
    }
  }, [current.currencies, query.defaultDenom, sendConfigs.amountConfig]);

  const isDetachedPage = query.detached === "true";

  useEffect(() => {
    if (isDetachedPage) {
      fitPopupWindow();
    }
  }, [isDetachedPage]);

  useEffect(() => {
    if (query.defaultRecipient) {
      sendConfigs.recipientConfig.setRawRecipient(query.defaultRecipient);
    }
    if (query.defaultAmount) {
      sendConfigs.amountConfig.setAmount(query.defaultAmount);
    }
    if (query.defaultMemo) {
      sendConfigs.memoConfig.setMemo(query.defaultMemo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.defaultAmount, query.defaultMemo, query.defaultRecipient]);

  const sendConfigError =
    sendConfigs.recipientConfig.error ??
    sendConfigs.amountConfig.error ??
    sendConfigs.memoConfig.error ??
    sendConfigs.gasConfig.error ??
    sendConfigs.feeConfig.error;
  const txStateIsValid = sendConfigError == null;
  const location = useLocation();
  const { trnsxStatus, isNext: next, configs } = location.state || {};
  useEffect(() => {
    if (next) {
      setIsNext(next);
    }
  }, [trnsxStatus, next]);

  console.log("index fromPhase1:", fromPhase1);

  return (
    <HeaderLayout
      showTopMenu={true}
      smallTitle={true}
      alternativeTitle="Send"
      canChangeChainInfo={false}
      showBottomMenu={false}
      onBackButton={
        isDetachedPage
          ? undefined
          : () => {
              isNext ? setIsNext(false) : navigate("/");
            }
      }
      // rightRenderer={
      //   isDetachedPage ? undefined : (
      //     <div
      //       style={{
      //         height: "64px",
      //         display: "flex",
      //         justifyContent: "center",
      //         alignItems: "center",
      //         paddingRight: "18px",
      //       }}
      //     >
      //       <div className={style["external-link-div"]}>
      //         <img
      //           src={require("@assets/svg/wireframe/external-link.svg")}
      //           onClick={async (e) => {
      //             e.preventDefault();

      //             const windowInfo = await browser.windows.getCurrent();

      //             let queryString = `?detached=true&defaultDenom=${sendConfigs.amountConfig.sendCurrency.coinMinimalDenom}`;
      //             if (sendConfigs.recipientConfig.rawRecipient) {
      //               queryString += `&defaultRecipient=${sendConfigs.recipientConfig.rawRecipient}`;
      //             }
      //             if (sendConfigs.amountConfig.amount) {
      //               queryString += `&defaultAmount=${sendConfigs.amountConfig.amount}`;
      //             }
      //             if (sendConfigs.memoConfig.memo) {
      //               queryString += `&defaultMemo=${sendConfigs.memoConfig.memo}`;
      //             }

      //             await openPopupWindow(
      //               browser.runtime.getURL(`/popup.html#/send${queryString}`),
      //               undefined,
      //               {
      //                 top: (windowInfo.top || 0) + 80,
      //                 left:
      //                   (windowInfo.left || 0) +
      //                   (windowInfo.width || 0) -
      //                   PopupSize.width -
      //                   20,
      //               }
      //             );
      //             window.close();
      //           }}
      //         />
      //       </div>
      //     </div>
      //   )
      // }
    >
      <form
        className={style["formContainer"]}
        style={{
          height: "100%",
        }}
        onSubmit={async (e) => {
          e.preventDefault();

          if (accountInfo.isReadyToSendMsgs && txStateIsValid) {
            try {
              const stdFee = sendConfigs.feeConfig.toStdFee();

              const tx = accountInfo.makeSendTokenTx(
                sendConfigs.amountConfig.amount,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                sendConfigs.amountConfig.sendCurrency!,
                sendConfigs.recipientConfig.recipient
              );

              await tx.send(
                stdFee,
                sendConfigs.memoConfig.memo,
                {
                  preferNoSetFee: true,
                  preferNoSetMemo: true,
                },
                {
                  onBroadcastFailed: (e: any) => {
                    console.log(e);
                  },
                  onBroadcasted: () => {
                    analyticsStore.logEvent("Send token tx broadcasted", {
                      chainId: chainStore.current.chainId,
                      chainName: chainStore.current.chainName,
                      feeType: sendConfigs.feeConfig.feeType,
                    });
                  },
                }
              );

              if (!isDetachedPage) {
                navigate("/", { replace: true });
              }
            } catch (e) {
              if (!isDetachedPage) {
                navigate("/", { replace: true });
              }
              notification.push({
                type: "warning",
                placement: "top-center",
                duration: 5,
                content: `Fail to send token: ${e.message}`,
                canDelete: true,
                transition: {
                  duration: 0.25,
                },
              });
            } finally {
              // XXX: If the page is in detached state,
              // close the window without waiting for tx to commit. analytics won't work.
              if (isDetachedPage) {
                window.close();
              }
            }
          }
        }}
      >
        <div className={style["formInnerContainer"]}>
          <div className={style["cardContainer"]}>
            {!isNext ? (
              <SendPhase1
                setIsNext={setIsNext}
                sendConfigs={sendConfigs}
                setFromPhase1={setFromPhase1}
              />
            ) : (
              <SendPhase2
                isDetachedPage={isDetachedPage}
                sendConfigs={sendConfigs}
                setIsNext={setIsNext}
                trnsxStatus={trnsxStatus}
                fromPhase1={fromPhase1}
                configs={configs}
                setFromPhase1={setFromPhase1}
              />
            )}
          </div>
        </div>
      </form>
    </HeaderLayout>
  );
});
