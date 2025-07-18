import React, { FunctionComponent, useEffect, useMemo } from "react";

import { useInteractionInfo } from "@keplr-wallet/hooks";
import { ButtonV2 } from "@components-v2/buttons/button";

import { ChainIdHelper } from "@keplr-wallet/cosmos";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import style from "./style.module.scss";
import { EmptyLayout } from "@layouts/empty-layout";
import { FormattedMessage } from "react-intl";

export const Secret20ViewingKeyAccessPage: FunctionComponent = observer(() => {
  const { chainStore, permissionStore } = useStore();

  const waitingPermission =
    permissionStore.waitingSecret20ViewingKeyAccessPermissions.length > 0
      ? permissionStore.waitingSecret20ViewingKeyAccessPermissions[0]
      : undefined;

  const ineractionInfo = useInteractionInfo(() => {
    permissionStore.rejectAll();
  });

  useEffect(() => {
    if (waitingPermission) {
      // XXX: You can only one chain id per the request.
      //      This limit exists on the background service.
      chainStore.selectChain(waitingPermission.data.chainIds[0]);
    }
  }, [chainStore, waitingPermission]);

  const host = useMemo(() => {
    if (waitingPermission) {
      return waitingPermission.data.origins
        .map((origin) => {
          return new URL(origin).host;
        })
        .join(",");
    } else {
      return "";
    }
  }, [waitingPermission]);

  return (
    <EmptyLayout
      className={style["emptyLayout"]}
      style={{ height: "100%", paddingTop: "80px" }}
    >
      <div className={style["container"]}>
        <img
          src={require("@assets/png/ASI-Logo-Icon-black.png")}
          alt="logo"
          style={{ width: "180px", height: "40px", margin: "0 auto" }}
        />
        <h1 className={style["header"]}>
          <FormattedMessage id="access.viewing-key.title" />
        </h1>
        <p className={style["paragraph"]}>
          <FormattedMessage
            id="access.viewing-key.paragraph"
            values={{
              host,
              contractAddress: waitingPermission
                ? waitingPermission.data.contractAddress
                : "loading...",
              // eslint-disable-next-line react/display-name
              b: (...chunks: any) => <b>{chunks}</b>,
            }}
          />
        </p>
        <div className={style["permission"]}>
          <FormattedMessage id="access.viewing-key.permission.title" />
        </div>
        <ul>
          <li>
            <FormattedMessage id="access.viewing-key.permission.secret" />
          </li>
        </ul>
        <div style={{ flex: 1 }} />
        <div className={style["buttons"]}>
          <ButtonV2
            styleProps={{
              padding: "10px",
              height: "40px",
              fontSize: "0.9rem",
            }}
            onClick={async (e: any) => {
              e.preventDefault();

              if (waitingPermission) {
                await permissionStore.reject(waitingPermission.id);
                if (
                  permissionStore.waitingSecret20ViewingKeyAccessPermissions
                    .length === 0
                ) {
                  if (
                    ineractionInfo.interaction &&
                    !ineractionInfo.interactionInternal
                  ) {
                    window.close();
                  }
                }
              }
            }}
            dataLoading={permissionStore.isLoading}
            text={<FormattedMessage id="access.viewing-key.button.reject" />}
          />
          <ButtonV2
            variant="dark"
            styleProps={{
              padding: "10px",
              height: "40px",
              fontSize: "0.9rem",
            }}
            onClick={async (e: any) => {
              e.preventDefault();

              if (waitingPermission) {
                await permissionStore.approve(waitingPermission.id);
                if (
                  permissionStore.waitingSecret20ViewingKeyAccessPermissions
                    .length === 0
                ) {
                  if (
                    ineractionInfo.interaction &&
                    !ineractionInfo.interactionInternal
                  ) {
                    window.close();
                  }
                }
              }
            }}
            disabled={
              !waitingPermission ||
              ChainIdHelper.parse(chainStore.current.chainId).identifier !==
                ChainIdHelper.parse(waitingPermission.data.chainIds[0])
                  .identifier
            }
            dataLoading={permissionStore.isLoading}
            text={<FormattedMessage id="access.viewing-key.button.approve" />}
          />
        </div>
      </div>
    </EmptyLayout>
  );
});
