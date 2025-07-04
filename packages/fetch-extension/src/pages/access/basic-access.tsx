import React, { FunctionComponent, useMemo } from "react";

import { useInteractionInfo } from "@keplr-wallet/hooks";
import { ButtonV2 } from "@components-v2/buttons/button";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import style from "./style.module.scss";
import { EmptyLayout } from "@layouts/empty-layout";
import { FormattedMessage } from "react-intl";

export const AccessPage: FunctionComponent = observer(() => {
  const { chainStore, permissionStore } = useStore();

  const waitingPermission =
    permissionStore.waitingBasicAccessPermissions.length > 0
      ? permissionStore.waitingBasicAccessPermissions[0]
      : undefined;

  const ineractionInfo = useInteractionInfo(() => {
    permissionStore.rejectAll();
  });

  const isSecretWasmIncluded = useMemo(() => {
    if (waitingPermission) {
      for (const chainId of waitingPermission.data.chainIds) {
        if (chainStore.hasChain(chainId)) {
          const chainInfo = chainStore.getChain(chainId);
          if (chainInfo.features && chainInfo.features.includes("secretwasm")) {
            return true;
          }
        }
      }
    }
    return false;
  }, [chainStore, waitingPermission]);

  const host = useMemo(() => {
    if (waitingPermission) {
      return waitingPermission.data.origins
        .map((origin) => {
          return new URL(origin).host;
        })
        .join(", ");
    } else {
      return "";
    }
  }, [waitingPermission]);

  const chainIds = useMemo(() => {
    if (!waitingPermission) {
      return "";
    }

    return waitingPermission.data.chainIds.join(", ");
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
          <FormattedMessage id="access.title" />
        </h1>
        <p className={style["paragraph"]}>
          <FormattedMessage
            id="access.paragraph"
            values={{
              host,
              chainId: chainIds,
              // eslint-disable-next-line react/display-name
              b: (...chunks: any) => <b>{chunks}</b>,
            }}
          />
        </p>
        <div className={style["permission"]}>
          <FormattedMessage id="access.permission.title" />
        </div>
        <ul>
          <li>
            <FormattedMessage id="access.permission.account" />
          </li>
          <li>
            <FormattedMessage id="access.permission.tx-request" />
          </li>
          {isSecretWasmIncluded ? (
            <li>
              <FormattedMessage id="access.permission.secret" />
            </li>
          ) : null}
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
                  permissionStore.waitingBasicAccessPermissions.length === 0
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
            text={<FormattedMessage id="access.button.reject" />}
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
                  permissionStore.waitingBasicAccessPermissions.length === 0
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
            disabled={!waitingPermission}
            dataLoading={permissionStore.isLoading}
            text={<FormattedMessage id="access.button.approve" />}
          />
        </div>
      </div>
    </EmptyLayout>
  );
});
