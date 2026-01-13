import { ButtonV2 } from "@components-v2/buttons/button";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { Input } from "@components-v2/form";
import { TextArea } from "@components/form";
import { observer } from "mobx-react-lite";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../stores";
import { JsonUploadButton } from "./json-upload-button";
import style from "./styles.module.scss";
import {
  CosmosMsgTypesAmino,
  CosmosMsgTypesProto,
  assembleMultisigTx,
  convertAminoToProtoMsgs,
  convertProtoJsontoProtoMsgs,
  createSignature,
  createSignaturesMap,
  detectInputType,
  formatJson,
  isSignatureCollected,
  isValidBech32Address,
  orderMultisigSignatures,
  prepareSignDoc,
  protoMultisigToAmino,
  snakeToCamelDeep,
  validateAminoSignDoc,
  validateProtoJsonSignDoc,
} from "./utils";
import {
  RequestSignAminoMsg,
  RequestSignDirectMsg,
  SignMode,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { SignAction, SignDocData } from "./types";
import { useQuery } from "@tanstack/react-query";

type TxnType = SignMode.Amino | SignMode.Direct;

type SignerMode = "single" | "multi";

export const SignTransactionForm: React.FC<{
  type: SignerMode;
  showNotification: (message: string, type?: any) => void;
}> = observer(({ type, showNotification }) => {
  const navigate = useNavigate();

  const { chainStore, accountStore, queriesStore } = useStore();

  const [txnPayload, setTxnPayload] = useState("");
  const [multiSigPubKeys, setMultiSigPubKeys] = useState("");
  const [broadcastTxn, setBroadcastTxn] = useState(false);
  const [payloadError, setPayloadError] = useState("");
  const [multiSignatures, setMultiSignatures] = useState<string[]>([]);
  const [multisigAccount, setMultiSigAccount] = useState<string>("");
  const [allSignaturesCollected, setAllSignaturesCollected] = useState(false);
  const [multiSigTransactionAssembled, setMultiSigTransactionAssembled] =
    useState(false);

  const chainId = chainStore.current.chainId;
  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);
  const bech32Prefix = chainStore.current.bech32Config.bech32PrefixAccAddr;
  const address = account.bech32Address;
  const collectedSignaturesCount =
    multiSignatures.filter(isSignatureCollected).length;
  const accountAddress = type === "single" ? address : multisigAccount;
  const [threshold, setThreshold] = useState<number | undefined>(0);

  const { data: accountData } = useQuery({
    queryKey: ["accountData", accountAddress],
    queryFn: async () => {
      const accountData = await queries.cosmos.queryAccount
        .getQueryBech32Address(accountAddress)
        .waitResponse();
      return accountData?.data;
    },
    enabled:
      !!accountAddress && isValidBech32Address(accountAddress, bech32Prefix),
  });

  useEffect(() => {
    if (type === "multi") {
      setThreshold(Number(accountData?.account?.pub_key?.key?.threshold || 0));
    }
  }, [accountData, type]);

  useEffect(() => {
    if (!threshold) return setAllSignaturesCollected(false);

    const collectedCount = multiSignatures.filter(isSignatureCollected).length;
    setAllSignaturesCollected(collectedCount >= threshold);
  }, [multiSignatures, threshold]);

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

  const signManualTxn = async (
    signType: TxnType,
    signDoc: any,
    signDocParams: any
  ) => {
    try {
      let msg: any;

      const signDocOptions = {
        disableBalanceCheck: true,
        preferNoSetFee: true,
      };

      if (signType === SignMode.Direct) {
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
          txSignature:
            type === "multi"
              ? createSignature(result, signDocParams.sequence)
              : result.signature.signature,
          signatureName:
            type === "multi"
              ? `signature-${account.bech32Address}-${chainId}-${signDocParams.sequence}`
              : "",
        },
      });
    } catch (err) {
      console.log("error", err);
      showNotification(err?.message || "Something went wrong", "danger");
    }
  };

  const handleSubmitSingle = async (
    userAction: SignAction,
    signDocData: SignDocData
  ) => {
    const { payloadObj, signDocParams, signDoc, signDocType } = signDocData;

    if (userAction === SignAction.SIGN) {
      await signManualTxn(SignMode.Amino, signDoc, signDocParams);
    } else {
      const aminoMsgs = signDoc.msgs;
      const protoMsgs =
        signDocType === "amino"
          ? convertAminoToProtoMsgs(signDoc.msgs)
          : convertProtoJsontoProtoMsgs(payloadObj.body.messages);
      const memo = signDoc.memo;
      const fee = signDoc.fee;
      const msgType =
        (signDocType === "amino"
          ? CosmosMsgTypesAmino[payloadObj?.msgs[0]?.type]
          : CosmosMsgTypesProto[payloadObj?.body?.messages?.[0]["@type"]]) ||
        "unknown";
      await account.cosmos.sendMsgs(
        msgType,
        {
          aminoMsgs: aminoMsgs,
          protoMsgs: protoMsgs,
        },
        memo,
        fee,
        {
          disableBalanceCheck: true,
          preferNoSetFee: true,
        },
        {
          onFulfill: (tx) => {
            navigate("/more/sign-manual-txn", {
              replace: true,
              state: {
                signed: true,
                broadcastType: "single",
                txSignature: tx.signature,
                txHash: tx.hash,
              },
            });
          },
          onBroadcasted: (_txHash) => {
            showNotification("Transaction broadcasted");
          },
          onBroadcastFailed: (_error) => {
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

  const handleSubmit = async (type: string) => {
    const accountDetails = {
      sequence: accountData?.account?.sequence || "0",
      account_number: accountData?.account?.account_number || "0",
    };
    const signDocData = await prepareSignDoc(
      txnPayload,
      accountDetails,
      chainId
    );
    const userAction = broadcastTxn
      ? SignAction.SIGN_AND_BROADCAST
      : SignAction.SIGN;

    if (type === "multi") {
      handleSubmitMulti(userAction, signDocData);
    } else {
      handleSubmitSingle(userAction, signDocData);
    }
  };

  const handleSubmitMulti = async (
    userAction: SignAction,
    signDocData: SignDocData
  ) => {
    try {
      const { payloadObj, signDocParams, signDoc } = signDocData;
      if (userAction === SignAction.SIGN) {
        await signManualTxn(SignMode.Amino, signDoc, signDocParams);
      } else {
        const protoMsgs = convertProtoJsontoProtoMsgs(payloadObj.body.messages);
        const pubKeys = protoMultisigToAmino(
          payloadObj.auth_info.signer_infos[0].public_key
        );
        const txRaw = {
          body: snakeToCamelDeep(payloadObj.body),
          auth_info: snakeToCamelDeep(payloadObj.auth_info),
          signatures: payloadObj.signatures,
        };

        let signatures: any = new Map();

        if (multiSignatures.length) {
          const singleSignatures = multiSignatures.map((sig) => {
            const signature = JSON.parse(sig);
            return signature?.signatures[0];
          });
          const pubKeys =
            accountData?.account?.pub_key?.key?.pubkeys ||
            JSON.parse(multiSigPubKeys || "{}")?.public_keys?.map(
              (pub: any) => ({ type: pub["@type"], value: pub.key })
            );

          if (pubKeys && pubKeys?.length) {
            signatures = orderMultisigSignatures(signatures, pubKeys);
          }
          signatures = createSignaturesMap(bech32Prefix, singleSignatures);
        }
        const tx = await account.cosmos.broadcastMultisigMsgs(
          pubKeys,
          protoMsgs,
          txRaw,
          "unsigned",
          signatures,
          multisigAccount
        );
        showNotification("Transaction Broadcated", "success");
        navigate("/more/sign-manual-txn", {
          replace: true,
          state: {
            signed: true,
            broadcastType: "multi",
            chainId: chainId,
            txSignature: tx.signature,
            txHash: tx.txHash,
          },
        });
      }
    } catch (err) {
      showNotification(err?.message || "Something went wrong", "danger");
    }
  };

  const assembleFinalMultiSigTxn = () => {
    try {
      const txRaw = JSON.parse(txnPayload);
      let signatures = multiSignatures.map((sig) => {
        const signature = JSON.parse(sig);
        return signature?.signatures[0];
      });

      const pubKeys =
        accountData?.account?.pub_key?.key?.pubkeys ||
        JSON.parse(multiSigPubKeys || "{}")?.public_keys?.map((pub: any) => ({
          type: pub["@type"],
          value: pub.key,
        }));
      if (pubKeys && pubKeys?.length) {
        signatures = orderMultisigSignatures(signatures, pubKeys);
      }
      const assembled = assembleMultisigTx(
        txRaw,
        threshold || 0,
        signatures,
        signatures?.[0]?.sequence || "0",
        pubKeys
          ? pubKeys?.map((item: any) => ({
              "@type": item?.type,
              key: item?.value,
            }))
          : null
      );
      setTxnPayload(JSON.stringify(assembled, null, 2));
      setMultiSigTransactionAssembled(true);
    } catch (err) {
      showNotification(err?.message || "Something went wrong", "danger");
      setMultiSigTransactionAssembled(false);
    }
  };

  const onTxnSignDocChange = (value: string) => {
    setTxnPayload(value);
    setPayloadError("");
    const formatted = formatJson(value);
    try {
      const signDoc = JSON.parse(formatted);
      const inputType = detectInputType(signDoc);
      const targetAddress = type === "single" ? address : multisigAccount;
      if (inputType === "amino") {
        validateAminoSignDoc(signDoc, chainId, targetAddress);
      } else {
        validateProtoJsonSignDoc(signDoc, targetAddress);
      }
    } catch (err) {
      setPayloadError(err.message);
    }
  };

  const multiSigAccountError =
    multisigAccount !== "" &&
    !isValidBech32Address(multisigAccount, bech32Prefix)
      ? "Please enter a valid bech32 address"
      : multisigAccount !== "" &&
        broadcastTxn &&
        isValidBech32Address(multisigAccount, bech32Prefix) &&
        !accountData?.account
      ? "Multisig account not found on-chain yet. Please upload the multisig public key."
      : "";

  const hasMultiSigPubKey =
    accountData?.account?.pub_key?.key?.pubkeys ||
    JSON.parse(multiSigPubKeys || "{}")?.public_keys;

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
            setMultiSigAccount(e.target.value.trim());
          }}
        />
      )}
      <TextArea
        label="Transaction Data (JSON, Hex or Base64)"
        className={style["txnPayloadInput"]}
        formFeedbackClassName={style["formFeedback"]}
        placeholder={
          type === "single"
            ? "Paste the transaction to sign"
            : "Paste transaction to sign"
        }
        value={txnPayload}
        onChange={(e) => onTxnSignDocChange(e.target.value)}
        onBlur={(e: any) => {
          const formatted = formatJson(e.target.value);
          setTxnPayload(formatted);
        }}
        error={payloadError}
      />
      <JsonUploadButton
        text="Upload Transaction"
        onJsonLoaded={(data) => {
          const formatted = formatJson(data);
          onTxnSignDocChange(formatted);
        }}
        onError={(error) => showNotification(error, "danger")}
      />
      {type === "multi" && broadcastTxn && (
        <div className={style["multiSignatureContainer"]}>
          {!accountData?.account?.pub_key && (
            <React.Fragment>
              <p style={{ marginBottom: 0 }} className={style["inputLabel"]}>
                Multisig Account Pubkey
              </p>
              <p
                style={{ marginBottom: "10px" }}
                className={style["inputLabel"]}
              >
                *(Multisig public key not found on-chain. Paste or Upload it
                manually to proceed)
              </p>
              <TextArea
                placeholder="Paste your multisig account pubkey"
                value={multiSigPubKeys}
                onChange={(e) => {
                  const formatted = formatJson(e.target.value);
                  setMultiSigPubKeys(formatted);
                }}
                onBlur={(e: any) => {
                  const formatted = formatJson(e.target.value);
                  setThreshold(
                    Number(JSON.parse(e.target.value).threshold || 0)
                  );
                  setMultiSigPubKeys(formatted);
                }}
                className={style["txnPayloadSignatureInput"]}
              />
              <JsonUploadButton
                text="Upload Public Key"
                onJsonLoaded={(data) => {
                  const formatted = formatJson(data);
                  setThreshold(Number(JSON.parse(data).threshold || 0));
                  setMultiSigPubKeys(formatted);
                }}
                onError={(error) => showNotification(error, "danger")}
              />
            </React.Fragment>
          )}
          <Input
            label="Threshold (from multisig account)"
            type="text"
            name="threshold"
            value={threshold}
            readOnly={accountData?.account?.pub_key?.key?.threshold}
            formGroupClassName={style["formGroup"]}
            formFeedbackClassName={style["formFeedback"]}
            onChange={(e) => {
              const value = e.target.value;
              // allow clearing the input
              if (value === "") {
                setThreshold(undefined);
                return;
              }
              // allow only positive integers
              if (/^[1-9]\d*$/.test(value)) {
                setThreshold(Number(value));
              }
            }}
          />
          {multiSignatures.length > 0 && (
            <React.Fragment>
              <p style={{ marginBottom: 0 }} className={style["inputLabel"]}>
                Signatures{" "}
                {threshold && (
                  <span>
                    ({collectedSignaturesCount} / {threshold} collected )
                  </span>
                )}
              </p>
            </React.Fragment>
          )}
          {multiSignatures.map((sig, index) => (
            <React.Fragment key={index}>
              <TextArea
                key={index}
                label={`Signature ${index + 1}`}
                placeholder="Paste a signature"
                value={sig}
                onChange={(e) => {
                  const formatted = formatJson(e.target.value);
                  handleMultiSignatureChange(index, formatted);
                }}
                onBlur={(e: any) => {
                  const formatted = formatJson(e.target.value);
                  handleMultiSignatureChange(index, formatted);
                }}
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
              text="Add Signature"
              styleProps={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "40px",
                width: "fit-content",
                fontSize: "14px",
                marginBottom: "12px",
                fontWeight: 400,
              }}
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
                styleProps={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "40px",
                  width: "fit-content",
                  fontSize: "14px",
                  fontWeight: 400,
                }}
                disabled={
                  !allSignaturesCollected ||
                  txnPayload.trim() === "" ||
                  payloadError !== "" ||
                  !hasMultiSigPubKey
                }
                onClick={assembleFinalMultiSigTxn}
              />
            )}
          </div>
        </div>
      )}
      <Checkbox
        isChecked={broadcastTxn}
        setIsChecked={setBroadcastTxn}
        label={
          type === "single"
            ? "Broadcast Transaction"
            : "Assemble Signatures and Broadcast Transaction"
        }
      />
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
        disabled={
          payloadError !== "" ||
          txnPayload.trim() === "" ||
          account.broadcastInProgress ||
          (type === "multi" &&
            (multiSigAccountError !== "" ||
              (broadcastTxn &&
                (multiSignatures.length < (threshold || 0) ||
                  !allSignaturesCollected ||
                  !multiSigTransactionAssembled))))
        }
        text={
          broadcastTxn ? (
            <React.Fragment>
              {type === "single"
                ? "Sign and Broadcast Transaction"
                : "Broadcast Multisig Transaction"}
              &nbsp;
              {account.broadcastInProgress && (
                <i className="fa fa-spinner fa-spin fa-fw" />
              )}
            </React.Fragment>
          ) : (
            "Sign Transaction"
          )
        }
        dataLoading={account.broadcastInProgress}
        onClick={async () => {
          await handleSubmit(type);
        }}
      />
    </div>
  );
});
