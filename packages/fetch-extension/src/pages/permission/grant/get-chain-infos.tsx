import { ButtonV2 } from "@components-v2/buttons/button";
import { useInteractionInfo } from "@hooks/interaction";
import { EmptyLayout } from "@layouts/empty-layout";
import { observer } from "mobx-react-lite";
import React, { FunctionComponent, useMemo } from "react";
import { FormattedMessage } from "react-intl";
import { useStore } from "../../../stores";
import style from "./style.module.scss";
import { handleExternalInteractionWithNoProceedNext } from "@utils/side-panel";
import { useNavigate } from "react-router";

export const GrantGlobalPermissionGetChainInfosPage: FunctionComponent =
  observer(() => {
    const { permissionStore } = useStore();
    const navigate = useNavigate();
    const data = permissionStore?.waitingGlobalPermissionData;

    const interactionInfo = useInteractionInfo({
      onUnmount: async () => {
        if (data) {
          await permissionStore.rejectPermissionWithProceedNext(
            data.id,
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            () => {}
          );
        }
      },
    });

    const waitingPermissions = data;

    const host = useMemo(() => {
      if (waitingPermissions) {
        return waitingPermissions.data.origins
          .map((origin) => {
            return new URL(origin).host;
          })
          .join(", ");
      } else {
        return "";
      }
    }, [waitingPermissions]);

    const isLoading = data
      ? permissionStore.isObsoleteInteractionApproved(data.id)
      : true;

    return (
      <EmptyLayout style={{ height: "100%", paddingTop: "80px" }}>
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
              id="permissions.grant.get-chain-infos.description.title"
              values={{
                host,
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
              <FormattedMessage id="permissions.grant.get-chain-infos.description.list1" />
            </li>
          </ul>
          <div style={{ flex: 1 }} />
          <div className={style["buttons"]}>
            <ButtonV2
              text=""
              onClick={async (e: any) => {
                e.preventDefault();
                if (data) {
                  await permissionStore.rejectPermissionWithProceedNext(
                    data.id,
                    (proceedNext) => {
                      if (!proceedNext) {
                        if (
                          interactionInfo.interaction &&
                          !interactionInfo.interactionInternal
                        ) {
                          handleExternalInteractionWithNoProceedNext();
                        } else if (
                          interactionInfo.interaction &&
                          interactionInfo.interactionInternal
                        ) {
                          window.history.length > 1
                            ? navigate(-1)
                            : navigate("/");
                        } else {
                          navigate("/", { replace: true });
                        }
                      }
                    }
                  );
                }
              }}
              dataLoading={isLoading}
            >
              <FormattedMessage id="access.button.reject" />
            </ButtonV2>
            <ButtonV2
              text=""
              variant="dark"
              onClick={async (e: any) => {
                e.preventDefault();
                if (data) {
                  await permissionStore.approveGlobalPermissionWithProceedNext(
                    data.id,
                    (proceedNext) => {
                      if (!proceedNext) {
                        if (
                          interactionInfo.interaction &&
                          !interactionInfo.interactionInternal
                        ) {
                          handleExternalInteractionWithNoProceedNext();
                        }
                      }
                    }
                  );
                }
              }}
              disabled={!waitingPermissions}
              dataLoading={isLoading}
            >
              <FormattedMessage id="access.button.approve" />
            </ButtonV2>
          </div>
        </div>
      </EmptyLayout>
    );
  });
