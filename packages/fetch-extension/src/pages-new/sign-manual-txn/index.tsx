import { TabsPanel } from "@components-v2/tabs/tabsPanel-2";
import { useNotification } from "@components/notification";
import { NotificationElementProps } from "@components/notification/element";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { observer } from "mobx-react-lite";
import React, { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { SignTransactionForm } from "./signing-form";
import { TransactionDetails } from "./transaction-details";
import style from "./styles.module.scss";
import { SignAction } from "./types";
import { useStore } from "../../stores";
import { UnsupportedNetwork } from "../activity/unsupported-network";

export const SignManualTxn = observer(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signed, signType } = location.state || {};
  const notification = useNotification();
  const { chainStore } = useStore();
  const chainInfo = chainStore.current;

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
        <SignTransactionForm
          type="single"
          showNotification={showNotification}
        />
      ),
    },
    {
      id: "Multi",
      component: (
        <SignTransactionForm type="multi" showNotification={showNotification} />
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
