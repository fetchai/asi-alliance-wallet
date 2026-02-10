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
  convertAminoToProtoMsgs,
  convertProtoJsontoProtoMsgs,
  detectInputType,
  formatJson,
  isValidBech32Address,
  prepareSignDoc,
  validateAminoSignDoc,
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

  const chainId = chainStore.current.chainId;
  const account = accountStore.getAccount(chainId);
  const queries = queriesStore.get(chainId);
  const bech32Prefix = chainStore.current.bech32Config.bech32PrefixAccAddr;
  const address = account.bech32Address;
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
      !!accountAddress && isValidBech32Address(accountAddress, bech32Prefix),
  });

  const onSignSuccess = (_: any, result: any) => {
    navigate("/more/sign-manual-txn", {
      replace: true,
      state: {
        signed: true,
        txSignature: result.signature.signature,
        signatureName: "",
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

    handleSubmitSingle(userAction, signDocData);
  };

  const onTxnSignDocChange = (value: string) => {
    setTxnPayload(value);
    setPayloadError("");
    const formatted = formatJson(value);
    try {
      const signDoc = JSON.parse(formatted);
      const inputType = detectInputType(signDoc);
      if (inputType === "amino") {
        validateAminoSignDoc(signDoc, chainId, address);
      } else {
        validateProtoJsonSignDoc(signDoc, address);
      }
    } catch (err) {
      setPayloadError(err.message);
    }
  };

  return (
    <div className={style["container"]}>
      <TransactionSection
        chainId={chainId}
        address={address}
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
          account.broadcastInProgress
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
