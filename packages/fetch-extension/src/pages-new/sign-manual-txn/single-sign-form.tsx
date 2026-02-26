import { ButtonV2 } from "@components-v2/buttons/button";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { SignMode } from "@keplr-wallet/background";
import { observer } from "mobx-react-lite";
import React, { useState } from "react";
import { useNavigate } from "react-router";
import style from "./styles.module.scss";
import { TransactionSection } from "./transaction-section";
import { SignAction, SignDocData, SignerFormProps } from "./types";
import {
  CosmosMsgTypesAmino,
  CosmosMsgTypesProto,
  buildSignedTxnPayload,
  convertAminoToProtoMsgs,
  convertProtoJsontoProtoMsgs,
  createSignature,
  formatJson,
  getTxnAndSignatureFileNames,
  prepareSignDoc,
  validateProtoJsonSignDoc,
} from "./utils";
import { buttonStyles } from ".";
import { useAccountQuery } from "./use-account-query";

export const SingleSignForm: React.FC<SignerFormProps> = observer(
  ({ chainId, account, signManualTxn, showNotification }) => {
    const navigate = useNavigate();
    const [txnFileName, setTxnFileName] = useState("");
    const [txnPayload, setTxnPayload] = useState("");
    const [broadcastTxn, setBroadcastTxn] = useState(false);
    const [payloadError, setPayloadError] = useState("");
    const [offlineSigning, setOfflineSigning] = useState(false);
    const [accountInfo, setAccountInfo] = useState({
      accountNumber: "",
      sequence: "",
    });

    const address = account.bech32Address;
    const accountName = account.name;

    const { data: accountData } = useAccountQuery(address, {
      enabled: !offlineSigning,
    });

    const createSignedTxn = (sequence: any, txnPayload: any, pubKey: any) => {
      return formatJson(
        JSON.stringify(
          buildSignedTxnPayload({
            txnPayload: JSON.parse(txnPayload),
            signingMode: "amino",
            sequence: sequence,
            pubKey,
          })
        )
      );
    };

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

    const onSignSuccess = (signDocParams: any, result: any, fileNames: any) => {
      navigate("/more/sign-manual-txn", {
        replace: true,
        state: {
          signed: true,
          txSignature: createSignature(result, signDocParams.sequence),
          signedTxn: createSignedTxn(
            signDocParams?.sequence,
            txnPayload,
            result.signature.pub_key
          ),
          signatureFileName: fileNames.signature,
          txnFileName: fileNames.transaction,
        },
      });
    };

    const handleSubmitSingle = async (
      userAction: SignAction,
      signDocData: SignDocData
    ) => {
      const fileNames = getTxnAndSignatureFileNames({
        accountName: accountName || address,
        sequence: accountDetails.sequence,
        accountNumber: accountDetails.account_number,
        fileName: txnFileName,
      });

      const { payloadObj, signDocParams, signDoc, signDocType } = signDocData;

      if (userAction === SignAction.SIGN) {
        await signManualTxn(
          SignMode.Amino,
          signDoc,
          signDocParams,
          onSignSuccess,
          fileNames
        );
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
                  signedTxn: createSignedTxn(
                    signDocParams?.sequence,
                    txnPayload,
                    accountData?.account?.pub_key
                  ),
                  txnFileName: fileNames.transaction,
                },
              });
            },
            onBroadcasted: (_txHash) => {
              showNotification("Transaction broadcasted");
            },
            onBroadcastFailed: (_error) => {
              console.log("Broadcast failed:", _error);
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

    const handleSubmit = async () => {
      const signDocData = await prepareSignDoc(
        txnPayload,
        accountDetails,
        chainId
      );
      const userAction = broadcastTxn
        ? SignAction.SIGN_AND_BROADCAST
        : SignAction.SIGN;

      handleSubmitSingle(userAction, signDocData);
    };

    const onTxnSignDocChange = (value: string) => {
      setTxnPayload(value);
      setPayloadError("");
      const formatted = formatJson(value);
      try {
        const signDoc = JSON.parse(formatted);
        validateProtoJsonSignDoc(signDoc, address);
      } catch (err) {
        setPayloadError(err.message);
      }
    };

    return (
      <div className={style["container"]}>
        <TransactionSection
          chainId={chainId}
          address={address}
          setTxnFileName={setTxnFileName}
          accountName={accountName}
          broadcastTxn={broadcastTxn}
          offlineSigning={offlineSigning}
          setOfflineSigning={setOfflineSigning}
          accountInfo={accountInfo}
          setAccountInfo={setAccountInfo}
          onTxnSignDocChange={onTxnSignDocChange}
          payloadError={payloadError}
          showNotification={showNotification}
          txnPayload={txnPayload}
        />
        <Checkbox
          isChecked={broadcastTxn}
          setIsChecked={setBroadcastTxn}
          label="Broadcast Transaction"
        />
        <ButtonV2
          variant="dark"
          styleProps={{
            ...buttonStyles,
            width: "100%",
            height: "48px",
            marginBottom: 0,
          }}
          disabled={
            payloadError !== "" ||
            txnPayload.trim() === "" ||
            account.broadcastInProgress ||
            (offlineSigning &&
              (accountInfo.accountNumber === "" || accountInfo.sequence === ""))
          }
          text={
            broadcastTxn ? (
              <React.Fragment>
                Sign and Broadcast Transaction &nbsp;
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
            await handleSubmit();
          }}
        />
      </div>
    );
  }
);
