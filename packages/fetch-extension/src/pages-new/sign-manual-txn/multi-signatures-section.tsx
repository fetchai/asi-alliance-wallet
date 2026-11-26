import { ButtonV2 } from "@components-v2/buttons/button";
import { TextArea } from "@components/form";
import React from "react";
import { JsonUploadButton } from "./json-upload-button";
import { buttonStyles } from ".";
import style from "./styles.module.scss";
import { formatJson, isSignatureCollected } from "./utils";
import { MultiSignaturesProps } from "./types";

export const MultiSignaturesSection: React.FC<MultiSignaturesProps> = ({
  threshold,
  multiSignatures,
  signaturesCollected,
  pubKeyMultisigAccount,
  showNotification,
  assembleFinalMultiSigTxn,
  setMultiSignatures,
}) => {
  const hasMultiSigPubKey =
    pubKeyMultisigAccount && pubKeyMultisigAccount.length > 0;
  const collectedSignaturesCount =
    multiSignatures.filter(isSignatureCollected).length;

  const handleMultiSignatureChange = (index: number, value: string) => {
    setMultiSignatures((prev) => {
      const newSigs = [...prev];
      newSigs[index] = value;
      return newSigs;
    });
  };

  const addSignatureField = () => {
    setMultiSignatures((prev) => [...prev, ""]);
  };

  return (
    <React.Fragment>
      <div className={style["multiSignatureContainer"]}>
        <p
          style={{
            fontSize: "16px",
            color: "var(--font-dark)",
            marginBottom: "8px",
          }}
          className={style["inputLabel"]}
        >
          Signatures&nbsp;
          {threshold ? (
            <span>
              ({collectedSignaturesCount} / {threshold} collected)
            </span>
          ) : (
            ""
          )}
        </p>
        {multiSignatures.map((sig, index) => (
          <React.Fragment key={index}>
            <TextArea
              key={index}
              label={`Signature ${index + 1}`}
              placeholder="Paste a signature"
              value={sig}
              onChange={(e) => {
                handleMultiSignatureChange(index, formatJson(e.target.value));
              }}
              onBlur={(e: any) => {
                handleMultiSignatureChange(index, formatJson(e.target.value));
              }}
              formGroupClassName={style["formGroup"]}
              className={style["txnPayloadSignatureInput"]}
            />
            <JsonUploadButton
              text="Upload Signature"
              onJsonLoaded={(data) => {
                const formatted = formatJson(data);
                handleMultiSignatureChange(index, formatted);
              }}
              onError={(error) => showNotification(error, "danger")}
            />
          </React.Fragment>
        ))}
        <div className={style["signatureFooter"]}>
          <ButtonV2
            variant="dark"
            text="Add Signature"
            styleProps={{ ...buttonStyles, margin: "10px 0px" }}
            disabled={
              multiSignatures.length !== collectedSignaturesCount ||
              (Number(threshold || 0) > 0 &&
                collectedSignaturesCount === threshold)
            }
            onClick={addSignatureField}
          />
          {multiSignatures.length > 0 && (
            <ButtonV2
              variant="dark"
              text="Assemble Transaction"
              styleProps={{ ...buttonStyles, margin: "10px 0px" }}
              disabled={!signaturesCollected || !hasMultiSigPubKey}
              onClick={assembleFinalMultiSigTxn}
            />
          )}
        </div>
      </div>
    </React.Fragment>
  );
};
