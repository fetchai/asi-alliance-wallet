import React, { useEffect, useRef, useState } from "react";
import style from "./style.module.scss";
import { useIntl } from "react-intl";
import { AddressInput, MemoInput, PasswordInput } from "@components-v2/form";
import { useStore } from "../../stores";
import { ButtonV2 } from "@components-v2/buttons/button";
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
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import {
  BuildSendAdaTxDraftMsg,
  DiscardSendAdaTxDraftMsg,
  GetCardanoSyncStatusMsg,
  KeyRingStatus,
  SubmitSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftWithPasswordMsg,
} from "@keplr-wallet/background";
import { Modal, ModalBody } from "reactstrap";
import type { KeplrSignOptions } from "@keplr-wallet/types";

type CardanoSignOptions = KeplrSignOptions & {
  cardano?: { spendingPassword?: string };
};

type CardanoPasswordConfirmModalProps = {
  isOpen: boolean;
  isSyncing: boolean;
  feeText: string;
  isWalletLocked: boolean;
  networkName: string;
  recipient: string;
  amountText: string;
  memo?: string;
  passwordInputRef: React.RefObject<HTMLInputElement>;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
  onNotifyWarning: (content: string) => void;
};

const CardanoPasswordConfirmModal: React.FC<CardanoPasswordConfirmModalProps> = (
  props
) => {
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (props.isOpen) {
      setPassword("");
      setPasswordError(undefined);
      setIsLoading(false);
      // Focus after modal mount.
      setTimeout(() => {
        props.passwordInputRef.current?.focus();
      }, 0);
    }
  }, [props.isOpen, props.passwordInputRef]);

  return (
    <Modal
      isOpen={props.isOpen}
      centered
      toggle={() => {
        if (isLoading) return;
        props.onCancel();
      }}
      backdrop={isLoading ? "static" : true}
      keyboard={!isLoading}
    >
      <ModalBody>
        <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
          Confirm transaction
        </div>
        <div style={{ fontSize: "13px", opacity: 0.8, marginBottom: "12px" }}>
          Enter your wallet password to confirm this Cardano transaction.
        </div>
        {props.isWalletLocked ? (
          <div style={{ fontSize: "12px", opacity: 0.75, marginBottom: "12px" }}>
            This will also unlock your wallet.
          </div>
        ) : null}

        <div
          style={{
            padding: "12px",
            borderRadius: "10px",
            background: "rgba(0,0,0,0.04)",
            marginBottom: "12px",
            fontSize: "13px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ opacity: 0.7 }}>Network</div>
            <div style={{ fontWeight: 600 }}>{props.networkName}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            <div style={{ opacity: 0.7 }}>To</div>
            <div
              style={{
                fontWeight: 600,
                maxWidth: "260px",
                textAlign: "right",
                wordBreak: "break-all",
              }}
            >
              {props.recipient}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            <div style={{ opacity: 0.7 }}>Amount</div>
            <div style={{ fontWeight: 600 }}>{props.amountText}</div>
          </div>
          {props.feeText ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "6px",
              }}
            >
              <div style={{ opacity: 0.7 }}>Fee</div>
              <div style={{ fontWeight: 600 }}>{props.feeText}</div>
            </div>
          ) : null}
          {props.memo ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "6px",
              }}
            >
              <div style={{ opacity: 0.7 }}>Memo</div>
              <div
                style={{
                  fontWeight: 600,
                  maxWidth: "260px",
                  textAlign: "right",
                  wordBreak: "break-word",
                }}
              >
                {props.memo}
              </div>
            </div>
          ) : null}
          {props.isSyncing ? (
            <div style={{ marginTop: "10px", color: "#b8860b", fontWeight: 600 }}>
              Syncing wallet… Please wait
            </div>
          ) : null}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!password) {
              setPasswordError("Password is required");
              return;
            }
            if (props.isSyncing) {
              return;
            }

            setIsLoading(true);
            try {
              await props.onConfirm(password);
              props.onCancel();
            } catch (err: any) {
              const message = `${err?.message ?? ""}`.toLowerCase();
              if (
                message.includes("invalid password") ||
                message.includes("fail to decrypt")
              ) {
                setPasswordError("Invalid password");
              } else if (message.includes("password is required")) {
                setPasswordError("Password is required");
              } else if (message.includes("wallet is syncing")) {
                setPasswordError("Wallet is syncing. Please wait.");
              } else if (message.includes("please unlock wallet first")) {
                setPasswordError("Wallet is locked. Please unlock and try again.");
              } else {
                setPasswordError(undefined);
                props.onNotifyWarning(
                  err?.message ? `Transaction Failed: ${err.message}` : "Transaction Failed"
                );
              }
            } finally {
              setIsLoading(false);
            }
          }}
        >
          <div style={{ marginBottom: "12px" }}>
            <PasswordInput
              placeholder="Password"
              value={password}
              ref={props.passwordInputRef}
              containerStyle={{ width: "100%" }}
              inputStyle={{
                width: "100%",
                minWidth: "100%",
                paddingRight: "42px",
              }}
              onChange={(e: any) => {
                setPassword(e.target.value);
                setPasswordError(undefined);
              }}
              error={passwordError}
            />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <ButtonV2
              variant="dark"
              type="submit"
              text={
                isLoading
                  ? "Confirming..."
                  : props.isSyncing
                    ? "Syncing wallet..."
                    : "Confirm"
              }
              disabled={isLoading || !password || props.isSyncing}
              styleProps={{ flex: 1, height: "44px" }}
            />
            <ButtonV2
              variant="light"
              type="button"
              text="Cancel"
              styleProps={{ flex: 1, height: "44px" }}
              disabled={isLoading}
              onClick={() => {
                if (isLoading) return;
                props.onCancel();
              }}
            />
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
};

interface SendPhase2Props {
  sendConfigs?: any;
  setIsNext?: any;
  isDetachedPage: any;
  trnsxStatus: string;
  fromPhase1: boolean;
  configs: any;
  setFromPhase1: any;
  gasSimulator: any;
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
    gasSimulator,
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
    const [isCardanoSyncing, setIsCardanoSyncing] = useState(false);
    const [cardanoDraft, setCardanoDraft] = useState<{
      draftId: string;
      fee: string;
      total: string;
    } | null>(null);
    const [cardanoDraftError, setCardanoDraftError] = useState<string | null>(
      null
    );
    const [isBuildingCardanoDraft, setIsBuildingCardanoDraft] = useState(false);
    const isCardano = chainStore.current.features?.includes("cardano") ?? false;
    const isEvm = chainStore.current.features?.includes("evm") ?? false;
    const shouldRequireCardanoPassword =
      isCardano && keyRingStore.keyRingType === "mnemonic";
    const [isCardanoPasswordConfirmOpen, setIsCardanoPasswordConfirmOpen] =
      useState(false);
    const passwordInputRef = useRef<HTMLInputElement>(null);
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

    useEffect(() => {
      if (!isCardano) {
        setIsCardanoSyncing(false);
        return;
      }

      let isSubscribed = true;
      let pollInterval: NodeJS.Timeout | null = null;
      
      const checkSync = async () => {
        try {
          if (!isSubscribed) return;
          const messageRequester = new InExtensionMessageRequester();
          const syncStatus = await messageRequester.sendMessage(
            BACKGROUND_PORT,
            new GetCardanoSyncStatusMsg(chainStore.current.chainId)
          );

          if (!isSubscribed) return;

          if (syncStatus?.isSettled) {
            setIsCardanoSyncing(false);
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
          } else {
            setIsCardanoSyncing(true);
          }
        } catch (error) {
          if (isSubscribed) {
            setIsCardanoSyncing(false);
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
          }
        }
      };

      setIsCardanoSyncing(true);
      checkSync();
      pollInterval = setInterval(checkSync, 2000);
      
      return () => {
        isSubscribed = false;
        if (pollInterval) {
          clearInterval(pollInterval);
        }
      };
    }, [isCardano, chainStore.current.chainId]);

    const sendConfigError =
      sendConfigs.recipientConfig.error ??
      sendConfigs.amountConfig.error ??
      sendConfigs.memoConfig.error ??
      (isCardano
        ? cardanoDraftError
          ? new Error(cardanoDraftError)
          : !cardanoDraft && !isBuildingCardanoDraft
          ? new Error("Transaction is not ready")
          : undefined
        : sendConfigs.gasConfig.error ?? sendConfigs.feeConfig.error);
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

    const formatLovelaceToAda = (lovelace: string) => {
      try {
        const v = BigInt(lovelace || "0");
        const oneMillion = BigInt(1000000);
        const whole = v / oneMillion;
        const frac = v % oneMillion;
        const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
        return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
      } catch {
        return "0";
      }
    };

    useEffect(() => {
      // Close the confirm modal if Cardano context changes underneath (chain switch / key type switch).
      if (isCardanoPasswordConfirmOpen && !shouldRequireCardanoPassword) {
        setIsCardanoPasswordConfirmOpen(false);
      }
    }, [isCardanoPasswordConfirmOpen, shouldRequireCardanoPassword]);

    useEffect(() => {
      if (!isCardano) {
        if (cardanoDraft?.draftId) {
          const requester = new InExtensionMessageRequester();
          requester.sendMessage(
            BACKGROUND_PORT,
            new DiscardSendAdaTxDraftMsg(cardanoDraft.draftId)
          );
        }
        setCardanoDraft(null);
        setCardanoDraftError(null);
        setIsBuildingCardanoDraft(false);
        return;
      }

      if (isCardanoSyncing) {
        return;
      }

      const recipient = sendConfigs?.recipientConfig?.recipient ?? "";
      const amountStr = sendConfigs?.amountConfig?.amount ?? "";
      const memo = sendConfigs?.memoConfig?.memo ?? "";
      const decimals = sendConfigs?.amountConfig?.sendCurrency?.coinDecimals ?? 6;

      if (!recipient || !amountStr) {
        setCardanoDraft(null);
        setCardanoDraftError(null);
        setIsBuildingCardanoDraft(false);
        return;
      }

      let cancelled = false;
      const timeoutId = setTimeout(async () => {
        try {
          setIsBuildingCardanoDraft(true);
          setCardanoDraftError(null);

          const lovelaceAmount = parseAmount(amountStr, decimals).toString();
          const requester = new InExtensionMessageRequester();
          const res = await requester.sendMessage(
            BACKGROUND_PORT,
            new BuildSendAdaTxDraftMsg(
              recipient,
              lovelaceAmount,
              memo,
              chainStore.current.chainId
            )
          );

          if (cancelled) return;

          if (cardanoDraft?.draftId) {
            requester.sendMessage(
              BACKGROUND_PORT,
              new DiscardSendAdaTxDraftMsg(cardanoDraft.draftId)
            );
          }

          setCardanoDraft(res ?? null);
          setCardanoDraftError(null);
        } catch (e: any) {
          if (!cancelled) {
            setCardanoDraft(null);
            setCardanoDraftError(e?.message ?? "Failed to build transaction");
          }
        } finally {
          if (!cancelled) {
            setIsBuildingCardanoDraft(false);
          }
        }
      }, 300);

      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      isCardano,
      isCardanoSyncing,
      chainStore.current.chainId,
      sendConfigs?.recipientConfig?.recipient,
      sendConfigs?.amountConfig?.amount,
      sendConfigs?.amountConfig?.sendCurrency?.coinDecimals,
      sendConfigs?.memoConfig?.memo,
    ]);

    const feeText = (() => {
      try {
        if (isCardano && cardanoDraft?.fee) {
          return `${formatLovelaceToAda(cardanoDraft.fee)} ADA`;
        }
        const fee = sendConfigs?.feeConfig?.fee;
        if (fee && typeof fee.toString === "function") {
          return fee.toString();
        }
      } catch {
        // noop
      }
      return "";
    })();

    const doSend = async (options?: { cardanoSpendingPassword?: string }) => {
      try {
        analyticsStore.logEvent("send_txn_click", { pageName: "Send" });
        if (isCardano) {
          if (!cardanoDraft?.draftId) {
            throw new Error(cardanoDraftError || "Transaction is not ready");
          }

          const requester = new InExtensionMessageRequester();
          const msg = shouldRequireCardanoPassword
            ? new SubmitSendAdaTxDraftWithPasswordMsg(
                cardanoDraft.draftId,
                options?.cardanoSpendingPassword || "",
                chainStore.current.chainId
              )
            : new SubmitSendAdaTxDraftMsg(
                cardanoDraft.draftId,
                chainStore.current.chainId
              );

          await requester.sendMessage(BACKGROUND_PORT, msg);

          analyticsStore.logEvent("send_txn_broadcasted", {
            chainId: chainStore.current.chainId,
            chainName: chainStore.current.chainName,
            feeType: sendConfigs.feeConfig.feeType,
          });

          navigate("/send", {
            replace: true,
            state: { trnsxStatus: "pending", isNext: true },
          });
          notification.push({
            type: "primary",
            placement: "top-center",
            duration: 2,
            content: `Transaction broadcasted`,
            canDelete: true,
            transition: { duration: 0.25 },
          });

          if (keyRingStore.keyRingType === "ledger") {
            navigate("/send");
          }
          if (isDetachedPage) {
            window.close();
          }

          return;
        }

        const stdFee = sendConfigs.feeConfig.toStdFee();

        const tx = accountInfo.makeSendTokenTx(
          sendConfigs.amountConfig.amount,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          sendConfigs.amountConfig.sendCurrency!,
          sendConfigs.recipientConfig.recipient
        );

        if (shouldRequireCardanoPassword && !options?.cardanoSpendingPassword) {
          throw new Error("Password is required");
        }

        const signOptions = shouldRequireCardanoPassword
          ? ({
              preferNoSetFee: true,
              preferNoSetMemo: true,
              cardano: {
                spendingPassword: options?.cardanoSpendingPassword,
              },
            } satisfies CardanoSignOptions)
          : {
              preferNoSetFee: true,
              preferNoSetMemo: true,
            };

        await tx.send(stdFee, sendConfigs.memoConfig.memo, signOptions, {
          onBroadcastFailed: () => {
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
            if (isDetachedPage) {
              window.close();
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
        });

        if (!isDetachedPage) {
          const currentPathName = getPathname();
          if (currentPathName === "send" || currentPathName === "sign") {
            navigate("/send", {
              replace: true,
              state: { trnsxStatus: "pending", isNext: true },
            });
          }
        }
      } finally {
        // noop
      }
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
          {isCardano ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 16px",
                borderRadius: "12px",
                background: "var(--card-bg)",
                border: "1px solid var(--border-grey)",
              }}
            >
              <div style={{ opacity: 0.7 }}>Fee</div>
              <div style={{ fontWeight: 600 }}>
                {isBuildingCardanoDraft ? "Calculating..." : feeText || "-"}
              </div>
            </div>
          ) : (
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
          )}
        </div>
        {isCardanoSyncing && (
          <div style={{
            textAlign: "center",
            padding: "12px",
            marginBottom: "8px",
            background: "rgba(255, 193, 7, 0.1)",
            border: "1px solid rgba(255, 193, 7, 0.3)",
            borderRadius: "8px",
            fontSize: "14px",
            color: "#ffc107"
          }}>
            <i className="fas fa-sync fa-spin" style={{ marginRight: "8px" }} />
            Syncing Cardano wallet... Please wait
          </div>
        )}
        <ButtonV2
          variant="dark"
          type="button"
          text={isCardanoSyncing ? "Syncing wallet..." : "Review transaction"}
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
            if (accountInfo.isReadyToSendMsgs && txStateIsValid && !isCardanoSyncing) {
              if (shouldRequireCardanoPassword) {
                setIsCardanoPasswordConfirmOpen(true);
                return;
              }

              try {
                await doSend();
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
              }
            }
          }}
          data-loading={accountInfo.isSendingMsg === "send"}
          disabled={!accountInfo.isReadyToSendMsgs || !txStateIsValid || isCardanoSyncing}
          btnBgEnabled={true}
        >
          {activityStore.getPendingTxnTypes[TXNTYPE.send] && (
            <i className="fas fa-spinner fa-spin ml-2 mr-2" />
          )}
        </ButtonV2>

        <CardanoPasswordConfirmModal
          isOpen={isCardanoPasswordConfirmOpen && shouldRequireCardanoPassword}
          isSyncing={isCardanoSyncing}
          feeText={feeText}
          isWalletLocked={keyRingStore.status === KeyRingStatus.LOCKED}
          networkName={chainStore.current.chainName}
          recipient={sendConfigs.recipientConfig.recipient}
          amountText={`${sendConfigs.amountConfig.amount} ${sendConfigs.amountConfig.sendCurrency.coinDenom}`}
          memo={sendConfigs.memoConfig.memo}
          passwordInputRef={passwordInputRef}
          onConfirm={async (password) => {
            if (keyRingStore.status === KeyRingStatus.LOCKED) {
              await keyRingStore.unlock(password);
            }

            await doSend({ cardanoSpendingPassword: password });
          }}
          onCancel={() => {
            setIsCardanoPasswordConfirmOpen(false);
          }}
          onNotifyWarning={(content) => {
            notification.push({
              type: "warning",
              placement: "top-center",
              duration: 5,
              content,
              canDelete: true,
              transition: {
                duration: 0.25,
              },
            });
          }}
        />

        {trnsxStatus !== undefined && (
          <TransxStatus
            status={trnsxStatus}
            onClose={() => {
              navigate("/activity", { replace: true });
            }}
          />
        )}
      </div>
    );
  }
);
