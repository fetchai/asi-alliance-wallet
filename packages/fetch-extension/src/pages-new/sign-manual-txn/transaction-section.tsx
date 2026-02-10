import { Input } from "@components-v2/form";
import { TextArea } from "@components/form";
import React from "react";
import { JsonUploadButton } from "./json-upload-button";
import style from "./styles.module.scss";
import { formatJson } from "./utils";

interface TransactionSectionProps {
  type?: "single" | "multi";
  chainId: string;
  address: string;
  multisigAccount?: string;
  multiSigAccountError?: string;
  onMultisigAccountChange?: (e: any) => void;
  txnPayload: string;
  payloadError: string;
  onTxnSignDocChange: (value: string) => void;
  showNotification: (message: string, type?: any) => void;
}

export const TransactionSection: React.FC<TransactionSectionProps> = ({
  type = "single",
  chainId,
  address,
  multisigAccount,
  multiSigAccountError,
  onMultisigAccountChange,
  txnPayload,
  payloadError,
  onTxnSignDocChange,
  showNotification,
}) => {
  return (
    <React.Fragment>
      <Input
        label="Chain ID"
        type="text"
        name="chainId"
        value={chainId}
        formGroupClassName={style["formGroup"]}
        formFeedbackClassName={style["formFeedback"]}
        readOnly
      />
      <Input
        label="Account"
        type="text"
        name="account"
        value={address}
        formGroupClassName={style["formGroup"]}
        formFeedbackClassName={style["formFeedback"]}
        readOnly
      />
      {type === "multi" && (
        <Input
          label="Multisig Account"
          type="text"
          name="multisigAccount"
          placeholder="Multisig account address"
          value={multisigAccount}
          formGroupClassName={style["formGroup"]}
          formFeedbackClassName={style["formFeedback"]}
          error={multiSigAccountError}
          onChange={(e) => {
            onMultisigAccountChange?.(e.target.value.trim());
          }}
        />
      )}
      <TextArea
        label="Transaction Data (JSON, Hex or Base64)"
        className={style["txnPayloadInput"]}
        formFeedbackClassName={style["formFeedback"]}
        placeholder="Paste transaction to sign"
        value={txnPayload}
        onChange={(e) => onTxnSignDocChange(e.target.value)}
        onBlur={(e: any) => {
          onTxnSignDocChange(e.target.value);
        }}
        error={payloadError}
      />
      <JsonUploadButton
        text="Upload Transaction"
        onJsonLoaded={(data) => onTxnSignDocChange(formatJson(data))}
        onError={(error) => showNotification(error, "danger")}
      />
    </React.Fragment>
  );
};
