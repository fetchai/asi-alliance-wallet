import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
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
import React, { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../../stores";
import { UnsupportedNetwork } from "../activity/unsupported-network";
import { MultiSignForm } from "./multi-sign-form";
import { SingleSignForm } from "./single-sign-form";
import style from "./styles.module.scss";
import { TransactionDetails } from "./transaction-details";
import { SignAction, TxnType } from "./types";

export const buttonStyles = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "40px",
  width: "fit-content",
  fontSize: "14px",
  marginBottom: "12px",
  fontWeight: 400,
};

export const SignManualTxn = observer(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signed, signType } = location.state || {};
  const notification = useNotification();
  const { chainStore, accountStore } = useStore();
  const chainInfo = chainStore.current;
  const chainId = chainStore.current.chainId;
  const account = accountStore.getAccount(chainId);
  const address = account.bech32Address;

  const signManualTxn = async (
    signType: TxnType,
    signDoc: any,
    signDocParams: any,
    onSignSuccess: (signDocParams: any, result: any) => void
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
      onSignSuccess(signDocParams, result);
    } catch (err) {
      console.log("error", err);
      showNotification(err?.message || "Something went wrong", "danger");
    }
  };

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

  const TABS = [
    {
      id: "Single",
      component: (
        <SingleSignForm
          signManualTxn={signManualTxn}
          showNotification={showNotification}
        />
      ),
    },
    {
      id: "Multi",
      component: (
        <MultiSignForm
          signManualTxn={signManualTxn}
          showNotification={showNotification}
        />
      ),
    },
  ];

  return (
    <HeaderLayout
      smallTitle={true}
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      headerTitleClass={style["header-title"]}
      alternativeTitle={
        !signed
          ? "Sign/Broadcast Manual Transaction"
          : signType === SignAction.SIGN
          ? "Signed Transaction"
          : "Transaction Details"
      }
      showBottomMenu={false}
      onBackButton={() => navigate(-1)}
    >
      {chainInfo.features?.includes("evm") ? (
        <UnsupportedNetwork chainID={chainInfo.chainName} />
      ) : (
        <React.Fragment>
          {!signed ? (
            <TabsPanel tabs={TABS} activeTabId={TABS[0].id} />
          ) : (
            <TransactionDetails onCopy={copyAddress} />
          )}
        </React.Fragment>
      )}
    </HeaderLayout>
  );
});
