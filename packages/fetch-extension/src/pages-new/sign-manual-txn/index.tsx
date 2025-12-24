import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { Input } from "@components-v2/form";
import { TextArea } from "@components/form";
import { useStore } from "../../stores";
import style from "./styles.module.scss";
import { Checkbox } from "@components-v2/checkbox/checkbox";
import { ButtonV2 } from "@components-v2/buttons/button";
import {
  RequestSignAminoMsg,
  RequestSignDirectMsg,
} from "@keplr-wallet/background";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { SignMode } from "@keplr-wallet/background";
import { Card } from "@components-v2/card";
import { useNotification } from "@components/notification";

type TxnType = SignMode.Amino | SignMode.Direct;

enum SignType {
  SIGN = "sign",
  SIGN_AND_BROADCAST = "sign_and_broadcast",
}

export const SignManualTxn = observer(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const notification = useNotification();
  const { signed, txSignature } = location.state || {};

  const { chainStore, accountStore } = useStore();

  const [txnPayload, setTxnPayload] = useState("");
  const [broadcastTxn, setBroadcastTxn] = useState(false);
  const [txnSigned, setTxnSigned] = useState(false);
  const [signature, setSignature] = useState("");

  const chainId = chainStore.current.chainId;
  const address = accountStore.getAccount(chainId).bech32Address;

  const copyAddress = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      notification.push({
        placement: "top-center",
        type: "success",
        duration: 2,
        content: "Transaction signature copied",
        canDelete: true,
        transition: {
          duration: 0.25,
        },
      });
    },
    [notification]
  );

  useEffect(() => {
    setTxnSigned(signed);
    setSignature(txSignature);
  }, [location]);

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

  const formatJson = (value: string) => {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      try {
        const hex = value.startsWith("0x") ? value.slice(2) : value;

        if (!/^[0-9a-fA-F]+$/.test(hex)) return value;

        const decoded = Buffer.from(hex, "hex").toString("utf8");
        return JSON.stringify(JSON.parse(decoded), null, 2);
      } catch {
        return value;
      }
    }
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
      console.log(signature);
    } else {
    }
  };

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={
        !txnSigned ? "Sign Manual Transaction" : "Signed Transaction"
      }
      showBottomMenu={false}
      onBackButton={() => navigate(-1)}
    >
      <div className={style["container"]}>
        {!txnSigned ? (
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
            <TextArea
              label="Transaction Data (JSON)"
              className={style["txnPayloadInput"]}
              placeholder="Paste the transaction payload to sign"
              value={txnPayload}
              onChange={(e) => setTxnPayload(e.target.value)}
              onBlur={(e: any) => {
                const formatted = formatJson(e.target.value);

                setTxnPayload(formatted);
              }}
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
          <Card
            heading="Signed Transaction"
            style={{
              minHeight: "200px",
            }}
            middleSectionStyle={{
              width: "100%",
            }}
            subheadingStyle={{
              backgroundColor: "white",
              padding: "10px",
              borderRadius: "10px",
              color: "black",
              maxWidth: "100%",
            }}
            subheading={
              <div
                style={{
                  overflowWrap: "break-word",
                  wordWrap: "break-word",
                }}
              >
                {signature}
              </div>
            }
            bottomContent={
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-around",
                  width: "100%",
                }}
              >
                <ButtonV2
                  styleProps={{
                    width: "fit-content",
                    fontSize: "12px",
                    margin: "0px 0px 16px",
                    display: "flex",
                    height: "40px",
                    alignItems: "center",
                    columnGap: "2px",
                  }}
                  variant="dark"
                  text=""
                  onClick={() => copyAddress(signature)}
                >
                  Copy Signature
                  <img
                    style={{ cursor: "pointer", filter: "invert(1)" }}
                    src={require("@assets/svg/wireframe/copyGrey.svg")}
                    alt=""
                  />
                </ButtonV2>
                <ButtonV2
                  styleProps={{
                    width: "fit-content",
                    fontSize: "12px",
                    margin: "0px 0px 16px",
                    display: "flex",
                    alignItems: "center",
                    height: "40px",
                    columnGap: "2px",
                  }}
                  variant="dark"
                  text=""
                  onClick={() => navigate("/more/sign-manual-txn")}
                >
                  Sign New Transaction
                  <img
                    style={{
                      cursor: "pointer",
                      filter: "invert(1)",
                      width: "20px",
                    }}
                    src={require("@assets/svg/wireframe/signature-doc.svg")}
                    alt=""
                  />
                </ButtonV2>
              </div>
            }
          />
        )}
      </div>
    </HeaderLayout>
  );
});
