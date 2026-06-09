import React from "react";
import { IFeeConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";
import { TransactionOverrideAlert } from "./transaction-alert";
import { useStore } from "../../stores";
import { FeeIncreaseModal } from "./fee-buttons/fee-increase-modal";

interface TransactionOverrideHandlerProps {
  feeConfig: IFeeConfig;
  isFeeDropdownOpen: boolean;
  isSendTransaction?: boolean;
  gasSimulator?: IGasSimulator;
}

export const TransactionOverrideHandler = observer(
  ({
    feeConfig,
    gasSimulator,
    isSendTransaction,
    isFeeDropdownOpen,
  }: TransactionOverrideHandlerProps) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [overrideBtnClickedOnce, setOverrideBtnClickedOnce] =
      React.useState(false);

    // Stores the fee amount that the user has already acknowledged.
    const lastAcceptedFeeRef = React.useRef<string | null>(null);

    const { chainStore, accountStore, activityStore } = useStore();

    const accountInfo = accountStore.getAccount(chainStore.current.chainId);
    const previousTransaction = (activityStore?.sortedNodes?.[0] as any)
      ?.transaction;

    const previousTxnFees = JSON.parse(previousTransaction?.fees || "[]")?.[0];

    const isPreviousTxnPending =
      Object.values(activityStore.getPendingTxn).length > 0;

    const shouldShowFeeModal = React.useCallback(() => {
      if (!feeConfig.fee) return false;

      const oldFees = parseFloat(previousTxnFees?.amount ?? "0") || 0;

      const currentFees = parseFloat(feeConfig.fee.toCoin().amount ?? "0") || 0;

      return currentFees < oldFees * 1.1;
    }, [previousTxnFees, feeConfig]);

    React.useEffect(() => {
      if (!overrideBtnClickedOnce) return;
      if (isFeeDropdownOpen) return;

      const currentFee = feeConfig.fee?.toCoin().amount ?? "";

      if (lastAcceptedFeeRef.current === currentFee) {
        return;
      }

      if (shouldShowFeeModal()) {
        setIsOpen(true);
      }
    }, [
      overrideBtnClickedOnce,
      feeConfig.fee,
      isFeeDropdownOpen,
      shouldShowFeeModal,
    ]);

    if (
      !accountInfo.txInProgress ||
      !isSendTransaction ||
      !isPreviousTxnPending
    )
      return null;

    return (
      <React.Fragment>
        {!overrideBtnClickedOnce && (
          <TransactionOverrideAlert
            isAmountInvalid={!previousTxnFees}
            onOverrideClick={() => {
              const currentFee = feeConfig.fee?.toCoin().amount ?? "";

              if (shouldShowFeeModal()) {
                setIsOpen(true);
              }

              lastAcceptedFeeRef.current = currentFee;

              accountInfo.resetBroadcastInProgress();
              setOverrideBtnClickedOnce(true);
            }}
          />
        )}

        <FeeIncreaseModal
          feeConfigs={feeConfig}
          isOpen={isOpen}
          isFeeReduction={overrideBtnClickedOnce}
          gasSimulator={gasSimulator}
          pendingTransactionFees={previousTxnFees}
          onCancel={() => {
            setIsOpen(false);
          }}
          onConfirm={() => {
            // User accepted this fee, don't show again
            // unless they change it.
            lastAcceptedFeeRef.current = feeConfig.fee?.toCoin().amount ?? "";
            activityStore.setTransactionAsStale(previousTransaction.id);

            setIsOpen(false);
          }}
        />
      </React.Fragment>
    );
  }
);
