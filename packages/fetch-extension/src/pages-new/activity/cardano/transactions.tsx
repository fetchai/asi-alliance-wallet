import React, { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import {
  GetCardanoTxHistoryMsg,
  LoadMoreCardanoTxHistoryMsg,
  GetCardanoSyncStatusMsg,
} from "@keplr-wallet/background";
import { NoActivity } from "../no-activity";
import styles from "../native/style.module.scss";
import { useNavigate } from "react-router";

type CardanoTxHistoryItem = {
  id: string;
  blockNo?: number;
  slot?: number;
  status?: "pending" | "confirmed";
  direction: "sent" | "received" | "self" | "unknown";
  amount: string;
  fee?: string;
};

const formatLovelaceToAda = (lovelace: string) => {
  try {
    const v = BigInt(lovelace || "0");
    const oneMillion = BigInt(1000000);
    const whole = v / oneMillion;
    const frac = v % oneMillion;
    const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  } catch {
    return "0";
  }
};

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
  const chainId = chainStore.current.chainId;
  const denom = chainStore.current.stakeCurrency.coinDenom;

  const [items, setItems] = useState<CardanoTxHistoryItem[]>([]);
  const [mightHaveMore, setMightHaveMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSyncing, setIsSyncing] = useState(false);

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
        return;
      }
        const nextItems = (res?.items ?? []) as CardanoTxHistoryItem[];
        setItems(nextItems);
        setMightHaveMore(!!res?.mightHaveMore);
      setIsSyncing(false);
      } catch (e: any) {
        setError(e?.message || "Failed to load transaction history");
        setItems([]);
        setMightHaveMore(false);
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
      const nextItems = (res?.items ?? []) as CardanoTxHistoryItem[];
      setItems(nextItems);
      setMightHaveMore(!!res?.mightHaveMore);
    } catch (e: any) {
      setError(e?.message || "Failed to load more transactions");
    } finally {
      setIsLoadingMore(false);
    }
  }, [chainId, requester]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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
  }, [error, isLoading, isLoadingMore, items.length, loadMore, mightHaveMore, pageSize]);

  // If user opens Activity quickly, Cardano wallet may still be syncing; poll and retry fetch when settled.
  useEffect(() => {
    let isSubscribed = true;
    let interval: any = null;

    const checkSyncAndMaybeRefetch = async () => {
      try {
        const syncStatus = await requester.sendMessage(
          BACKGROUND_PORT,
          new GetCardanoSyncStatusMsg(chainId)
        );
        if (!isSubscribed) return;

        const settled = !!syncStatus?.isSettled;
        setIsSyncing(!settled);
        if (settled && items.length === 0 && !isLoading && !error) {
          fetchHistory();
        }
        if (settled && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        // If sync status can't be fetched, don't block UI.
        if (!isSubscribed) return;
        setIsSyncing(false);
      }
    };

    // Start polling only when we have no items yet.
    if (items.length === 0) {
      checkSyncAndMaybeRefetch();
      interval = setInterval(checkSyncAndMaybeRefetch, 2000);
    }

    return () => {
      isSubscribed = false;
      if (interval) clearInterval(interval);
    };
  }, [chainId, requester, fetchHistory, items.length, isLoading, error]);

  if (isLoading && isSyncing) {
    return <NoActivity label="Wallet is syncing. Please wait..." />;
  }

  if (isLoading) {
    return <NoActivity label="Loading..." />;
  }

  if (error) {
    return <NoActivity label={error} />;
  }

  if (isSyncing && !items.length) {
    return <NoActivity label="Wallet is syncing. Please wait..." />;
  }

  if (!items.length) {
    return <NoActivity label="No Activity Yet" />;
  }

  return (
    <div>
      {items.map((item) => {
        const amountAda = formatLovelaceToAda(item.amount);
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
            <div className={styles["middleSection"]}>
              <div className={styles["rowTitle"]}>{directionLabel(item.direction)}</div>
              <div className={styles["rowSubtitle"]}>
                {item.status === "pending"
                  ? "Pending"
                  : item.blockNo != null
                    ? `Block ${item.blockNo}`
                    : "Confirmed"}
              </div>
            </div>
            <div className={styles["amountWrapper"]}>
              <div className={styles["amountNumber"]}>{amountAda}</div>
              <div className={styles["amountAlphabetic"]}>{denom}</div>
            </div>
          </div>
        );
      })}

      {mightHaveMore && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
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


