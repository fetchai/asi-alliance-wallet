import { ButtonV2 } from "@components-v2/buttons/button";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { Input } from "@components-v2/form";
import { TextArea } from "@components/form";
import { useNotification } from "@components/notification";
import { NotificationElementProps } from "@components/notification/element";
import {
  RequestSignAminoMsg,
  RequestSignDirectMsg,
  SignMode,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../../stores";
import style from "./styles.module.scss";
import { TransactionDetails } from "./transaction-details";
import {
  CosmosMsgTypes,
  convertAminoToProtoMsg,
  formatJson,
  validateAminoSignDoc,
  validateDirectSignDoc,
} from "./utils";

type TxnType = SignMode.Amino | SignMode.Direct;

enum SignType {
  SIGN = "sign",
  SIGN_AND_BROADCAST = "sign_and_broadcast",
}

export const SignManualTxn = observer(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const notification = useNotification();
  const { signed, signType } = location.state || {};

  const { chainStore, accountStore } = useStore();

  const [txnPayload, setTxnPayload] = useState("");
  const [broadcastTxn, setBroadcastTxn] = useState(false);
  const [payloadError, setPayloadError] = useState("");
  const signingType = SignMode.Amino;

  const chainId = chainStore.current.chainId;
  const account = accountStore.getAccount(chainId);
  const address = account.bech32Address;

  const showNotification = (
    message: string,
    type: NotificationElementProps["type"] = "success"
  ) => {
    notification.push({
      placement: "top-center",
      type,
      duration: 2,
      content: message || "Copied to clipboard",
      canDelete: true,
      transition: {
        duration: 0.25,
      },
    });
  };

  const copyAddress = useCallback(
    async (text: string, message: string) => {
      await navigator.clipboard.writeText(text);
      showNotification(message);
    },
    [notification]
  );

  const detectTxType = (tx: any): TxnType => {
    if (!tx || typeof tx !== "object") {
      throw new Error("Invalid tx object");
    }

    if (
      "bodyBytes" in tx &&
      tx.bodyBytes != null &&
      "authInfoBytes" in tx &&
      tx.authInfoBytes != null
    ) {
      return SignMode.Direct;
    }

    // Amino transaction detection
    if (Array.isArray(tx.msgs) && "chain_id" in tx && "account_number" in tx) {
      return SignMode.Amino;
    }

    throw new Error("Unknown transaction format");
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

  const handleSubmit = async (type: SignType) => {
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
          protoMsgs: convertAminoToProtoMsg(payloadObj),
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

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={
        !signed
          ? "Sign Manual Transaction"
          : signType === SignType.SIGN
          ? "Signed Transaction"
          : "Transaction Details"
      }
      showBottomMenu={false}
      onBackButton={() => navigate(-1)}
    >
      <div className={style["container"]}>
        {!signed ? (
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
            <Input
              label="Account"
              type="text"
              name="account"
              value={address}
              formGroupClassName={style["formGroup"]}
              formFeedbackClassName={style["formFeedback"]}
              readOnly
            />
            {/* <div className={style["signingTypeDropdownContainer"]}>
              <Label className={style["inputLabel"]}>Signing Type</Label>
              <SigningTypeDropdown
                value={signingType}
                onChange={(type) => setSigningType(type)}
              />
            </div> */}
            <TextArea
              label="Transaction Data (JSON)"
              className={style["txnPayloadInput"]}
              placeholder="Paste the transaction payload to sign"
              value={txnPayload}
              onChange={(e) => {
                setTxnPayload(e.target.value);
                setPayloadError("");
                const formatted = formatJson(e.target.value);
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
              }}
              onBlur={(e: any) => {
                const formatted = formatJson(e.target.value);
                setTxnPayload(formatted);
              }}
              error={payloadError}
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
              disabled={payloadError !== "" || txnPayload.trim() === ""}
              text={
                broadcastTxn
                  ? "Sign and Broadcast Transaction"
                  : "Sign Transaction"
              }
              onClick={() =>
                handleSubmit(
                  broadcastTxn ? SignType.SIGN_AND_BROADCAST : SignType.SIGN
                )
              }
            />
          </React.Fragment>
        ) : (
          <TransactionDetails onCopy={copyAddress} />
        )}
      </div>
    </HeaderLayout>
  );
});
