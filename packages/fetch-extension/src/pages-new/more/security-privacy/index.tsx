import React, { FunctionComponent } from "react";
import style from "../style.module.scss";
import { useNavigate } from "react-router";
import { useIntl } from "react-intl";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { Card } from "@components-v2/card";

export const SecurityPrivacyPage: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const { analyticsStore, keyRingStore } = useStore();

  const intl = useIntl();
  const selectedKeyId = keyRingStore.selectedKeyInfo?.id;
  return (
    <HeaderLayout
      showTopMenu={true}
      smallTitle={true}
      showBottomMenu={false}
      showChainName={false}
      canChangeChainInfo={false}
      alternativeTitle={intl.formatMessage({
        id: "setting.security-privacy",
      })}
      onBackButton={() => {
        analyticsStore.logEvent("back_click", {
          pageName: "Security & Privacy",
        });
        navigate(-1);
      }}
    >
      <div className={style["container"]}>
        <Card
          style={{
            marginBottom: "8px",
            padding: "18px",
          }}
          leftImageStyle={{ background: "transparent" }}
          leftImage={require("@assets/svg/wireframe/key.svg")}
          heading={`View ${
            keyRingStore.selectedKeyInfo?.type === "mnemonic"
              ? "mnemonic seed"
              : "Private key"
          }`}
          onClick={() => {
            if (!selectedKeyId) {
              return;
            }
            navigate(`/more/export/${selectedKeyId}`, {
              state: { type: keyRingStore.selectedKeyInfo?.type },
            });
            analyticsStore.logEvent("view_mnemonic_seed_click", {
              pageName: "Security & Privacy",
            });
          }}
        />
        <Card
          leftImage={require("@assets/svg/wireframe/change-password.svg")}
          style={{
            marginBottom: "8px",
            padding: "18px",
          }}
          leftImageStyle={{ background: "transparent" }}
          heading={
            "Change Password"
            //   intl.formatMessage({
            //   id: "setting.permissions.get-chain-infos",
            // })
          }
          onClick={() => {
            navigate("/more/security-privacy/change-password");
            analyticsStore.logEvent("change_password_click", {
              pageName: "Security & Privacy",
            });
          }}
        />
        <Card
          style={{
            marginBottom: "8px",
            height: "78px",
            padding: "18px",
          }}
          leftImageStyle={{ background: "transparent" }}
          leftImage={require("@assets/svg/wireframe/wallet-access-permission.svg")}
          heading={intl.formatMessage({
            id: "setting.connections",
          })}
          subheading={intl.formatMessage({
            id: "setting.connections.paragraph",
          })}
          onClick={() => {
            navigate("/more/security-privacy/connections");
            analyticsStore.logEvent("wallet_access_permissions_click", {
              pageName: "Security & Privacy",
            });
          }}
        />
        <Card
          leftImage={require("@assets/svg/wireframe/chain-list-access.svg")}
          style={{
            marginBottom: "8px",
            height: "78px",
          }}
          leftImageStyle={{ background: "transparent" }}
          heading={intl.formatMessage({
            id: "setting.permissions.get-chain-infos",
          })}
          subheading={intl.formatMessage({
            id: "setting.permissions.get-chain-infos.paragraph",
          })}
          onClick={() => {
            navigate("/more/permissions/get-chain-infos");
            analyticsStore.logEvent("chain_list_access_click", {
              pageName: "Security & Privacy",
            });
          }}
        />
        <Card
          leftImage={require("@assets/svg/wireframe/auto-lock-timer.svg")}
          style={{
            paddingLeft: "18px",
          }}
          leftImageStyle={{
            background: "transparent",
          }}
          heading={intl.formatMessage({
            id: "setting.autolock",
          })}
          onClick={() => {
            navigate("/more/security-privacy/autolock");
            analyticsStore.logEvent("auto_lock_timer_click", {
              pageName: "Security & Privacy",
            });
          }}
        />
      </div>
    </HeaderLayout>
  );
});
