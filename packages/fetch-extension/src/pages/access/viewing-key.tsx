import React, { FunctionComponent, useMemo } from "react";

import { useInteractionInfo } from "@keplr-wallet/hooks";
import { ButtonV2 } from "@components-v2/buttons/button";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import style from "./style.module.scss";
import { EmptyLayout } from "@layouts/empty-layout";
import { FormattedMessage } from "react-intl";
import {
  RequestedChainProvider,
  useRequestedChain,
} from "../../utils/requested-chain-context";
import {
  assertViewingKeyApproveStillValid,
  formatViewingKeyPrepareError,
  prepareViewingKeyRequest,
} from "./prepare-viewing-key-request";

const ViewingKeyAccessBody: FunctionComponent<{
  interactionId: string;
  requestedChainId: string;
  contractAddress: string;
  host: string;
  interactionInfo: ReturnType<typeof useInteractionInfo>;
}> = observer(
  ({
    interactionId,
    requestedChainId,
    contractAddress,
    host,
    interactionInfo,
  }) => {
    const { permissionStore } = useStore();
    const { chainInfo } = useRequestedChain();

    const waitingPermission =
      permissionStore.waitingSecret20ViewingKeyAccessPermissions.length > 0
        ? permissionStore.waitingSecret20ViewingKeyAccessPermissions[0]
        : undefined;

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
                contractAddress,
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
            <li>
              {chainInfo.chainName} ({requestedChainId})
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
                      interactionInfo.interaction &&
                      !interactionInfo.interactionInternal
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

                if (!waitingPermission) {
                  return;
                }

                assertViewingKeyApproveStillValid(
                  waitingPermission,
                  interactionId,
                  requestedChainId
                );

                await permissionStore.approve(waitingPermission.id);
                if (
                  permissionStore.waitingSecret20ViewingKeyAccessPermissions
                    .length === 0
                ) {
                  if (
                    interactionInfo.interaction &&
                    !interactionInfo.interactionInternal
                  ) {
                    window.close();
                  }
                }
              }}
              disabled={!waitingPermission}
              dataLoading={permissionStore.isLoading}
              text={<FormattedMessage id="access.viewing-key.button.approve" />}
            />
          </div>
        </div>
      </EmptyLayout>
    );
  }
);

/**
 * Secret20 viewing-key access approval.
 * Must not call selectChainAndPersist — request chain is request-scoped only.
 */
export const Secret20ViewingKeyAccessPage: FunctionComponent = observer(() => {
  const { chainStore, permissionStore } = useStore();

  const waitingPermission =
    permissionStore.waitingSecret20ViewingKeyAccessPermissions.length > 0
      ? permissionStore.waitingSecret20ViewingKeyAccessPermissions[0]
      : undefined;

  const interactionInfo = useInteractionInfo(() => {
    permissionStore.rejectAll();
  });

  // Recompute every render: waitingPermission is MobX-stable across projection
  // apply, but prepare reads chainInfos — useMemo would stick on resolve_failed.
  const prepared = prepareViewingKeyRequest(chainStore, waitingPermission);

  const host = useMemo(() => {
    if (waitingPermission) {
      return waitingPermission.data.origins
        .map((origin) => {
          return new URL(origin).host;
        })
        .join(",");
    }
    return "";
  }, [waitingPermission]);

  if (!waitingPermission) {
    return (
      <EmptyLayout
        className={style["emptyLayout"]}
        style={{ height: "100%", paddingTop: "80px" }}
      >
        <div className={style["container"]}>
          <i className="fas fa-spinner fa-spin fa-2x text-gray" />
        </div>
      </EmptyLayout>
    );
  }

  if (!prepared.ok) {
    return (
      <EmptyLayout
        className={style["emptyLayout"]}
        style={{ height: "100%", paddingTop: "80px" }}
      >
        <div className={style["container"]}>
          <div style={{ color: "#e74c3c", textAlign: "center" }}>
            {formatViewingKeyPrepareError(prepared.error)}
          </div>
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
                await permissionStore.reject(waitingPermission.id);
                if (
                  permissionStore.waitingSecret20ViewingKeyAccessPermissions
                    .length === 0
                ) {
                  if (
                    interactionInfo.interaction &&
                    !interactionInfo.interactionInternal
                  ) {
                    window.close();
                  }
                }
              }}
              text={<FormattedMessage id="access.viewing-key.button.reject" />}
            />
          </div>
        </div>
      </EmptyLayout>
    );
  }

  return (
    <RequestedChainProvider value={prepared.requested}>
      <ViewingKeyAccessBody
        key={prepared.interactionId}
        interactionId={prepared.interactionId}
        requestedChainId={prepared.requestedChainId}
        contractAddress={prepared.contractAddress}
        host={host}
        interactionInfo={interactionInfo}
      />
    </RequestedChainProvider>
  );
});
