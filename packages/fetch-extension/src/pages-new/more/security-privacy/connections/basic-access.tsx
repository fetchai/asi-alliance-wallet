import React, { FunctionComponent, useMemo } from "react";

import style from "../../style.module.scss";
import { useNavigate } from "react-router";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { useIntl } from "react-intl";
import { useConfirm } from "@components/confirm";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { Card } from "@components-v2/card";
import { formatString } from "@utils/format";
import { NoResults } from "@components-v2/no-results";

export const SettingConnectionsPage: FunctionComponent = observer(() => {
  const navigate = useNavigate();
  const intl = useIntl();

  const { chainStore, permissionStore, analyticsStore } = useStore();
  const selectedChainId = chainStore.current.chainId;

  const basicAccessInfo = permissionStore.getBasicAccessInfo(selectedChainId);

  // const [dropdownOpen, setOpen] = useState(false);
  // const toggle = () => setOpen(!dropdownOpen);

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
      smallTitle={true}
      showBottomMenu={false}
      alternativeTitle={intl.formatMessage({
        id: "setting.connections",
      })}
      onBackButton={() => {
        analyticsStore.logEvent("back_click", {
          pageName: "Wallet Access Permissions",
        });

        navigate(-1);
      }}
    >
      <div className={style["container"]}>
        {basicAccessInfo?.origins && basicAccessInfo?.origins?.length > 0 ? (
          basicAccessInfo.origins.map((origin) => {
            return (
              <Card
                heading={formatString(origin)}
                key={origin}
                onClick={async (e: { preventDefault: () => void }) => {
                  e.preventDefault();

                  if (
                    await confirm.confirm({
                      img: (
                        <img
                          alt="unlink"
                          src={require("@assets/img/broken-link.svg")}
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
                    await basicAccessInfo.removeOrigin(origin);
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
            message="No Wallet Access Permissions"
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
});
