import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import style from "../../../style.module.scss";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router";
import { useConfirm } from "@components/confirm";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import {
  GetGlobalPermissionOriginsMsg,
  RemoveGlobalPermissionOriginMsg,
} from "@keplr-wallet/background";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { useStore } from "../../../../../stores";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { Card } from "@components-v2/card";
import { NoResults } from "@components-v2/no-results";

export const PermissionsGetChainInfosPage: FunctionComponent = () => {
  const [requester] = useState(() => new InExtensionMessageRequester());
  const [origins, setOrigins] = useState<string[]>([]);
  const { analyticsStore, chainStore } = useStore();
  useEffect(() => {
    // TODO: Handle this in store (GeneralPermissionStore?)
    requester
      .sendMessage(
        BACKGROUND_PORT,
        new GetGlobalPermissionOriginsMsg("get-chain-infos")
      )
      .then((r) => setOrigins(r));
  }, [requester]);

  const navigate = useNavigate();
  const intl = useIntl();

  const confirm = useConfirm();

  const xIcon = useMemo(
    () => [<i key="remove" className="fas fa-times" />],
    []
  );

  return (
    <HeaderLayout
      showTopMenu={true}
      showChainName={false}
      canChangeChainInfo={false}
      showBottomMenu={false}
      smallTitle={true}
      alternativeTitle={intl.formatMessage({
        id: "setting.permissions.get-chain-infos",
      })}
      onBackButton={() => {
        analyticsStore.logEvent("back_click", {
          pageName: "Chain List Access ",
        });
        navigate(-1);
      }}
    >
      <div className={style["container"]}>
        {origins && origins?.length > 0 ? (
          origins.map((origin) => {
            return (
              <Card
                heading={origin}
                key={origin}
                onClick={async (e: any) => {
                  e.preventDefault();
                  analyticsStore.logEvent("show_hide_chain", {
                    chainId: chainStore.current.chainId,
                    chainName: chainStore.current.chainName,
                  });

                  if (
                    await confirm.confirm({
                      img: (
                        <img
                          alt="unlink"
                          src={require("../../../../../public/assets/img/broken-link.svg")}
                          style={{ height: "80px" }}
                        />
                      ),
                      title: intl.formatMessage({
                        id: "setting.connections.confirm.delete-connection.title",
                      }),
                      paragraph: intl.formatMessage({
                        id: "setting.connections.confirm.delete-connection.paragraph",
                      }),
                    })
                  ) {
                    await requester.sendMessage(
                      BACKGROUND_PORT,
                      new RemoveGlobalPermissionOriginMsg(
                        "get-chain-infos",
                        origin
                      )
                    );

                    const origins = await requester.sendMessage(
                      BACKGROUND_PORT,
                      new GetGlobalPermissionOriginsMsg("get-chain-infos")
                    );
                    setOrigins(origins);
                  }
                }}
                rightContent={xIcon}
              />
            );
          })
        ) : (
          <NoResults
            styles={{
              height: "410px",
              rowGap: "0px",
            }}
            contentStyles={{
              color: "var(--font-dark)",
              textAlign: "center",
              fontSize: "24px",
              lineHeight: "34px",
              width: "320px",
            }}
            message="No Chain List Access Permissions"
            icon={
              <img
                src={require("@assets/svg/wireframe/no-activity.svg")}
                style={{ marginBottom: "24px" }}
                alt=""
              />
            }
          />
        )}
      </div>
    </HeaderLayout>
  );
};
