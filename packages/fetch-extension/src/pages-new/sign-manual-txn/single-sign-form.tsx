import { ButtonV2 } from "@components-v2/buttons/button";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { SignMode } from "@keplr-wallet/background";
import { useQuery } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../stores";
import style from "./styles.module.scss";
import { TransactionSection } from "./transaction-section";
import { SignAction, SignDocData, SignManualTxn } from "./types";
import {
  CosmosMsgTypesAmino,
  CosmosMsgTypesProto,
  buildSignedTxnPayload,
  convertAminoToProtoMsgs,
  convertProtoJsontoProtoMsgs,
  createSignature,
  formatJson,
  isValidBech32Address,
  prepareSignDoc,
  validateProtoJsonSignDoc,
} from "./utils";

export const SingleSignForm: React.FC<{
  signManualTxn: SignManualTxn;
  showNotification: (message: string, type?: any) => void;
}> = observer(({ signManualTxn, showNotification }) => {
  const navigate = useNavigate();

  const { chainStore, accountStore, queriesStore } = useStore();

  const [txnPayload, setTxnPayload] = useState("");
  const [broadcastTxn, setBroadcastTxn] = useState(false);
  const [payloadError, setPayloadError] = useState("");
  const [offlineSigning, setOfflineSigning] = useState(false);
  const [accountInfo, setAccountInfo] = useState({
    accountNumber: "",
    sequence: "",
  });

  const chainId = chainStore.current.chainId;
  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);
  const bech32Prefix = chainStore.current.bech32Config.bech32PrefixAccAddr;
  const address = account.bech32Address;
  const accountName = account.name;
  const accountAddress = address;

  const { data: accountData } = useQuery({
    queryKey: ["accountData", accountAddress],
    queryFn: async () => {
      const accountData = await queries.cosmos.queryAccount
        .getQueryBech32Address(accountAddress)
        .waitResponse();
      console.log("response from api", accountData);
      return accountData?.data;
    },
    enabled:
      !!accountAddress &&
      isValidBech32Address(accountAddress, bech32Prefix) &&
      !offlineSigning,
  });

  const onSignSuccess = (signDocParams: any, result: any) => {
    navigate("/more/sign-manual-txn", {
      replace: true,
      state: {
        signed: true,
        txSignature: createSignature(result, signDocParams.sequence),
        signedTxn: formatJson(
          JSON.stringify(
            buildSignedTxnPayload({
              txnPayload: JSON.parse(txnPayload),
              signingMode: "amino",
              sequence: signDocParams.sequence,
              pubKey: result.signature.pub_key,
            })
          )
        ),
        downloadFilename: `${account.bech32Address}-${chainId}-${signDocParams.sequence}`,
      },
    });
  };

  const handleSubmitSingle = async (
    userAction: SignAction,
    signDocData: SignDocData
  ) => {
    const { payloadObj, signDocParams, signDoc, signDocType } = signDocData;

    if (userAction === SignAction.SIGN) {
      await signManualTxn(
        SignMode.Amino,
        signDoc,
        signDocParams,
        onSignSuccess
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

  const handleSubmit = async () => {
    const accountDetails =
      offlineSigning && !broadcastTxn
        ? {
            sequence: accountInfo.sequence || "0",
            account_number: accountInfo.accountNumber || "0",
          }
        : {
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
});
