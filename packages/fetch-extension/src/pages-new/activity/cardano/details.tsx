import React, { useCallback, useMemo } from "react";
import { HeaderLayout } from "@layouts-v2/header-layout";
import { useLocation, useNavigate } from "react-router";
import { Card } from "@components-v2/card";
import style from "../activity-details/style.module.scss";
import { useNotification } from "@components/notification";
import { useIntl } from "react-intl";
import { useStore } from "../../../stores";
import { lovelacesToAdaString, formatAssetAmount } from "@keplr-wallet/cardano";
import { getCardanoAssetIconUrl } from "./cardano-asset-utils";
import type { CardanoTxHistoryItem } from "@keplr-wallet/background";

const directionLabel = (d: CardanoTxHistoryItem["direction"]) => {
  switch (d) {
    case "sent":
      return "Sent";
    case "received":
      return "Received";
    case "self":
      return "Self";
    default:
      return "Transaction";
  }
};

type CardanoActivityLocationState = { item?: CardanoTxHistoryItem | null };

export const CardanoActivityDetails = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: CardanoActivityLocationState };
  const item = location?.state?.item ?? null;
  const notification = useNotification();
  const intl = useIntl();
  const { chainStore } = useStore();
  const denom = chainStore.current.stakeCurrency.coinDenom;
  const adaIcon = chainStore.current.stakeCurrency?.coinImageUrl || denom[0]?.toUpperCase() || "A";

  const amountAda = useMemo(() => (item ? lovelacesToAdaString(item.amount) : "0"), [item]);
  const feeAda = useMemo(() => (item?.fee ? lovelacesToAdaString(item.fee) : "0"), [item]);

  const copyTxId = useCallback(async () => {
    if (!item?.id) return;
    await navigator.clipboard.writeText(item.id);
    notification.push({
      placement: "top-center",
      type: "success",
      duration: 2,
      content: intl.formatMessage({ id: "main.address.copied" }),
      canDelete: true,
      transition: { duration: 0.25 },
    });
  }, [intl, item?.id, notification]);

  return (
    <HeaderLayout
      onBackButton={() => navigate(-1)}
      showTopMenu={true}
      showBottomMenu={false}
      alternativeTitle=""
    >
      {!item ? (
        <div className={style["container"]}>No transaction selected</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "12px" }}>
          <div className={style["topBar"]}>
            <img
              src={require("@assets/svg/wireframe/asi-black-circle.svg")}
              alt="tx"
            />
            <div className={style["topBar-details"]}>
              <div className={style["verb"]}>{directionLabel(item.direction)}</div>
              <div className={style["status"]}>
                {item.status === "pending" ? "Pending" : "Confirmed"}
              </div>
            </div>
          </div>

          <Card
            leftImage={adaIcon}
            leftImageStyle={{ height: "32px", width: "32px", background: "rgba(255,255,255,0.1)", padding: 2, borderRadius: "50%" }}
            heading={"Amount"}
            subheading={`${amountAda} ${denom}`}
          />

          <Card
            leftImage={adaIcon}
            leftImageStyle={{ height: "32px", width: "32px", background: "rgba(255,255,255,0.1)", padding: 2, borderRadius: "50%" }}
            heading={"Fee"}
            subheading={`${feeAda} ${denom}`}
          />

          {item.assets && item.assets.length > 0 && (
            <Card
              leftImage={require("@assets/svg/wireframe/wallet.svg")}
              leftImageStyle={{ height: "32px", width: "32px", background: "white", padding: 0 }}
              heading={"Token Transfers"}
              subheading={
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {item.assets.map((a) => {
                    const name = a.ticker || a.displayName || a.fingerprint?.slice(0, 16) || a.assetId.slice(0, 16);
                    const formattedAmount = formatAssetAmount(a.amount, a.decimals);
                    const iconUrl = getCardanoAssetIconUrl(chainStore.current.currencies, a.assetId);

                    return (
                      <div key={a.assetId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {iconUrl ? (
                          <img
                            src={iconUrl}
                            alt={name}
                            style={{
                              width: 20, height: 20, borderRadius: "50%",
                              objectFit: "contain", flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 20, height: 20, borderRadius: "50%",
                              background: "rgba(255,255,255,0.1)",
                              display: "flex", justifyContent: "center", alignItems: "center",
                              fontSize: "10px", fontWeight: 600, flexShrink: 0,
                            }}
                          >
                            {name[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                        <div style={{ fontWeight: 500 }}>
                          {formattedAmount} {name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              }
            />
          )}

          <Card
            leftImage={require("@assets/svg/wireframe/wallet.svg")}
            leftImageStyle={{ height: "32px", width: "32px", background: "white", padding: 0 }}
            heading={"Transaction id"}
            subheading={
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    wordBreak: "break-all",
                    whiteSpace: "normal",
                    lineHeight: "1.4",
                    maxWidth: "100%",
                  }}
                >
                  {item.id}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={copyTxId}
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--border-grey)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      color: "var(--font-dark)",
                      cursor: "pointer",
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            }
          />

          {(item.blockNo != null || item.slot != null) && (
            <Card
              leftImage={require("@assets/svg/wireframe/wallet.svg")}
              leftImageStyle={{ height: "32px", width: "32px", background: "white", padding: 0 }}
              heading={"Block"}
              subheading={`${item.blockNo != null ? `#${item.blockNo}` : ""}${item.slot != null ? ` • slot ${item.slot}` : ""}`}
            />
          )}
        </div>
      )}
    </HeaderLayout>
  );
};


