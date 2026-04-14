import React, { useState } from "react";
import { Input } from "@components-v2/form";
import { TextArea } from "@components/form";
import { ToolTip } from "@components/tooltip";
import { JsonUploadButton } from "./json-upload-button";
import { formatJson } from "./utils";
import { MultisigPublicKeySectionProps } from "./types";
import styles from "./styles.module.scss";

export const MultisigPublicKeySection: React.FC<
  MultisigPublicKeySectionProps
> = ({
  multiSigAccountError,
  offlineSigning,
  broadcastTxn,
  accountPubKey,
  multiSigPubKeys,
  pubKeyError,
  multisigAccount,
  threshold,
  handlePubkeysChange,
  handleThresholdChange,
  setMultiSigPubKeys,
  setPubKeyError,
  showNotification,
}) => {
  const [showExample, setShowExample] = useState(false);

  const shouldShowPubKeyInput =
    ((multiSigAccountError || !accountPubKey) && multisigAccount) ||
    offlineSigning;

  return (
    <div className={styles["multiSignatureContainer"]}>
      {shouldShowPubKeyInput && (
        <React.Fragment>
          <p
            style={{
              marginBottom: "6px",
              display: "flex",
              columnGap: "4px",
              alignItems: "center",
            }}
            className={styles["inputLabel"]}
          >
            Multisig Public Key (JSON)
            <ToolTip
              trigger="hover"
              options={{ placement: "top-end" }}
              childrenStyle={{ display: "flex" }}
              tooltip={
                <div style={{ maxWidth: "300px" }}>
                  Your complete multisig public key JSON (LegacyAminoPubKey),
                  including <b>threshold</b> and <b>public_keys</b>.
                </div>
              }
            >
              <img
                src={require("@assets/svg/circle-info.svg")}
                style={{
                  cursor: "pointer",
                  width: "18px",
                  height: "18px",
                }}
              />
            </ToolTip>
          </p>

          {!offlineSigning && (
            <p
              style={{ marginBottom: "10px" }}
              className={styles["inputLabel"]}
            >
              *Multisig public key not found on-chain. Paste or upload it
              manually to proceed.
            </p>
          )}
          <TextArea
            placeholder="Paste your multisig account pubkey"
            value={multiSigPubKeys}
            onChange={(e) => {
              try {
                setPubKeyError("");
                const formatted = formatJson(e.target.value);
                setMultiSigPubKeys(formatted);
              } catch (err: any) {
                setPubKeyError(err.message);
              }
            }}
            onBlur={(e: any) => handlePubkeysChange(e.target.value)}
            error={pubKeyError}
            formGroupClassName={styles["formGroupPubkeyInput"]}
            className={styles["txnPayloadSignatureInput"]}
          />
          <div
            className={styles["exampleToggle"]}
            onClick={() => setShowExample((prev) => !prev)}
          >
            {showExample ? "Hide example" : "Need an example?"}
          </div>
          {showExample && (
            <pre className={styles["jsonExample"]}>
              {formatJson(
                JSON.stringify({
                  "@type": "/cosmos.crypto.multisig.LegacyAminoPubKey",
                  threshold: 2,
                  public_keys: [
                    {
                      "@type": "/cosmos.crypto.secp256k1.PubKey",
                      key: "...",
                    },
                  ],
                })
              )}
            </pre>
          )}
          <JsonUploadButton
            text="Upload Public Key"
            onJsonLoaded={(data) => handlePubkeysChange(data)}
            onError={(error) => showNotification(error, "danger")}
          />
        </React.Fragment>
      )}
      {broadcastTxn && (
        <Input
          label="Threshold (from multisig account)"
          type="text"
          name="threshold"
          value={threshold}
          readOnly={Boolean(accountPubKey?.key?.threshold)}
          onChange={handleThresholdChange}
          formGroupClassName={styles["formGroup"]}
          formFeedbackClassName={styles["formFeedback"]}
        />
      )}
    </div>
  );
};
