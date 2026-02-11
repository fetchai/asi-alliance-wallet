import { Input } from "@components-v2/form";
import { TextArea } from "@components/form";
import React, { useEffect } from "react";
import { JsonUploadButton } from "./json-upload-button";
import style from "./styles.module.scss";
import { formatJson } from "./utils";
import classNames from "classnames";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { Input as RSInput, Label as RSLabel } from "reactstrap";

interface TransactionSectionProps {
  type?: "single" | "multi";
  broadcastTxn: boolean;
  offlineSigning: boolean;
  setOfflineSigning: React.Dispatch<React.SetStateAction<boolean>>;
  chainId: string;
  address: string;
  accountName: string;
  multisigAccount?: string;
  multiSigAccountError?: string;
  onMultisigAccountChange?: (e: any) => void;
  txnPayload: string;
  payloadError: string;
  accountInfo: {
    accountNumber: string;
    sequence: string;
  };
  setAccountInfo: React.Dispatch<
    React.SetStateAction<{
      accountNumber: string;
      sequence: string;
    }>
  >;
  onTxnSignDocChange: (value: string) => void;
  showNotification: (message: string, type?: any) => void;
}

export const TransactionSection: React.FC<TransactionSectionProps> = ({
  type = "single",
  chainId,
  address,
  broadcastTxn,
  accountInfo,
  setAccountInfo,
  offlineSigning,
  setOfflineSigning,
  accountName,
  multisigAccount,
  multiSigAccountError,
  onMultisigAccountChange,
  txnPayload,
  payloadError,
  onTxnSignDocChange,
  showNotification,
}) => {
  useEffect(() => {
    if (broadcastTxn) {
      setOfflineSigning(false);
      setAccountInfo({
        accountNumber: "",
        sequence: "",
      });
    }
  }, [broadcastTxn]);

  const handleAccountInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (value === "" || /^\d+$/.test(value)) {
      setAccountInfo((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

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
      <p style={{ marginBottom: "6px" }} className={style["inputLabel"]}>
        Signer Account
      </p>
      <Input
        label={accountName}
        type="text"
        name="account"
        value={address}
        formGroupClassName={classNames(
          style["formGroup"],
          style["accountInputFormGroup"]
        )}
        formFeedbackClassName={style["formFeedback"]}
        readOnly
      />
      {!broadcastTxn && (
        <React.Fragment>
          <Checkbox
            isChecked={offlineSigning}
            setIsChecked={setOfflineSigning}
            className="mb-2"
            label="Offline Signing (Provide sequence and account number manually)"
          />
          {offlineSigning && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: "fit-content",
              }}
            >
              <div className={style["offlineSigningInputField"]}>
                <RSLabel for="accountNumber" className="w-50">
                  Account Number
                </RSLabel>
                <RSInput
                  id="accountNumber"
                  name="accountNumber"
                  value={accountInfo.accountNumber}
                  bsSize="sm"
                  onChange={handleAccountInfoChange}
                  placeholder="Account Number"
                  type="number"
                />
              </div>
              <div
                className={classNames(
                  style["offlineSigningInputField"],
                  "mb-3"
                )}
              >
                <RSLabel for="sequence" className="w-50">
                  Sequence
                </RSLabel>
                <RSInput
                  id="sequence"
                  name="sequence"
                  bsSize="sm"
                  value={accountInfo.sequence}
                  onChange={handleAccountInfoChange}
                  placeholder="Sequence"
                  type="number"
                />
              </div>
            </div>
          )}
        </React.Fragment>
      )}
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
