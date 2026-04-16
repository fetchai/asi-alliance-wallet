import React, { useEffect, useRef, useState } from "react";
import style from "./style.module.scss";
import { useIntl } from "react-intl";
import { AddressInput, MemoInput, PasswordInput } from "@components-v2/form";
import { useStore } from "../../stores";
import { ButtonV2 } from "@components-v2/buttons/button";
import { useLocation, useNavigate } from "react-router";
import { useLanguage } from "../../languages";
import { CoinPretty, Int } from "@keplr-wallet/unit";
import { observer } from "mobx-react-lite";
import {
  TransxStatus,
  type CardanoSendTxTracking,
} from "@components-v2/transx-status";
import { TXNTYPE } from "../../config";
import { FeeButtons } from "@components-v2/form/fee-buttons-v2";
import { useNotification } from "@components/notification";
import { useNetwork } from "../../hooks";
import { navigateOnTxnEvents } from "@utils/navigate-txn-event";
import { getPathname } from "@utils/pathname";
import { formatDisplayAmount } from "@utils/format";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import {
  BuildSendAdaTxDraftMsg,
  CardanoServiceState,
  CardanoSyncStatusResponse,
  DiscardSendAdaTxDraftMsg,
  GetCardanoSyncStatusMsg,
  KeyRingStatus,
  SubmitSendAdaTxDraftMsg,
  SubmitSendAdaTxDraftWithPasswordMsg,
} from "@keplr-wallet/background";
import type { BuildSendAdaTxDraftResult } from "@keplr-wallet/background";
import { DenomHelper } from "@keplr-wallet/common";
import { CARDANO_NATIVE_TOKEN_TYPE } from "@keplr-wallet/stores";
import {
  CARDANO_SEND_CONFLICT_PENDING_MESSAGE,
  lovelacesToAdaString,
} from "@keplr-wallet/cardano";
import { Modal, ModalBody } from "reactstrap";
import type { KeplrSignOptions } from "@keplr-wallet/types";
import {
  getBannerValidationError,
  getCardanoPasswordModalInlineError,
  getHighestPriorityNonRecipientBlockingError,
  isCardanoSendDraftInputsReady,
  isCardanoSendOperationalGuard,
  isPositiveDecimalAmount,
  isOnlyEmptyRecipientBlocking,
  isReviewTransactionButtonDisabled,
  normalizeCardanoDraftError,
  formatAdaMinimumViolationMessageFromRawFields,
  parseAmountToBaseUnits,
  parseCardanoUiErrorMessage,
  shouldNavigateCardanoFailedFromError,
  shouldPushCardanoFailedWarningFromModal,
  shouldEnableReviewWhenInvalid,
} from "./send-phase-2-helpers";
import { removeComma } from "@utils/format";

interface SendPhase2Props {
  sendConfigs?: any;
  setIsNext?: any;
  isDetachedPage: any;
  trnsxStatus: string;
  fromPhase1: boolean;
  configs: any;
  setFromPhase1: any;
  gasSimulator: any;
  balance: CoinPretty;
}

type CardanoSignOptions = KeplrSignOptions & {
  cardano?: { spendingPassword?: string };
};

const isSelfSendRecipient = ({
  recipient,
  isEvm,
  bech32Address,
  ethereumHexAddress,
}: {
  recipient: string;
  isEvm: boolean;
  bech32Address?: string | null;
  ethereumHexAddress?: string | null;
}): boolean => {
  if (recipient.length === 0) {
    return false;
  }

  if (isEvm) {
    return (
      ethereumHexAddress != null &&
      recipient.toLowerCase() === ethereumHexAddress.trim().toLowerCase()
    );
  }

  return bech32Address != null && recipient === bech32Address.trim();
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const maybeObj = error as
    | {
        message?: unknown;
        details?: unknown;
        response?: { data?: { message?: unknown } };
      }
    | undefined;
  const responseMessage = maybeObj?.response?.data?.message;
  if (
    typeof responseMessage === "string" &&
    responseMessage.trim().length > 0
  ) {
    return responseMessage;
  }
  const details = maybeObj?.details;
  if (typeof details === "string" && details.trim().length > 0) {
    return details;
  }
  const message = maybeObj?.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  return "Transaction failed";
};

type CardanoPasswordConfirmModalProps = {
  isOpen: boolean;
  isSyncing: boolean;
  /** When set, shown instead of syncing message (e.g. offline). Lace-style: offline vs syncing. */
  statusMessage?: string;
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

const CardanoPasswordConfirmModal: React.FC<
  CardanoPasswordConfirmModalProps
> = (props) => {
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
          <div
            style={{ fontSize: "12px", opacity: 0.75, marginBottom: "12px" }}
          >
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "6px",
            }}
          >
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "6px",
            }}
          >
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
          {props.isSyncing || props.statusMessage ? (
            <div
              style={{ marginTop: "10px", color: "#b8860b", fontWeight: 600 }}
            >
              {props.statusMessage ?? "Syncing wallet… Please wait"}
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
            if (props.isSyncing || props.statusMessage) {
              return;
            }

            setIsLoading(true);
            try {
              await props.onConfirm(password);
              props.onCancel();
            } catch (err: any) {
              const parsedError = parseCardanoUiErrorMessage(
                getErrorMessage(err)
              );
              const messageText = parsedError.message;
              const inlineError = getCardanoPasswordModalInlineError({
                parsedCode: parsedError.code,
                message: messageText,
                syncingMessage: props.statusMessage,
              });
              if (inlineError) {
                setPasswordError(inlineError);
              } else {
                setPasswordError(undefined);
                if (
                  shouldPushCardanoFailedWarningFromModal({
                    parsedCode: parsedError.code,
                    message: messageText,
                  })
                ) {
                  props.onNotifyWarning(`Transaction Failed: ${messageText}`);
                }
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
            <ButtonV2
              variant="dark"
              type="submit"
              text={
                isLoading
                  ? "Confirming..."
                  : props.isSyncing || props.statusMessage
                  ? "Syncing wallet..."
                  : "Confirm"
              }
              disabled={
                isLoading ||
                !password ||
                props.isSyncing ||
                !!props.statusMessage
              }
              styleProps={{ flex: 1, height: "44px" }}
            />
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
};

export const SendPhase2: React.FC<SendPhase2Props> = observer(
  ({
    sendConfigs,
    isDetachedPage,
    setIsNext,
    trnsxStatus,
    fromPhase1,
    configs,
    balance,
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
    const sendRouteState = (location.state || {}) as {
      isFromPhase1?: boolean;
      cardanoPendingTxId?: string;
      isMaxAmount?: boolean;
      cardanoPendingChainId?: string;
      isCardanoTracking?: boolean;
    };
    const { isFromPhase1, isMaxAmount } = sendRouteState;
    const cardanoSendTxTracking: CardanoSendTxTracking | undefined =
      sendRouteState.isCardanoTracking === true &&
      sendRouteState.cardanoPendingTxId &&
      sendRouteState.cardanoPendingChainId
        ? {
            txId: sendRouteState.cardanoPendingTxId,
            chainId: sendRouteState.cardanoPendingChainId,
            active: true,
          }
        : undefined;
    const language = useLanguage();
    const fiatCurrency = language.fiatCurrency;
    const { isOnline } = useNetwork();
    const [isCardanoSyncing, setIsCardanoSyncing] = useState(false);
    const [hasCardanoOutgoingPending, setHasCardanoOutgoingPending] =
      useState(false);
    const [cardanoSyncState, setCardanoSyncState] =
      useState<CardanoServiceState | null>(null);
    const [cardanoDraft, setCardanoDraft] = useState<{
      draftId: string;
      fee: string;
      total: string;
      minAdaForTokens?: string;
    } | null>(null);
    const [cardanoDraftError, setCardanoDraftError] = useState<string | null>(
      null
    );
    const [cardanoMinViolation, setCardanoMinViolation] = useState<{
      minimumOutputLovelace: string;
      coinMissingLovelace: string;
    } | null>(null);
    const [isBuildingCardanoDraft, setIsBuildingCardanoDraft] = useState(false);
    const [recipientTouched, setRecipientTouched] = useState(false);
    const [reviewAttempted, setReviewAttempted] = useState(false);
    const isCardano = chainStore.current.features?.includes("cardano") ?? false;
    const isEvm = chainStore.current.features?.includes("evm") ?? false;
    const cardanoDenom = chainStore.current.stakeCurrency.coinDenom;
    const nativeAdaCoinDecimals = chainStore.current.stakeCurrency.coinDecimals;
    const sendCurrency = sendConfigs?.amountConfig?.sendCurrency;
    const sendCurrencyCoinDecimals =
      sendCurrency?.coinDecimals ?? nativeAdaCoinDecimals;
    const sendCurrencyDenom = sendCurrency?.coinDenom ?? cardanoDenom;
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
    const cardanoOfflineMessage = intl.formatMessage({
      id: "cardano.status.offline",
    });
    const cardanoStatusMessage = !isOnline
      ? cardanoOfflineMessage
      : cardanoSyncState === "temporarily_unavailable"
      ? "Wallet is initializing. Please wait"
      : cardanoSyncState === "provider_error"
      ? cardanoDraftError || "Cardano provider unavailable"
      : isCardanoSyncing
      ? "Syncing wallet… Please wait"
      : undefined;

    useEffect(() => {
      if (isFromPhase1 !== undefined) setFromPhase1(isFromPhase1);
      if (configs?.amount && !fromPhase1 && sendConfigs) {
        sendConfigs.amountConfig.setAmount(configs.amount);
        sendConfigs.amountConfig.setSendCurrency(configs.sendCurr);
      }
    }, [configs, fromPhase1, sendConfigs]);

    useEffect(() => {
      if (!isCardano) {
        setCardanoSyncState(null);
        setIsCardanoSyncing(false);
        setHasCardanoOutgoingPending(false);
        return;
      }

      let isSubscribed = true;
      let pollEpoch = 0;
      let pollTimeout: ReturnType<typeof setTimeout> | null = null;

      const clearPollTimeout = () => {
        if (pollTimeout != null) {
          clearTimeout(pollTimeout);
          pollTimeout = null;
        }
      };

      const runPoll = async () => {
        const myEpoch = ++pollEpoch;
        try {
          if (!isSubscribed) return;
          const messageRequester = new InExtensionMessageRequester();
          const syncStatus = (await messageRequester.sendMessage(
            BACKGROUND_PORT,
            new GetCardanoSyncStatusMsg(chainStore.current.chainId)
          )) as CardanoSyncStatusResponse;

          if (!isSubscribed || myEpoch !== pollEpoch) return;

          const state = syncStatus?.state;
          setCardanoSyncState(state ?? null);
          const hasPending = syncStatus?.hasOutgoingPendingSpend === true;
          setHasCardanoOutgoingPending(hasPending);
          if (
            state === "ready_with_data" &&
            syncStatus?.isSettled &&
            !hasPending
          ) {
            setIsCardanoSyncing(false);
            return;
          }
          setIsCardanoSyncing(
            state === "syncing" || state === "temporarily_unavailable"
          );
          if (isSubscribed && myEpoch === pollEpoch) {
            clearPollTimeout();
            pollTimeout = setTimeout(() => {
              pollTimeout = null;
              void runPoll();
            }, 2000);
          }
        } catch {
          if (!isSubscribed || myEpoch !== pollEpoch) return;
          // Keep last known pending flag on transport/poll errors (avoid brief false unlock).
          clearPollTimeout();
          pollTimeout = setTimeout(() => {
            pollTimeout = null;
            void runPoll();
          }, 2000);
        }
      };

      setIsCardanoSyncing(true);
      void runPoll();

      return () => {
        isSubscribed = false;
        pollEpoch++;
        setHasCardanoOutgoingPending(false);
        clearPollTimeout();
      };
    }, [isCardano, chainStore.current.chainId]);

    const normalizedCardanoDraftError =
      cardanoMinViolation != null
        ? formatAdaMinimumViolationMessageFromRawFields({
            minimumOutputLovelace: cardanoMinViolation.minimumOutputLovelace,
            coinMissingLovelace: cardanoMinViolation.coinMissingLovelace,
            cardanoDenom,
            nativeAdaCoinDecimals,
          })
        : normalizeCardanoDraftError({
            rawError: cardanoDraftError,
            cardanoDenom,
            sendCurrencyDenom,
            sendCurrencyCoinDecimals,
            nativeAdaCoinDecimals,
          });

    const cardanoOperationalGuard = isCardanoSendOperationalGuard({
      isCardano,
      isOnline,
      isCardanoSyncing,
      hasOutgoingPendingSpend: hasCardanoOutgoingPending,
    });

    const cardanoDraftInputsReady = isCardanoSendDraftInputsReady({
      recipient: sendConfigs.recipientConfig.recipient ?? "",
      recipientError: sendConfigs.recipientConfig.error,
      amount: sendConfigs.amountConfig.amount ?? "",
    });

    const postRecipientError = getHighestPriorityNonRecipientBlockingError({
      amountError: sendConfigs.amountConfig.error,
      memoError: sendConfigs.memoConfig.error,
      isCardano,
      normalizedCardanoDraftError,
      cardanoDraft,
      isBuildingCardanoDraft,
      cardanoOperationalGuard,
      cardanoDraftInputsReady,
      gasError: sendConfigs.gasConfig.error,
      feeError: sendConfigs.feeConfig.error,
    });

    const sendConfigError =
      sendConfigs.recipientConfig.error ??
      sendConfigs.amountConfig.error ??
      sendConfigs.memoConfig.error ??
      (isCardano
        ? normalizedCardanoDraftError
          ? new Error(normalizedCardanoDraftError)
          : !cardanoDraft &&
            !isBuildingCardanoDraft &&
            !cardanoOperationalGuard &&
            cardanoDraftInputsReady
          ? new Error("Transaction is not ready")
          : undefined
        : sendConfigs.gasConfig.error ?? sendConfigs.feeConfig.error);
    const txStateIsValid = sendConfigError == null;

    const onlyEmptyRecipientBlocking = isOnlyEmptyRecipientBlocking(
      sendConfigs.recipientConfig.error,
      postRecipientError
    );

    const bannerValidationError = getBannerValidationError({
      sendConfigError,
      recipientError: sendConfigs.recipientConfig.error,
      postRecipientError,
      recipientTouched,
      reviewAttempted,
    });

    const reviewOperationalDisabled =
      !accountInfo.isReadyToSendMsgs || (isCardano && cardanoOperationalGuard);

    const reviewButtonDisabled = isReviewTransactionButtonDisabled({
      operationalDisabled: reviewOperationalDisabled,
      txStateIsValid,
      onlyEmptyRecipientBlocking,
      recipientTouched,
      reviewAttempted,
    });

    const recipient = sendConfigs.recipientConfig.recipient?.trim() ?? "";
    const hasNoRecipientError = sendConfigs.recipientConfig.error == null;
    const isSelfSend =
      recipient.length > 0 &&
      hasNoRecipientError &&
      isSelfSendRecipient({
        recipient,
        isEvm,
        bech32Address: accountInfo.bech32Address,
        ethereumHexAddress: accountInfo.ethereumHexAddress,
      });

    const selfSendWarningText = intl.formatMessage({
      id: "send.self-send-warning",
      defaultMessage:
        "You are sending to your own address. Only fees will be deducted.",
    });

    const decimals = sendConfigs.amountConfig.sendCurrency.coinDecimals;
    const formattedDisplayAmount = formatDisplayAmount(
      sendConfigs.amountConfig.amount ?? "",
      { coinDecimals: decimals }
    );

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
          void requester
            .sendMessage(
              BACKGROUND_PORT,
              new DiscardSendAdaTxDraftMsg(cardanoDraft.draftId)
            )
            .catch(() => {});
        }
        setCardanoDraft(null);
        setCardanoDraftError(null);
        setCardanoMinViolation(null);
        setIsBuildingCardanoDraft(false);
        return;
      }

      if (isCardanoSyncing) {
        return;
      }

      const normalizedRecipient =
        sendConfigs?.recipientConfig?.recipient?.trim?.() ?? "";
      const recipientError = sendConfigs?.recipientConfig?.error;
      const amountStr = sendConfigs?.amountConfig?.amount ?? "";
      const memo = sendConfigs?.memoConfig?.memo ?? "";
      const amountError = sendConfigs?.amountConfig?.error;
      const memoError = sendConfigs?.memoConfig?.error;
      const sendCurrency = sendConfigs?.amountConfig?.sendCurrency;
      const decimals = sendCurrency?.coinDecimals ?? nativeAdaCoinDecimals;
      const denomHelper = sendCurrency
        ? new DenomHelper(sendCurrency.coinMinimalDenom)
        : null;
      const isTokenSend = denomHelper?.type === CARDANO_NATIVE_TOKEN_TYPE;
      const safeDiscardDraft = (
        requester: InExtensionMessageRequester,
        draftId: string | undefined
      ) => {
        if (!draftId) return;
        void requester
          .sendMessage(BACKGROUND_PORT, new DiscardSendAdaTxDraftMsg(draftId))
          .catch(() => {});
      };

      if (!normalizedRecipient || !amountStr || recipientError) {
        const requesterEarly = new InExtensionMessageRequester();
        safeDiscardDraft(requesterEarly, cardanoDraft?.draftId);
        setCardanoDraft(null);
        setCardanoDraftError(null);
        setCardanoMinViolation(null);
        setIsBuildingCardanoDraft(false);
        return;
      }

      let cancelled = false;
      const timeoutId = setTimeout(async () => {
        try {
          const requester = new InExtensionMessageRequester();
          const clearCurrentDraft = () => {
            safeDiscardDraft(requester, cardanoDraft?.draftId);
            setCardanoDraft(null);
          };

          const baseAmountBigInt = parseAmountToBaseUnits(amountStr, decimals);
          const hasNoAmountOrMemoError =
            amountError == null && memoError == null;
          const hasPositiveDecimalAmount = isPositiveDecimalAmount(amountStr);
          const isSubLovelaceAmount =
            !isTokenSend &&
            hasNoAmountOrMemoError &&
            hasPositiveDecimalAmount &&
            baseAmountBigInt === BigInt(0);
          const isTokenDustAmount =
            isTokenSend &&
            hasNoAmountOrMemoError &&
            hasPositiveDecimalAmount &&
            baseAmountBigInt === BigInt(0);

          if (isTokenDustAmount) {
            clearCurrentDraft();
            setCardanoMinViolation(null);
            setCardanoDraftError(
              normalizeCardanoDraftError({
                rawError: "asset amount must be positive",
                cardanoDenom,
                sendCurrencyDenom: sendCurrency?.coinDenom,
                sendCurrencyCoinDecimals: decimals,
                nativeAdaCoinDecimals,
              })
            );
            setIsBuildingCardanoDraft(false);
            return;
          }

          setIsBuildingCardanoDraft(true);
          setCardanoDraftError(null);
          setCardanoMinViolation(null);
          const baseAmount = baseAmountBigInt.toString();
          // For token sends, ADA amount is "0" and token goes into assets
          const lovelaceAmount = isTokenSend ? "0" : baseAmount;
          const assets =
            isTokenSend && denomHelper
              ? [{ assetId: denomHelper.contractAddress, amount: baseAmount }]
              : undefined;

          const draftMsg = new BuildSendAdaTxDraftMsg(
            normalizedRecipient,
            lovelaceAmount,
            memo,
            chainStore.current.chainId,
            assets,
            isSubLovelaceAmount
          );
          const res = (await requester.sendMessage(
            BACKGROUND_PORT,
            draftMsg
          )) as BuildSendAdaTxDraftResult | null;

          if (cancelled) {
            if (res?.kind === "draft") {
              safeDiscardDraft(requester, res.draftId);
            }
            return;
          }

          safeDiscardDraft(requester, cardanoDraft?.draftId);

          if (res?.kind === "minimum_violation") {
            setCardanoDraft(null);
            setCardanoMinViolation({
              minimumOutputLovelace: res.minimumOutputLovelace,
              coinMissingLovelace: res.coinMissingLovelace,
            });
            setCardanoDraftError(null);
          } else if (res?.kind === "draft") {
            setCardanoMinViolation(null);
            setCardanoDraft({
              draftId: res.draftId,
              fee: res.fee,
              total: res.total,
              minAdaForTokens: res.minAdaForTokens,
            });
            setCardanoDraftError(null);
          } else {
            setCardanoMinViolation(null);
            setCardanoDraft(null);
            setCardanoDraftError(null);
          }
        } catch (e: any) {
          if (!cancelled) {
            const requesterCatch = new InExtensionMessageRequester();
            safeDiscardDraft(requesterCatch, cardanoDraft?.draftId);
            setCardanoDraft(null);
            setCardanoMinViolation(null);
            const message = e?.message ?? "Failed to build transaction";
            setCardanoDraftError(
              normalizeCardanoDraftError({
                rawError: message,
                cardanoDenom,
                sendCurrencyDenom: sendCurrency?.coinDenom,
                sendCurrencyCoinDecimals: decimals,
                nativeAdaCoinDecimals,
              })
            );
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
      sendConfigs?.recipientConfig?.error,
      sendConfigs?.amountConfig?.amount,
      sendConfigs?.amountConfig?.sendCurrency?.coinDecimals,
      sendConfigs?.amountConfig?.sendCurrency?.coinMinimalDenom,
      sendConfigs?.memoConfig?.memo,
      sendConfigs?.memoConfig?.error,
      sendConfigs?.amountConfig?.error,
      chainStore.current.stakeCurrency.coinDecimals,
    ]);

    const feeText = (() => {
      try {
        if (isCardano && cardanoDraft?.fee) {
          const feeAda = lovelacesToAdaString(cardanoDraft.fee);
          if (
            cardanoDraft.minAdaForTokens &&
            cardanoDraft.minAdaForTokens !== "0"
          ) {
            const minAda = lovelacesToAdaString(cardanoDraft.minAdaForTokens);
            return `${feeAda} ${cardanoDenom} (+ ${minAda} ${cardanoDenom} min ADA)`;
          }
          return `${feeAda} ${cardanoDenom}`;
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
            throw new Error(
              normalizedCardanoDraftError || "Transaction is not ready"
            );
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

          const txId = (await requester.sendMessage(
            BACKGROUND_PORT,
            msg
          )) as string;

          analyticsStore.logEvent("send_txn_broadcasted", {
            chainId: chainStore.current.chainId,
            chainName: chainStore.current.chainName,
            feeType: sendConfigs.feeConfig.feeType,
          });

          navigate("/send", {
            replace: true,
            state: {
              trnsxStatus: "pending",
              isNext: true,
              cardanoPendingTxId: txId,
              cardanoPendingChainId: chainStore.current.chainId,
              isCardanoTracking: true,
            },
          });
          notification.push({
            type: "primary",
            placement: "top-center",
            duration: 2,
            content: `Transaction broadcasted`,
            canDelete: true,
            transition: { duration: 0.25 },
          });

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
      } catch (e: any) {
        if (isCardano) {
          const errorMessage = getErrorMessage(e);
          const parsedError = parseCardanoUiErrorMessage(errorMessage);
          const shouldNavigateToFailed = shouldNavigateCardanoFailedFromError({
            isFromPasswordModal: options?.cardanoSpendingPassword !== undefined,
            errorMessage: errorMessage,
          });
          if (!shouldNavigateToFailed) {
            throw e;
          }
          analyticsStore.logEvent("send_txn_broadcasted_fail", {
            chainId: chainStore.current.chainId,
            chainName: chainStore.current.chainName,
            feeType: sendConfigs.feeConfig.feeType,
            message: errorMessage,
          });

          const currentPathName = getPathname();
          if (
            !isDetachedPage &&
            (currentPathName === "send" || currentPathName === "sign")
          ) {
            navigate("/send", {
              replace: true,
              state: { trnsxStatus: "failed", isNext: true },
            });
          }

          notification.push({
            type: "warning",
            placement: "top-center",
            duration: 5,
            content: `Transaction Failed: ${parsedError.message}`,
            canDelete: true,
            transition: {
              duration: 0.25,
            },
          });
          return;
        }
        throw e;
      }
    };

    useEffect(() => {
      const fee = sendConfigs.feeConfig.fee;
      if (!fee || !balance) return;

      const maxAmount = balance.sub(fee);
      if (maxAmount.toDec().isNegative()) return;

      if (isMaxAmount) {
        sendConfigs.amountConfig.setAmount(
          removeComma(maxAmount.shrink(true).hideDenom(true).toString())
        );
      }
    }, [
      isMaxAmount,
      sendConfigs.feeConfig.fee,
      sendConfigs.feeConfig.feeType,
      balance,
    ]);

    return (
      <div>
        <div className={style["editCard"]}>
          <div>
            <div className={style["amountInUsd"]}>
              {convertToUsd(
                sendConfigs.amountConfig
                  ? new CoinPretty(
                      sendConfigs.amountConfig?.sendCurrency,
                      parseAmountToBaseUnits(
                        sendConfigs.amountConfig.amount,
                        decimals
                      )
                    )
                  : new CoinPretty(
                      sendConfigs.amountConfig?.sendCurrency,
                      new Int(0)
                    )
              )}{" "}
              {fiatCurrency.toUpperCase()}
            </div>
            <div className={style["amount"]}>
              {formattedDisplayAmount}{" "}
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
          onRecipientBlur={() => setRecipientTouched(true)}
          warningText={isSelfSend ? selfSendWarningText : undefined}
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
            <React.Fragment>
              <div
                style={{
                  color: "var(--font-secondary, #737676)",
                  fontFamily: "inherit",
                  fontSize: "14px",
                  fontWeight: 400,
                  lineHeight: "24px",
                }}
              >
                Fee
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 18px",
                  height: "48px",
                  borderRadius: "12px",
                  background: "transparent",
                  border: "1.5px solid var(--border-grey, #d0d1d1)",
                  boxSizing: "border-box",
                  fontSize: "14px",
                  fontWeight: 400,
                  color: "var(--font-dark, #f0f0f0)",
                }}
              >
                {isBuildingCardanoDraft ? "Calculating..." : feeText || "-"}
              </div>
            </React.Fragment>
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
        {bannerValidationError && !isBuildingCardanoDraft && (
          <div
            style={{
              textAlign: "center",
              padding: "12px",
              marginBottom: "8px",
              background: "rgba(220, 53, 69, 0.1)",
              border: "1px solid rgba(220, 53, 69, 0.3)",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#dc3545",
            }}
          >
            <i
              className="fas fa-exclamation-circle"
              style={{ marginRight: "8px" }}
            />
            {bannerValidationError.message}
          </div>
        )}
        {isCardano && cardanoOperationalGuard && (
          <div
            style={{
              textAlign: "center",
              padding: "12px",
              marginBottom: "8px",
              background: "rgba(255, 193, 7, 0.1)",
              border: "1px solid rgba(255, 193, 7, 0.3)",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#ffc107",
            }}
          >
            {!isOnline ? (
              <React.Fragment>
                <i className="fas fa-wifi" style={{ marginRight: "8px" }} />
                {cardanoOfflineMessage}
              </React.Fragment>
            ) : hasCardanoOutgoingPending ? (
              <React.Fragment>
                <i className="fas fa-clock" style={{ marginRight: "8px" }} />
                {CARDANO_SEND_CONFLICT_PENDING_MESSAGE}
              </React.Fragment>
            ) : (
              <React.Fragment>
                <i
                  className="fas fa-sync fa-spin"
                  style={{ marginRight: "8px" }}
                />
                Syncing Cardano wallet... Please wait
              </React.Fragment>
            )}
          </div>
        )}
        <ButtonV2
          variant="dark"
          type="button"
          text={
            isCardano && cardanoOperationalGuard
              ? !isOnline
                ? cardanoOfflineMessage
                : hasCardanoOutgoingPending
                ? CARDANO_SEND_CONFLICT_PENDING_MESSAGE
                : "Syncing wallet..."
              : "Review Transaction"
          }
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
            if (
              shouldEnableReviewWhenInvalid({
                onlyEmptyRecipientBlocking,
                recipientTouched,
                reviewAttempted,
              })
            ) {
              setReviewAttempted(true);
              return;
            }
            if (
              accountInfo.isReadyToSendMsgs &&
              txStateIsValid &&
              !(isCardano && cardanoOperationalGuard)
            ) {
              if (shouldRequireCardanoPassword) {
                setIsCardanoPasswordConfirmOpen(true);
                return;
              }

              try {
                await doSend();
              } catch (e: any) {
                const errorMessage = getErrorMessage(e);
                analyticsStore.logEvent("send_txn_broadcasted_fail", {
                  chainId: chainStore.current.chainId,
                  chainName: chainStore.current.chainName,
                  feeType: sendConfigs.feeConfig.feeType,
                  message: errorMessage,
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
                }
                notification.push({
                  type: "warning",
                  placement: "top-center",
                  duration: 5,
                  content: `Transaction Failed: ${errorMessage}`,
                  canDelete: true,
                  transition: {
                    duration: 0.25,
                  },
                });
              }
            }
          }}
          data-loading={accountInfo.isSendingMsg === "send"}
          disabled={reviewButtonDisabled}
          btnBgEnabled={true}
        >
          {activityStore.getPendingTxnTypes[TXNTYPE.send] && (
            <i className="fas fa-spinner fa-spin ml-2 mr-2" />
          )}
        </ButtonV2>

        <CardanoPasswordConfirmModal
          isOpen={isCardanoPasswordConfirmOpen && shouldRequireCardanoPassword}
          isSyncing={isCardanoSyncing}
          statusMessage={cardanoStatusMessage}
          feeText={feeText}
          isWalletLocked={keyRingStore.status === KeyRingStatus.LOCKED}
          networkName={chainStore.current.chainName}
          recipient={sendConfigs.recipientConfig.recipient}
          amountText={`${formattedDisplayAmount} ${sendConfigs.amountConfig.sendCurrency.coinDenom}`}
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
            cardanoSendTxTracking={cardanoSendTxTracking}
            onClose={() => {
              navigate("/activity", { replace: true });
            }}
          />
        )}
      </div>
    );
  }
);
