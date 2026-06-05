import { ButtonV2 } from "@components-v2/buttons/button";
import React from "react";
import { Modal, ModalBody } from "reactstrap";
import { IGasSimulator } from "@keplr-wallet/hooks";

interface FeeIncreaseModalProps {
  isOpen: boolean;
  feeConfigs: any;
  gasSimulator?: IGasSimulator;
  pendingTransactionFees?: { denom: string; amount: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const FeeIncreaseModal: React.FC<FeeIncreaseModalProps> = ({
  isOpen,
  feeConfigs,
  gasSimulator,
  pendingTransactionFees,
  onConfirm,
  onCancel,
}) => {
  const _disableSimulator = () => {
    if (gasSimulator && gasSimulator?.enabled) {
      gasSimulator.setEnabled(false);
    }
  };

  const applyOverrideFee = () => {
    if (!pendingTransactionFees) return;

    // disableSimulator();
    const oldFeeAmount = parseFloat(pendingTransactionFees?.amount || "0");
    const currentFeeAmount = parseFloat(feeConfigs.fee?.toCoin().amount) || 0;

    // Increment by 10%
    const incrementedFee = Math.round(oldFeeAmount * 1.1);
    if (incrementedFee > currentFeeAmount) {
      if (pendingTransactionFees?.denom) {
        feeConfigs.setManualFee({
          denom: pendingTransactionFees.denom,
          amount: incrementedFee.toString(),
        });
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      toggle={onCancel}
      centered
      style={{ maxWidth: 420, margin: "auto" }}
    >
      <div className="d-flex justify-content-end px-3 pt-3 pb-0">
        <img
          src={require("@assets/svg/wireframe/xmark.svg")}
          alt="close"
          onClick={onCancel}
          style={{ width: 16, height: 16, cursor: "pointer", opacity: 0.5 }}
        />
      </div>

      <ModalBody className="px-4 pt-2 pb-0">
        <h6 className="fw-bold text-dark mb-2" style={{ fontSize: 15 }}>
          Transaction Fee Update
        </h6>
        <p
          className="text-muted mb-3"
          style={{ fontSize: 13, lineHeight: 1.5 }}
        >
          Transaction fees will be temporarily increased to ensure your
          transaction is processed without delay.
        </p>

        <div
          className="d-flex align-items-center gap-2 rounded-3 p-2 mb-1"
          style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}
        >
          <span
            className="badge rounded-2 fw-bold flex-shrink-0"
            style={{
              background: "#f97316",
              fontSize: 11,
              color: "#fff",
              marginRight: "6px",
            }}
          >
            +10%
          </span>
          <span style={{ color: "#92400e", fontSize: 12, fontWeight: 500 }}>
            Fees will be increased to avoid transaction failures
          </span>
        </div>
      </ModalBody>

      <div className="d-flex flex-row justify-content-around align-items-center border-0 px-4 pb-4 pt-2 gap-2">
        <ButtonV2
          variant="light"
          text="Cancel"
          type="button"
          styleProps={{
            height: 38,
            width: "fit-content",
            padding: "0 20px",
            fontSize: 13,
            fontWeight: 600,
          }}
          onClick={onCancel}
        />
        <ButtonV2
          variant="dark"
          text="Proceed"
          type="button"
          styleProps={{
            height: 38,
            width: "fit-content",
            padding: "0 20px",
            fontSize: 13,
            fontWeight: 600,
          }}
          onClick={() => {
            applyOverrideFee();
            onConfirm();
          }}
        />
      </div>
    </Modal>
  );
};
