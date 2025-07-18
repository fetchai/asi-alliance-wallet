import React, { useEffect, useMemo } from "react";
import style from "./style.module.scss";
import { useIntl } from "react-intl";
import { AddressInput, MemoInput } from "@components-v2/form";
import { DenomHelper, ExtensionKVStore } from "@keplr-wallet/common";
import { useStore } from "../../stores";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useGasSimulator } from "@keplr-wallet/hooks";
import { useLocation, useNavigate } from "react-router";
import { useLanguage } from "../../languages";
import { CoinPretty, Dec, DecUtils, Int } from "@keplr-wallet/unit";
import { observer } from "mobx-react-lite";
import { TransxStatus } from "@components-v2/transx-status";
import { TXNTYPE } from "../../config";
import { FeeButtons } from "@components-v2/form/fee-buttons-v2";
import { useNotification } from "@components/notification";
import { navigateOnTxnEvents } from "@utils/navigate-txn-event";
import { getPathname } from "@utils/pathname";

interface SendPhase2Props {
  sendConfigs?: any;
  setIsNext?: any;
  isDetachedPage: any;
  trnsxStatus: string;
  fromPhase1: boolean;
  configs: any;
  setFromPhase1: any;
}

export const SendPhase2: React.FC<SendPhase2Props> = observer(
  ({
    sendConfigs,
    isDetachedPage,
    setIsNext,
    trnsxStatus,
    fromPhase1,
    configs,
    setFromPhase1,
  }) => {
    const {
      chainStore,
      accountStore,
      priceStore,
      analyticsStore,
      activityStore,
      keyRingStore,
    } = useStore();
    const accountInfo = accountStore.getAccount(chainStore.current.chainId);
    const navigate = useNavigate();
    const notification = useNotification();
    const location = useLocation();
    const { isFromPhase1 } = location.state || {};
    const language = useLanguage();
    const fiatCurrency = language.fiatCurrency;
    const isEvm = chainStore.current.features?.includes("evm") ?? false;
    const convertToUsd = (currency: any) => {
      const value = priceStore.calculatePrice(currency, fiatCurrency);
      return value && value.shrink(true).maxDecimals(6).toString();
    };
    const intl = useIntl();

    useEffect(() => {
      if (isFromPhase1 !== undefined) setFromPhase1(isFromPhase1);
      if (configs?.amount && !fromPhase1 && sendConfigs) {
        sendConfigs.amountConfig.setAmount(configs.amount);
        sendConfigs.amountConfig.setSendCurrency(configs.sendCurr);
      }
    }, [configs, fromPhase1, sendConfigs]);

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
      chainStore.current.chainId,
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
    const sendConfigError =
      sendConfigs.recipientConfig.error ??
      sendConfigs.amountConfig.error ??
      sendConfigs.memoConfig.error ??
      sendConfigs.gasConfig.error ??
      sendConfigs.feeConfig.error;
    const txStateIsValid = sendConfigError == null;

    const decimals = sendConfigs.amountConfig.sendCurrency.coinDecimals;

    const parseAmount = (amount: string, decimals: number) => {
      const decimalAmount = new Dec(amount ? amount : "0");

      const scaledAmount = decimalAmount
        .mul(DecUtils.getTenExponentNInPrecisionRange(decimals))
        .truncate()
        .toString();

      return BigInt(scaledAmount);
    };

    return (
      <div>
        <div className={style["editCard"]}>
          <div>
            <div className={style["amountInUsd"]}>
              {convertToUsd(
                sendConfigs.amountConfig
                  ? new CoinPretty(
                      sendConfigs.amountConfig?.sendCurrency,
                      parseAmount(sendConfigs.amountConfig.amount, decimals)
                    )
                  : new CoinPretty(
                      sendConfigs.amountConfig?.sendCurrency,
                      new Int(0)
                    )
              )}{" "}
              {fiatCurrency.toUpperCase()}
            </div>
            <div className={style["amount"]}>
              {parseFloat(sendConfigs.amountConfig.amount)
                .toFixed(6)
                .toString()}{" "}
              {sendConfigs.amountConfig.sendCurrency.coinDenom}
            </div>
          </div>
          <button onClick={() => setIsNext(false)} className={style["edit"]}>
            <img src={require("@assets/svg/edit-icon.svg")} alt="" />
          </button>
        </div>
        <AddressInput
          recipientConfig={sendConfigs.recipientConfig}
          memoConfig={configs ? configs.memo : sendConfigs.memoConfig}
          label={intl.formatMessage({ id: "send.input.recipient" })}
          value={configs ? configs.recipient : ""}
          pageName="Send"
        />
        <MemoInput
          memoConfig={sendConfigs.memoConfig}
          value={configs ? configs.memo : undefined}
          label={intl.formatMessage({ id: "send.input.memo" })}
        />

        <div
          style={{
            marginTop: "24px",
          }}
        />

        <div className={style["transactionFeeContainer"]}>
          <FeeButtons
            feeConfig={sendConfigs.feeConfig}
            gasConfig={sendConfigs.gasConfig}
            priceStore={priceStore}
            label={intl.formatMessage({ id: "send.input.fee" })}
            feeSelectLabels={{
              low: intl.formatMessage({ id: "fee-buttons.select.low" }),
              average: intl.formatMessage({
                id: "fee-buttons.select.average",
              }),
              high: intl.formatMessage({ id: "fee-buttons.select.high" }),
            }}
            gasLabel={intl.formatMessage({ id: "send.input.gas" })}
            gasSimulator={gasSimulator}
          />
        </div>
        <ButtonV2
          variant="dark"
          text="Review transaction"
          styleProps={{
            width: "94%",
            padding: "12px",
            height: "56px",
            margin: "0 auto",
            position: "fixed",
            bottom: "15px",
            left: "0px",
            right: "0px",
          }}
          onClick={async (e: any) => {
            e.preventDefault();
            if (accountInfo.isReadyToSendMsgs && txStateIsValid) {
              try {
                analyticsStore.logEvent("send_txn_click", { pageName: "Send" });
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
                      const txnNavigationOptions = {
                        redirect: () => {
                          navigate("/send", {
                            replace: true,
                            state: { trnsxStatus: "failed", isNext: true },
                          });
                        },
                        txType: TXNTYPE.send,
                        txInProgress: accountInfo.txInProgress,
                        toastNotification: () => {
                          notification.push({
                            type: "warning",
                            placement: "top-center",
                            duration: 5,
                            content: `Transaction Failed`,
                            canDelete: true,
                            transition: {
                              duration: 0.25,
                            },
                          });
                        },
                        isEVM: isEvm,
                      };
                      navigateOnTxnEvents(txnNavigationOptions);
                    },
                    onBroadcasted: () => {
                      analyticsStore.logEvent("send_txn_broadcasted", {
                        chainId: chainStore.current.chainId,
                        chainName: chainStore.current.chainName,
                        feeType: sendConfigs.feeConfig.feeType,
                      });
                      const txnNavigationOptions = {
                        redirect: () => {
                          navigate("/send", {
                            replace: true,
                            state: { trnsxStatus: "pending", isNext: true },
                          });
                        },
                        txType: TXNTYPE.send,
                        txInProgress: accountInfo.txInProgress,
                        toastNotification: () => {
                          notification.push({
                            type: "primary",
                            placement: "top-center",
                            duration: 2,
                            content: `Transaction broadcasted`,
                            canDelete: true,
                            transition: {
                              duration: 0.25,
                            },
                          });
                        },
                        isEVM: isEvm,
                      };
                      navigateOnTxnEvents(txnNavigationOptions);
                      if (keyRingStore.keyRingType === "ledger") {
                        navigate("/send");
                      }
                    },
                    onFulfill: (tx: any) => {
                      const istxnSuccess = !tx.code;
                      const txnNavigationOptions = {
                        redirect: () => {
                          navigate("/send", {
                            replace: true,
                            state: { trnsxStatus: "success", isNext: true },
                          });
                        },
                        pagePathname: "send",
                        txType: TXNTYPE.send,
                        txInProgress: accountInfo.txInProgress,
                        toastNotification: () => {
                          notification.push({
                            type: istxnSuccess ? "success" : "danger",
                            placement: "top-center",
                            duration: 5,
                            content: istxnSuccess
                              ? `Transaction Completed`
                              : `Transaction Failed`,
                            canDelete: true,
                            transition: {
                              duration: 0.25,
                            },
                          });
                        },
                        isEVM: isEvm,
                      };
                      navigateOnTxnEvents(txnNavigationOptions);
                    },
                  }
                );
                if (!isDetachedPage) {
                  const currentPathName = getPathname();
                  if (
                    currentPathName === "send" ||
                    currentPathName === "sign"
                  ) {
                    navigate("/send", {
                      replace: true,
                      state: { trnsxStatus: "pending", isNext: true },
                    });
                  }
                }
              } catch (e) {
                analyticsStore.logEvent("send_txn_broadcasted_fail", {
                  chainId: chainStore.current.chainId,
                  chainName: chainStore.current.chainName,
                  feeType: sendConfigs.feeConfig.feeType,
                  message: e?.message ?? "",
                });

                const currentPathName = getPathname();
                if (
                  !isDetachedPage &&
                  (currentPathName === "send" || currentPathName === "sign")
                ) {
                  navigate("/send", {
                    replace: true,
                    state: {
                      isNext: true,
                      isFromPhase1: false,
                      configs: {
                        amount: sendConfigs.amountConfig.amount,
                        sendCurr: sendConfigs.amountConfig.sendCurrency,
                        recipient: sendConfigs.recipientConfig.recipient,
                        memo: sendConfigs.memoConfig.memo,
                      },
                    },
                  });
                } else {
                  notification.push({
                    type: "warning",
                    placement: "top-center",
                    duration: 5,
                    content: `Transaction Failed`,
                    canDelete: true,
                    transition: {
                      duration: 0.25,
                    },
                  });
                }
              } finally {
                // XXX: If the page is in detached state,
                // close the window without waiting for tx to commit. analytics won't work.
                if (isDetachedPage) {
                  window.close();
                }
              }
            }
          }}
          data-loading={accountInfo.isSendingMsg === "send"}
          disabled={!accountInfo.isReadyToSendMsgs || !txStateIsValid}
          btnBgEnabled={true}
        >
          {activityStore.getPendingTxnTypes[TXNTYPE.send] && (
            <i className="fas fa-spinner fa-spin ml-2 mr-2" />
          )}
        </ButtonV2>
        {trnsxStatus !== undefined && <TransxStatus status={trnsxStatus} />}
      </div>
    );
  }
);
