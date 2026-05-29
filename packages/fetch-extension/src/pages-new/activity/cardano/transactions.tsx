import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { useNetwork } from "../../../hooks";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import {
  GetCardanoTxHistoryMsg,
  LoadMoreCardanoTxHistoryMsg,
  GetCardanoSyncStatusMsg,
} from "@keplr-wallet/background";
import type {
  BlockfrostLimitPresentation,
  CardanoServiceState,
  CardanoSyncStatusResponse,
  CardanoTxHistoryAsset,
  CardanoTxHistoryItem,
  CardanoTxHistoryStateResponse,
} from "@keplr-wallet/background";
import { CardanoBlockfrostRateLimitBanner } from "@components-v2/cardano/blockfrost-rate-limit-banner";
import { NoActivity } from "../no-activity";
import styles from "../native/style.module.scss";
import { useNavigate } from "react-router";
import sendIcon from "@assets/svg/wireframe/asi-send.svg";
import { lovelacesToAdaString, formatAssetAmount } from "@keplr-wallet/cardano";
import { getCardanoAssetIconUrl } from "./cardano-asset-utils";
import receiveIcon from "@assets/svg/wireframe/activity-recieve.svg";
import { isTransientState, getStateErrorMessage } from "./state-helpers";

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

export const CardanoTransactionsTab = observer(() => {
  const navigate = useNavigate();
  const { chainStore } = useStore();
  const { isOnline } = useNetwork();
  const intl = useIntl();
  const chainId = chainStore.current.chainId;
  const syncingOrOfflineLabel = !isOnline
    ? intl.formatMessage({ id: "cardano.status.offline" })
    : "Wallet is syncing. Please wait...";
  const denom = chainStore.current.stakeCurrency.coinDenom;

  const [items, setItems] = useState<CardanoTxHistoryItem[]>([]);
  const [mightHaveMore, setMightHaveMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasFetchedHistory, setHasFetchedHistory] = useState(false);
  const [isSyncingDueToTimeout, setIsSyncingDueToTimeout] = useState(false);
  const [blockfrostLimit, setBlockfrostLimit] = useState<
    BlockfrostLimitPresentation | undefined
  >();

  const pageSize = 20;

  const requester = useMemo(() => new InExtensionMessageRequester(), []);

  const sendWithTimeout = useCallback(
    async <T,>(promise: Promise<T>, ms: number): Promise<T | "timeout"> => {
      let t: any;
      try {
        const timeoutPromise = new Promise<"timeout">((resolve) => {
          t = setTimeout(() => resolve("timeout"), ms);
        });
        return (await Promise.race([promise, timeoutPromise])) as T | "timeout";
      } finally {
        if (t) clearTimeout(t);
      }
    },
    []
  );

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const res = await sendWithTimeout(
        requester.sendMessage(
          BACKGROUND_PORT,
          new GetCardanoTxHistoryMsg(pageSize, chainId)
        ),
        12000
      );
      if (res === "timeout") {
        // If background is still syncing/initializing, don't lock the UI in "Loading..." forever.
        setIsSyncing(true);
        setIsSyncingDueToTimeout(true);
        return;
      }
      const typedRes = res as CardanoTxHistoryStateResponse;
      const presentation = typedRes?.blockfrostLimit;
      setBlockfrostLimit(presentation);
      const state = typedRes?.state as CardanoServiceState | undefined;
      if (state && state !== "ready_with_data" && state !== "empty_valid") {
        const transient = isTransientState(state);
        setIsSyncing(transient);
        setIsSyncingDueToTimeout(false);
        setHasFetchedHistory(!transient);
        setItems([]);
        setMightHaveMore(false);
        setError(
          transient
            ? undefined
            : getStateErrorMessage(state, typedRes?.error, presentation)
        );
        return;
      }
      const nextItems = (typedRes?.items ?? []) as CardanoTxHistoryItem[];
      setItems(nextItems);
      setMightHaveMore(!!typedRes?.mightHaveMore);
      setHasFetchedHistory(true);
      setIsSyncing(false);
      setIsSyncingDueToTimeout(false);
    } catch (e: any) {
      setError(e?.message || "Failed to load transaction history");
      setItems([]);
      setMightHaveMore(false);
      setHasFetchedHistory(true);
      setIsSyncingDueToTimeout(false);
    } finally {
      setIsLoading(false);
    }
  }, [chainId, requester, sendWithTimeout]);

  const loadMore = useCallback(async () => {
    setIsLoadingMore(true);
    setError(undefined);
    try {
      const res = await requester.sendMessage(
        BACKGROUND_PORT,
        new LoadMoreCardanoTxHistoryMsg(pageSize, chainId)
      );
      const typedRes = res as CardanoTxHistoryStateResponse;
      const presentation = typedRes?.blockfrostLimit;
      setBlockfrostLimit(presentation);
      const state = typedRes?.state as CardanoServiceState | undefined;
      if (state && state !== "ready_with_data" && state !== "empty_valid") {
        const transient = isTransientState(state);
        setIsSyncing(transient);
        setHasFetchedHistory(!transient);
        setError(
          transient
            ? undefined
            : getStateErrorMessage(state, typedRes?.error, presentation)
        );
        return;
      }
      const nextItems = (typedRes?.items ?? []) as CardanoTxHistoryItem[];
      setItems(nextItems);
      setMightHaveMore(!!typedRes?.mightHaveMore);
    } catch (e: any) {
      setError(e?.message || "Failed to load more transactions");
    } finally {
      setIsLoadingMore(false);
    }
  }, [chainId, requester]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    setHasFetchedHistory(false);
    setIsSyncingDueToTimeout(false);
    setBlockfrostLimit(undefined);
  }, [chainId]);

  // Lace behavior: if first page has fewer txs than the viewport/pageSize (local store is often small),
  // auto-load more once to confirm whether there are more transactions and to fill the page.
  useEffect(() => {
    if (
      !isLoading &&
      !isLoadingMore &&
      !error &&
      items.length > 0 &&
      items.length < pageSize &&
      mightHaveMore
    ) {
      loadMore();
    }
  }, [
    error,
    isLoading,
    isLoadingMore,
    items.length,
    loadMore,
    mightHaveMore,
    pageSize,
  ]);

  // If user opens Activity quickly, Cardano wallet may still be syncing; poll and retry fetch when settled.
  useEffect(() => {
    let isSubscribed = true;
    let interval: any = null;

    const checkSyncAndMaybeRefetch = async () => {
      try {
        const syncStatus = (await requester.sendMessage(
          BACKGROUND_PORT,
          new GetCardanoSyncStatusMsg(
            chainId,
            document.hidden ? "background" : "foreground"
          )
        )) as CardanoSyncStatusResponse;
        if (!isSubscribed) return;

        const state = syncStatus?.state;
        const presentation = syncStatus?.blockfrostLimit;
        setBlockfrostLimit(presentation);
        const settled = state === "ready_with_data" && !!syncStatus?.isSettled;
        const transient = isTransientState(state);
        if (!hasFetchedHistory) {
          setIsSyncing(transient || !settled);
        }
        if (state === "provider_error" || state === "blockfrost_rate_limited") {
          setIsSyncing(false);
          setHasFetchedHistory(true);
          setError(
            getStateErrorMessage(state, syncStatus?.error, presentation)
          );
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          return;
        }
        if (
          settled &&
          items.length === 0 &&
          !isLoading &&
          !error &&
          !hasFetchedHistory
        ) {
          fetchHistory();
        }
        if (settled && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        // If sync status can't be fetched, don't block UI.
        if (!isSubscribed) return;
        if (!hasFetchedHistory) {
          setIsSyncing(false);
        }
      }
    };

    // Start polling only when we have no items yet.
    if (items.length === 0 && !hasFetchedHistory) {
      checkSyncAndMaybeRefetch();
      interval = setInterval(checkSyncAndMaybeRefetch, 2000);
    }

    return () => {
      isSubscribed = false;
      if (interval) clearInterval(interval);
    };
  }, [
    chainId,
    requester,
    fetchHistory,
    items.length,
    isLoading,
    error,
    hasFetchedHistory,
  ]);

  const shouldShowSyncing =
    isSyncingDueToTimeout || (!hasFetchedHistory && isSyncing);

  const limitBanner = (
    <CardanoBlockfrostRateLimitBanner presentation={blockfrostLimit} />
  );

  if (isLoading && isSyncingDueToTimeout) {
    return (
      <React.Fragment>
        {limitBanner}
        <NoActivity label={syncingOrOfflineLabel} />
      </React.Fragment>
    );
  }

  if (isLoading) {
    return (
      <React.Fragment>
        {limitBanner}
        <NoActivity label="Loading..." />
      </React.Fragment>
    );
  }

  if (error) {
    return (
      <React.Fragment>
        {limitBanner}
        <NoActivity label={error} />
      </React.Fragment>
    );
  }

  if (shouldShowSyncing && !items.length) {
    return (
      <React.Fragment>
        {limitBanner}
        <NoActivity label={syncingOrOfflineLabel} />
      </React.Fragment>
    );
  }

  if (!items.length) {
    return (
      <React.Fragment>
        {limitBanner}
        <NoActivity label="No Activity Yet" />
      </React.Fragment>
    );
  }

  return (
    <div>
      {limitBanner}
      {items.map((item) => {
        const amountAda = lovelacesToAdaString(item.amount);
        const hasAssets = item.assets && item.assets.length > 0;
        const assetName = (a: CardanoTxHistoryAsset) =>
          a.ticker ||
          a.displayName ||
          a.fingerprint?.slice(0, 12) ||
          a.assetId.slice(0, 12);

        // Main row always shows ADA (so pending token sends show "0 tADA" + tokens below)
        const stakeCur = chainStore.current.stakeCurrency;
        const adaIcon = {
          url: stakeCur?.coinImageUrl,
          letter: denom[0]?.toUpperCase() || "A",
        };

        const assetIcon = (a: CardanoTxHistoryAsset) => {
          const url = getCardanoAssetIconUrl(
            chainStore.current.currencies,
            a.assetId
          );
          const letter = assetName(a)[0]?.toUpperCase() || "T";
          return { url, letter };
        };

        const directionIcon =
          item.direction === "sent" ? sendIcon : receiveIcon;

        return (
          <div
            key={item.id}
            className={styles["activityRow"]}
            onClick={() => {
              navigate("/cardano-activity-details", {
                state: { item },
              });
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <img
                className={styles["img"]}
                src={directionIcon}
                alt={item.direction}
              />
              <div className={styles["middleSection"]}>
                <div className={styles["rowTitle"]}>
                  {directionLabel(item.direction)}
                </div>
                <div className={styles["rowSubtitle"]}>
                  {item.status === "pending"
                    ? "Pending"
                    : item.blockNo != null
                    ? `Block ${item.blockNo}`
                    : "Confirmed"}
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "2px",
              }}
            >
              <div
                className={styles["amountWrapper"]}
                style={{ alignItems: "center" }}
              >
                {adaIcon.url ? (
                  <img
                    src={adaIcon.url}
                    alt={adaIcon.letter}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      objectFit: "contain",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.1)",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: "10px",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {adaIcon.letter}
                  </div>
                )}
                <div className={styles["amountNumber"]}>{amountAda}</div>
                <div className={styles["amountAlphabetic"]}>{denom}</div>
              </div>
              {hasAssets && (
                <div
                  className={styles["rowSubtitle"]}
                  style={{
                    fontSize: "12px",
                    textAlign: "right",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px 10px",
                    justifyContent: "flex-end",
                  }}
                >
                  {item.assets!.slice(0, 3).map((a) => {
                    const ico = assetIcon(a);
                    return (
                      <span
                        key={a.assetId}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {ico.url ? (
                          <img
                            src={ico.url}
                            alt=""
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              objectFit: "contain",
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              background: "rgba(255,255,255,0.1)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                            }}
                          >
                            {ico.letter}
                          </span>
                        )}
                        {formatAssetAmount(a.amount, a.decimals)} {assetName(a)}
                      </span>
                    );
                  })}
                  {item.assets!.length > 3 &&
                    ` +${item.assets!.length - 3} more`}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {mightHaveMore && (
        <div
          style={{ marginTop: 12, display: "flex", justifyContent: "center" }}
        >
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={loadMore}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border-grey)",
              borderRadius: 10,
              padding: "10px 12px",
              color: "var(--font-dark)",
              cursor: isLoadingMore ? "default" : "pointer",
            }}
          >
            {isLoadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
});
