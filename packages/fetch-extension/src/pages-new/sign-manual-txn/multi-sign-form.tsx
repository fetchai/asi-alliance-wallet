import { ButtonV2 } from "@components-v2/buttons/button";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { SignMode } from "@keplr-wallet/background";
import { observer } from "mobx-react-lite";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../stores";
import style from "./styles.module.scss";
import {
  MultiSigSteps,
  SignAction,
  SignDocData,
  SignerFormProps,
} from "./types";
import {
  assembleMultisigTx,
  buildSignedTxnPayload,
  convertProtoJsontoProtoMsgs,
  convertToProtoJsonPubKey,
  createSignature,
  createSignaturesMap,
  formatJson,
  getMultisigAccountError,
  getTxnAndSignatureFileNames,
  isSignatureCollected,
  orderMultisigSignatures,
  prepareSignDoc,
  protoMultisigToAmino,
  snakeToCamelDeep,
  validateProtoJsonSignDoc,
} from "./utils";
import { TransactionSection } from "./transaction-section";
import { MultiSignaturesSection } from "./multi-signatures-section";
import { buttonStyles } from ".";
import { ConfirmMultisigBroadcast } from "./confirm-multi-broadcast";
import { Pubkey, pubkeyToAddress } from "@cosmjs/amino";
import classNames from "classnames";
import { useAccountQuery } from "./use-account-query";
import { MultisigPublicKeySection } from "./multisig-pubkey-section";

const MULTISIG_STEPS_ORDER: MultiSigSteps[] = [
  MultiSigSteps.Transaction,
  MultiSigSteps.Signatures,
  MultiSigSteps.ReviewAndBroadcast,
];

export const MultiSignForm: React.FC<SignerFormProps> = observer(
  ({ chainId, account, signManualTxn, showNotification }) => {
    const navigate = useNavigate();
    const { chainStore } = useStore();
    const [txnFileName, setTxnFileName] = useState("");
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
    const [pubKeyError, setPubKeyError] = useState<string>("");
    const [offlineSigning, setOfflineSigning] = useState(false);
    const [accountInfo, setAccountInfo] = useState({
      accountNumber: "",
      sequence: "",
    });

    const bech32Prefix = chainStore.current.bech32Config.bech32PrefixAccAddr;
    const address = account.bech32Address;
    const accountName = account.name;
    const accountAddress = multisigAccount;

    const { data: accountData } = useAccountQuery(accountAddress, {
      enabled: !offlineSigning,
    });

    const pubKeyMultisigAccount =
      accountData?.account?.pub_key?.key?.pubkeys ||
      JSON.parse(multiSigPubKeys || "{}")?.public_keys?.map((pub: any) => ({
        type: pub["@type"],
        value: pub.key,
      }));

    const accountDetails = {
      sequence:
        (offlineSigning
          ? accountInfo.sequence
          : accountData?.account?.sequence) || "0",
      account_number:
        (offlineSigning
          ? accountInfo.accountNumber
          : accountData?.account?.account_number) || "0",
    };

    useEffect(() => {
      setThreshold(Number(accountData?.account?.pub_key?.key?.threshold || 0));
    }, [accountData]);

    useEffect(() => {
      if (!threshold) return setAllSignaturesCollected(false);

      const collectedCount =
        multiSignatures.filter(isSignatureCollected).length;
      setAllSignaturesCollected(collectedCount >= threshold);
    }, [multiSignatures, threshold]);

    const createSignedTxn = (sequence: any, parsedTxnPayload: any) => {
      const protoJsonPubKey = multiSigPubKeys
        ? JSON.parse(multiSigPubKeys)
        : convertToProtoJsonPubKey(accountData?.account?.pub_key);
      const addresses = pubKeyMultisigAccount?.map((pk: Pubkey) =>
        pubkeyToAddress(
          { ...pk, type: "tendermint/PubKeySecp256k1" },
          bech32Prefix
        )
      );
      const signerIndex = addresses?.findIndex(
        (addr: string) => addr === account.bech32Address
      );

      return formatJson(
        JSON.stringify(
          buildSignedTxnPayload({
            txnPayload: parsedTxnPayload,
            signingMode: "amino",
            sequence: sequence,
            pubKey: protoJsonPubKey,
            isMultisig: true,
            signerIndex,
          })
        )
      );
    };

    const onSignSuccess = (signDocParams: any, result: any, fileNames: any) => {
      const parsedTxnPayload = JSON.parse(txnPayload);
      navigate("/more/sign-manual-txn", {
        replace: true,
        state: {
          signed: true,
          txSignature: createSignature(result, signDocParams.sequence),
          signedTxn: createSignedTxn(signDocParams?.sequence, parsedTxnPayload),
          signatureFileName: fileNames.signature,
          txnFileName: fileNames.transaction,
        },
      });
    };

    const handleSubmit = async () => {
      const accountDetails = {
        sequence:
          (offlineSigning
            ? accountInfo.sequence
            : accountData?.account?.sequence) || "0",
        account_number:
          (offlineSigning
            ? accountInfo.accountNumber
            : accountData?.account?.account_number) || "0",
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
        const fileNames = getTxnAndSignatureFileNames({
          accountName: accountName || address,
          sequence: accountDetails.sequence,
          accountNumber: accountDetails.account_number,
          fileName: txnFileName,
        });

        const { payloadObj, signDocParams, signDoc } = signDocData;
        if (userAction === SignAction.SIGN) {
          await signManualTxn(
            SignMode.Amino,
            signDoc,
            signDocParams,
            onSignSuccess,
            fileNames
          );
        } else {
          const protoMsgs = convertProtoJsontoProtoMsgs(
            payloadObj.body.messages
          );
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
              signedTxn: createSignedTxn(
                signDocParams?.sequence,
                JSON.parse(txnPayload)
              ),
              txnFileName: fileNames.transaction,
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
          signatures = orderMultisigSignatures(
            signatures,
            pubKeyMultisigAccount
          );
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
            : null,
          bech32Prefix
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
        validateProtoJsonSignDoc(signDoc, multisigAccount);
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

    const multiSigAccountError = getMultisigAccountError({
      multisigAccount,
      offlineSigning,
      bech32Prefix,
      accountData,
      multiSigPubKeys,
    });

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
            accountName={accountName}
            broadcastTxn={broadcastTxn}
            offlineSigning={offlineSigning}
            setTxnFileName={setTxnFileName}
            setOfflineSigning={setOfflineSigning}
            accountInfo={accountInfo}
            setAccountInfo={setAccountInfo}
            type="multi"
            onTxnSignDocChange={onTxnSignDocChange}
            multisigAccount={multisigAccount}
            multiSigAccountError={multiSigAccountError}
            payloadError={payloadError}
            showNotification={showNotification}
            txnPayload={txnPayload}
            onMultisigAccountChange={(value) => setMultiSigAccount(value)}
          />
          <MultisigPublicKeySection
            broadcastTxn={broadcastTxn}
            offlineSigning={offlineSigning}
            multisigAccount={multisigAccount}
            accountPubKey={accountData?.account?.pub_key}
            multiSigPubKeys={multiSigPubKeys}
            multiSigAccountError={Boolean(multiSigAccountError)}
            pubKeyError={pubKeyError}
            threshold={threshold}
            handlePubkeysChange={handlePubkeysChange}
            handleThresholdChange={handleThresholdChange}
            setMultiSigPubKeys={setMultiSigPubKeys}
            setPubKeyError={setPubKeyError}
            showNotification={showNotification}
          />
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
          className={classNames(
            style["multisigFooter"],
            multiSigStep !== MultiSigSteps.Transaction
              ? style["fixedFooter"]
              : style["fullWidth"]
          )}
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
              pubKeyError !== "" ||
              (offlineSigning &&
                (accountInfo.accountNumber === "" ||
                  accountInfo.sequence === "")) ||
              multisigAccount === "" ||
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
  }
);
