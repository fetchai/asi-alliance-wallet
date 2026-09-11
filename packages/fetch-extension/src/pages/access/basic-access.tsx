import React, { FunctionComponent, useMemo } from "react";

import { useInteractionInfo } from "@hooks/interaction";
import { ButtonV2 } from "@components-v2/buttons/button";

import { observer } from "mobx-react-lite";
import { useStore } from "../../stores";

import style from "./style.module.scss";
import { EmptyLayout } from "@layouts/empty-layout";
import { FormattedMessage } from "react-intl";
import { handleExternalInteractionWithNoProceedNext } from "@utils/side-panel";
import { useNavigate } from "react-router";

export const AccessPage: FunctionComponent = observer(() => {
  const { chainStore, permissionStore } = useStore();
  const navigate = useNavigate();
  const waitingPermission = permissionStore.waitingPermissionMergedData;

  const interactionInfo = useInteractionInfo({
    onUnmount: async () => {
      await permissionStore.rejectPermissionWithProceedNext(
        waitingPermission?.ids ?? [],
        () => {
          // 뒤로가기 버튼 클릭, macOS의 뒤로가기 제스처 등으로 페이지를 벗어나는 경우에 대한 처리이므로
          // 다음 요청으로 넘어가는 것 외에 추가적인 처리를 하지 않는다.
        }
      );
    },
  });

  const isSecretWasmIncluded = useMemo(() => {
    if (waitingPermission) {
      for (const chainId of waitingPermission.chainIds) {
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
      return waitingPermission.origins
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

    return waitingPermission.chainIds.join(", ");
  }, [waitingPermission]);

  const isLoading = (() => {
    const obsolete = waitingPermission?.ids.find((id) => {
      return permissionStore.isObsoleteInteractionApproved(id);
    });
    return !!obsolete;
  })();

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

              if (waitingPermission?.ids) {
                await permissionStore.rejectPermissionWithProceedNext(
                  waitingPermission?.ids,
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
                        // 내부 인터렉션의 경우 reject만 하고 페이지를 벗어나지 않기 때문에 페이지를 벗어나도록 한다.
                        window.history.length > 1
                          ? navigate(-1)
                          : navigate("/");
                      } else {
                        // 예상치 못한 상황이므로 홈으로 초기화한다.
                        navigate("/", { replace: true });
                      }
                    }
                  }
                );
              }
            }}
            dataLoading={isLoading}
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
              if (waitingPermission?.ids) {
                await permissionStore.approvePermissionWithProceedNext(
                  waitingPermission.ids,
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
            disabled={!waitingPermission}
            dataLoading={isLoading}
            text={<FormattedMessage id="access.button.approve" />}
          />
        </div>
      </div>
    </EmptyLayout>
  );
});
