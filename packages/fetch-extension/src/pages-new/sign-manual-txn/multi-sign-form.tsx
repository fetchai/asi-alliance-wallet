import { ButtonV2 } from "@components-v2/buttons/button";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { Input } from "@components-v2/form";
import { TextArea } from "@components/form";
import { SignMode } from "@keplr-wallet/background";
import { useQuery } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../stores";
import { JsonUploadButton } from "./json-upload-button";
import style from "./styles.module.scss";
import { MultiSigSteps, SignAction, SignDocData, SignManualTxn } from "./types";
import {
  assembleMultisigTx,
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

import { TransactionSection } from "./transaction-section";
import { MultiSignaturesSection } from "./multi-signatures-section";
import { buttonStyles } from ".";
import { ConfirmMultisigBroadcast } from "./confirm-multi-broadcast";

const MULTISIG_STEPS_ORDER: MultiSigSteps[] = [
  MultiSigSteps.Transaction,
  MultiSigSteps.Signatures,
  MultiSigSteps.ReviewAndBroadcast,
];

export const MultiSignForm: React.FC<{
  signManualTxn: SignManualTxn;
  showNotification: (message: string, type?: any) => void;
}> = observer(({ signManualTxn, showNotification }) => {
  const navigate = useNavigate();

  const { chainStore, accountStore, queriesStore } = useStore();

  const [txnPayload, setTxnPayload] = useState("");
  const [multiSigPubKeys, setMultiSigPubKeys] = useState("");
  const [broadcastTxn, setBroadcastTxn] = useState(false);
  const [payloadError, setPayloadError] = useState("");
  const [multiSignatures, setMultiSignatures] = useState<string[]>([""]);
  const [multisigAccount, setMultiSigAccount] = useState<string>("");
  const [allSignaturesCollected, setAllSignaturesCollected] = useState(false);
  const [multiSigTransactionAssembled, setMultiSigTransactionAssembled] =
    useState(false);
  const [threshold, setThreshold] = useState<number | undefined>(0);
  const [multiSigStep, setMultiSigStep] = useState<MultiSigSteps>(
    MultiSigSteps.Transaction
  );

  const chainId = chainStore.current.chainId;
  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);
  const bech32Prefix = chainStore.current.bech32Config.bech32PrefixAccAddr;
  const address = account.bech32Address;
  const accountAddress = multisigAccount;

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

  const pubKeyMultisigAccount =
    accountData?.account?.pub_key?.key?.pubkeys ||
    JSON.parse(multiSigPubKeys || "{}")?.public_keys?.map((pub: any) => ({
      type: pub["@type"],
      value: pub.key,
    }));

  useEffect(() => {
    setThreshold(Number(accountData?.account?.pub_key?.key?.threshold || 0));
  }, [accountData]);

  useEffect(() => {
    if (!threshold) return setAllSignaturesCollected(false);

    const collectedCount = multiSignatures.filter(isSignatureCollected).length;
    setAllSignaturesCollected(collectedCount >= threshold);
  }, [multiSignatures, threshold]);

  const onSignSuccess = (signDocParams: any, result: any) => {
    navigate("/more/sign-manual-txn", {
      replace: true,
      state: {
        signed: true,
        txSignature: createSignature(result, signDocParams.sequence),
        signatureName: `signature-${account.bech32Address}-${chainId}-${signDocParams.sequence}`,
      },
    });
  };

  const handleSubmit = async () => {
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

    handleSubmitMulti(userAction, signDocData);
  };

  const handleSubmitMulti = async (
    userAction: SignAction,
    signDocData: SignDocData
  ) => {
    try {
      const { payloadObj, signDocParams, signDoc } = signDocData;
      if (userAction === SignAction.SIGN) {
        await signManualTxn(
          SignMode.Amino,
          signDoc,
          signDocParams,
          onSignSuccess
        );
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

          if (pubKeyMultisigAccount && pubKeyMultisigAccount?.length) {
            signatures = orderMultisigSignatures(
              signatures,
              pubKeyMultisigAccount
            );
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

      if (pubKeyMultisigAccount && pubKeyMultisigAccount?.length) {
        signatures = orderMultisigSignatures(signatures, pubKeyMultisigAccount);
      }
      const assembled = assembleMultisigTx(
        txRaw,
        threshold || 0,
        signatures,
        signatures?.[0]?.sequence || "0",
        pubKeyMultisigAccount
          ? pubKeyMultisigAccount?.map((item: any) => ({
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
      if (inputType === "amino") {
        validateAminoSignDoc(signDoc, chainId, multisigAccount);
      } else {
        validateProtoJsonSignDoc(signDoc, multisigAccount);
      }
    } catch (err) {
      setPayloadError(err.message);
    }
  };

  const handleThresholdChange = (e: any) => {
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
  };

  const handlePubkeysChange = (value: string) => {
    const formatted = formatJson(value);
    setThreshold(Number(JSON.parse(value).threshold || 0));
    setMultiSigPubKeys(formatted);
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

  const renderMultisigSteps = () => {
    switch (multiSigStep) {
      case MultiSigSteps.Transaction:
        return renderTransactionStep();
      case MultiSigSteps.Signatures:
        return renderSignaturesStep();
      case MultiSigSteps.ReviewAndBroadcast:
        return renderBroadcastStep();
      default:
        return null;
    }
  };

  const renderBroadcastStep = () => {
    return <ConfirmMultisigBroadcast txnPayload={txnPayload} />;
  };

  const renderSignaturesStep = () => {
    return (
      <MultiSignaturesSection
        assembleFinalMultiSigTxn={assembleFinalMultiSigTxn}
        multiSignatures={multiSignatures}
        setMultiSignatures={setMultiSignatures}
        showNotification={showNotification}
        signaturesCollected={
          !(
            !allSignaturesCollected ||
            txnPayload.trim() === "" ||
            payloadError !== ""
          )
        }
        threshold={threshold}
        pubKeyMultisigAccount={pubKeyMultisigAccount}
      />
    );
  };

  const renderTransactionStep = () => {
    return (
      <div>
        <TransactionSection
          chainId={chainId}
          address={address}
          type="multi"
          onTxnSignDocChange={onTxnSignDocChange}
          multisigAccount={multisigAccount}
          multiSigAccountError={multiSigAccountError}
          payloadError={payloadError}
          showNotification={showNotification}
          txnPayload={txnPayload}
          onMultisigAccountChange={(value) => setMultiSigAccount(value)}
        />
        {broadcastTxn && (
          <div className={style["multiSignatureContainer"]}>
            {multiSigAccountError && !accountData?.account?.pub_key && (
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
                  onBlur={(e: any) => handlePubkeysChange(e.target.value)}
                  className={style["txnPayloadSignatureInput"]}
                />
                <JsonUploadButton
                  text="Upload Public Key"
                  onJsonLoaded={(data) => handlePubkeysChange(data)}
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
              onChange={handleThresholdChange}
            />
          </div>
        )}
        <Checkbox
          isChecked={broadcastTxn}
          setIsChecked={setBroadcastTxn}
          label="Assemble Signatures and Broadcast Transaction"
        />
      </div>
    );
  };

  const buttonText = () => {
    return broadcastTxn ? (
      <React.Fragment>
        {multiSigStep === MultiSigSteps.ReviewAndBroadcast
          ? "Broadcast Multisig Transaction"
          : multiSigStep === MultiSigSteps.Signatures
          ? "Verify & Broadcast"
          : "Add Cosigner Signatures"}
        {account.broadcastInProgress && (
          <i className="fa fa-spinner fa-spin fa-fw" />
        )}
      </React.Fragment>
    ) : (
      "Sign Transaction"
    );
  };

  const moveStep = (direction: 1 | -1) => {
    setMultiSigStep((prev) => {
      const index = MULTISIG_STEPS_ORDER.indexOf(prev);
      return MULTISIG_STEPS_ORDER[index + direction] ?? prev;
    });
  };

  return (
    <div className={style["container"]}>
      {renderMultisigSteps()}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          ...(multiSigStep !== MultiSigSteps.Transaction
            ? {
                width: "98%",
                position: "fixed",
                bottom: "16px",
                left: "50%",
                transform: "translateX(-50%)",
              }
            : { width: "100%" }),
        }}
      >
        {multiSigStep !== MultiSigSteps.Transaction && (
          <ButtonV2
            text="Previous"
            variant="light"
            onClick={() => moveStep(-1)}
            styleProps={{
              ...buttonStyles,
              height: "48px",
              width: "100%",
              marginBottom: 0,
            }}
          />
        )}
        <ButtonV2
          variant="dark"
          styleProps={{
            ...buttonStyles,
            height: "48px",
            width: "100%",
            marginBottom: 0,
          }}
          disabled={
            payloadError !== "" ||
            txnPayload.trim() === "" ||
            account.broadcastInProgress ||
            multiSigAccountError !== "" ||
            (multiSigStep === MultiSigSteps.Signatures &&
              broadcastTxn &&
              (multiSignatures.length < (threshold || 0) ||
                !allSignaturesCollected ||
                !multiSigTransactionAssembled))
          }
          text={buttonText()}
          dataLoading={account.broadcastInProgress}
          onClick={async () => {
            if (
              multiSigStep === MultiSigSteps.ReviewAndBroadcast ||
              !broadcastTxn
            ) {
              await handleSubmit();
            } else {
              moveStep(1);
            }
          }}
        />
      </div>
    </div>
  );
});
