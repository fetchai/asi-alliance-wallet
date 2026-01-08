import { ButtonV2 } from "@components-v2/buttons/button";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { Input } from "@components-v2/form";
import { TextArea } from "@components/form";
import {
  RequestSignAminoMsg,
  RequestSignDirectMsg,
  SignMode,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { observer } from "mobx-react-lite";
import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../stores";
import style from "./styles.module.scss";
import {
  CosmosMsgTypes,
  convertAminoToProtoMsgs,
  convertMultiSigToProtoMsgs,
  formatJson,
  protoMultisigToAmino,
  validateAminoSignDoc,
  validateDirectSignDoc,
  snakeToCamelDeep,
  detectTxType,
  assembleMultisigTx,
} from "./utils";

type TxnType = SignMode.Amino | SignMode.Direct;

enum SignType {
  SIGN = "sign",
  SIGN_AND_BROADCAST = "sign_and_broadcast",
}

type SignerMode = "single" | "multi";

export const SignTransactionForm: React.FC<{
  type: SignerMode;
  showNotification: (message: string, type?: any) => void;
}> = observer(({ type, showNotification }) => {
  const navigate = useNavigate();

  const { chainStore, accountStore } = useStore();

  const [txnPayload, setTxnPayload] = useState("");
  const [broadcastTxn, setBroadcastTxn] = useState(type === "multi");
  const [payloadError, setPayloadError] = useState("");
  const [multiSignatures, setMultiSignatures] = useState<string[]>([]);
  const [threshold, setThreshold] = useState<number>(1);

  const signingType = SignMode.Amino;

  const chainId = chainStore.current.chainId;
  const bech32Prefix = chainStore.current.bech32Config.bech32PrefixAccAddr;
  const account = accountStore.getAccount(chainId);
  const address = account.bech32Address;

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

  const signManualTxn = async (type: TxnType) => {
    try {
      const signDoc = JSON.parse(txnPayload);
      let msg: any;

      const signDocOptions = {
        disableBalanceCheck: true,
        preferNoSetFee: true,
      };

      if (type === SignMode.Direct) {
        msg = new RequestSignDirectMsg(
          chainId,
          address,
          signDoc,
          signDocOptions
        );
      } else {
        msg = new RequestSignAminoMsg(
          chainId,
          address,
          signDoc,
          signDocOptions
        );
      }

      const result: any = await new InExtensionMessageRequester().sendMessage(
        BACKGROUND_PORT,
        msg
      );

      navigate("/more/sign-manual-txn", {
        replace: true,
        state: {
          signed: true,
          txSignature: result.signature.signature,
          signType: SignType.SIGN,
        },
      });
    } catch (err) {
      console.log("error", err);
    }
  };

  const handleSubmitSingleSigner = async (type: SignType) => {
    if (type === SignType.SIGN) {
      const txnType = detectTxType(JSON.parse(txnPayload));
      await signManualTxn(txnType);
    } else {
      const payloadObj = JSON.parse(txnPayload);
      //TODO: on sign and broadcast
      await account.cosmos.sendMsgs(
        CosmosMsgTypes[payloadObj?.msgs[0]?.type],
        {
          aminoMsgs: payloadObj.msgs,
          protoMsgs: convertAminoToProtoMsgs(payloadObj),
        },
        payloadObj.memo,
        payloadObj.fee,
        {
          disableBalanceCheck: true,
          preferNoSetFee: true,
        },
        {
          onFulfill: (tx) => {
            console.log("tx", tx);
            navigate("/more/sign-manual-txn", {
              replace: true,
              state: {
                signed: true,
                txSignature: tx.signature,
                txHash: tx.hash,
                signType: SignType.SIGN_AND_BROADCAST,
              },
            });
          },
          onBroadcasted: (txHash) => {
            console.log("txHash", txHash);
            showNotification("Transaction broadcasted");
          },
          onBroadcastFailed: (error) => {
            console.log("error", error);
            showNotification("Transaction Failed", "danger");
            navigate("/more/sign-manual-txn", {
              replace: true,
              state: {},
            });
          },
        }
      );
    }
  };

  const handleSubmitMultiSigner = async () => {
    try {
      const payloadObj = JSON.parse(txnPayload);
      console.log("Submitting multi-signer txn", payloadObj);
      const protoMsgs = convertMultiSigToProtoMsgs(payloadObj.body.messages);
      const pubKeys = protoMultisigToAmino(
        payloadObj.auth_info.signer_infos[0].public_key
      );
      const txRaw = {
        body: snakeToCamelDeep(payloadObj.body),
        auth_info: snakeToCamelDeep(payloadObj.auth_info),
        signatures: payloadObj.signatures,
      };
      console.log({ protoMsgs, pubKeys, txRaw });
      let mode: any = "signed";
      let signatures: any = new Map();

      if (multiSignatures.length) {
        mode = "unsigned";
        const singleSignatures = multiSignatures.map((sig) => {
          const signature = JSON.parse(sig);
          return signature?.signatures[0] || signature;
        });
        signatures = assembleMultisigTx(
          bech32Prefix,
          txRaw,
          threshold,
          singleSignatures,
          account.customSequence.toString()
        ).signatures;
      }
      const broadcastResponse = await account.cosmos.broadcastMultisigMsgs(
        pubKeys,
        { protoMsgs: protoMsgs, aminoMsgs: [] },
        txRaw,
        mode,
        signatures
      );
      console.log("broadcastResponse", broadcastResponse);
    } catch (err) {
      console.log("error", err);
    }
  };

  const assembleFinalMultiSigTxn = () => {
    const txRaw = JSON.parse(txnPayload);
    const signatures = multiSignatures.map((sig) => {
      const signature = JSON.parse(sig);
      return signature?.signatures[0] || signature;
    });
    console.log("Signatures to assemble", signatures, txRaw);
    const assembled = assembleMultisigTx(
      bech32Prefix,
      txRaw,
      threshold,
      signatures,
      "0"
    );
    setTxnPayload(JSON.stringify(assembled.txRaw, null, 2));
    console.log("Assembled multi-sig txn", assembled);
  };

  console.log("sequence", account.customSequence.toString());

  return (
    <div className={style["container"]}>
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
      <TextArea
        label="Transaction Data (JSON, Hex or Base64)"
        className={style["txnPayloadInput"]}
        formFeedbackClassName={style["formFeedback"]}
        placeholder="Paste the transaction payload to sign"
        value={txnPayload}
        onChange={(e) => {
          setTxnPayload(e.target.value);
          setPayloadError("");
          const formatted = formatJson(e.target.value);
          if (type === "single") {
            try {
              const signDoc = JSON.parse(formatted);
              if (signingType === SignMode.Amino) {
                validateAminoSignDoc(signDoc, chainId, address);
              } else {
                validateDirectSignDoc(signDoc, chainId);
              }
            } catch (err) {
              setPayloadError(err.message);
            }
          }
        }}
        onBlur={(e: any) => {
          const formatted = formatJson(e.target.value);
          setTxnPayload(formatted);
        }}
        error={payloadError}
      />
      {type === "multi" && (
        <div className={style["multiSignatureContainer"]}>
          {multiSignatures.length > 0 && (
            <React.Fragment>
              <p style={{ marginBottom: 0 }} className={style["inputLabel"]}>
                Signatures
              </p>
              <p style={{ marginBottom: 0 }} className={style["inputLabel"]}>
                (* From Accounts associated with muktisig account)
              </p>
            </React.Fragment>
          )}
          {multiSignatures.map((sig, index) => (
            <TextArea
              key={index}
              label={`Signature ${index + 1}`}
              placeholder="Paste a signature"
              value={sig}
              onChange={(e) => {
                // if (array.length <= threshold) {
                const formatted = formatJson(e.target.value);
                handleMultiSignatureChange(index, formatted);
                // }
              }}
              onBlur={(e: any) => {
                const formatted = formatJson(e.target.value);
                handleMultiSignatureChange(index, formatted);
              }}
              className={style["txnPayloadSignatureInput"]}
            />
          ))}
          {multiSignatures.length > 0 && (
            <Input
              label="Threshold"
              type="number"
              name="threshold"
              value={threshold}
              formGroupClassName={style["formGroup"]}
              formFeedbackClassName={style["formFeedback"]}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              width: "100%",
              columnGap: "10px",
            }}
          >
            <ButtonV2
              variant="dark"
              text="New Signature"
              styleProps={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "40px",
                width: "fit-content",
                fontSize: "14px",
                fontWeight: 400,
              }}
              onClick={addSignatureField}
            />
            {multiSignatures.length > 0 && (
              <ButtonV2
                variant="dark"
                text="Assemble Final Txn"
                styleProps={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "40px",
                  width: "fit-content",
                  fontSize: "14px",
                  fontWeight: 400,
                }}
                onClick={assembleFinalMultiSigTxn}
              />
            )}
          </div>
        </div>
      )}
      {type === "single" && (
        <Checkbox
          isChecked={broadcastTxn}
          setIsChecked={setBroadcastTxn}
          label="Broadcast Transaction"
        />
      )}
      <ButtonV2
        variant="dark"
        styleProps={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "48px",
          fontSize: "14px",
          fontWeight: 400,
        }}
        disabled={payloadError !== "" || txnPayload.trim() === ""}
        text={
          broadcastTxn ? "Sign and Broadcast Transaction" : "Sign Transaction"
        }
        onClick={() =>
          type === "multi"
            ? handleSubmitMultiSigner()
            : handleSubmitSingleSigner(
                broadcastTxn ? SignType.SIGN_AND_BROADCAST : SignType.SIGN
              )
        }
      />
    </div>
  );
});
