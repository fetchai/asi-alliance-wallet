import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Dropdown } from "@components-v2/dropdown";
import { TransxPending } from "./transx-pending";
import { TransxSuccess } from "./transx-success";
import { TransxFailed } from "./transx-failed";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { GetCardanoTrackedTxStatusMsg } from "@keplr-wallet/background";
import { useStore } from "../../stores";

const CARDANO_TRACKED_TX_POLL_FAST_MS = 2500;
const CARDANO_TRACKED_TX_POLL_NORMAL_MS = 6000;
const CARDANO_TRACKED_TX_POLL_HIDDEN_MS = 12000;
const CARDANO_TRACKED_TX_AGGRESSIVE_WINDOW_MS = 2 * 60_000;

/** Optional: poll Cardano merged history until this submitted tx is confirmed. */
export type CardanoSendTxTracking = {
  txId: string;
  chainId: string;
  /** When false, no background polling is started. */
  active: boolean;
};

export const TransxStatus = ({
  status,
  onClose,
  cardanoSendTxTracking,
}: {
  status: string;
  onClose?: () => void;
  /** When set for a pending Cardano send, polls until on-chain confirmation then navigates to success. */
  cardanoSendTxTracking?: CardanoSendTxTracking;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const isOpenRef = useRef(true);
  const navigate = useNavigate();
  const { chainStore } = useStore();
  const pollGenerationRef = useRef(0);
  const successNavigatedRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (
      !isOpen ||
      status !== "pending" ||
      !cardanoSendTxTracking?.active ||
      !cardanoSendTxTracking.txId?.trim() ||
      !cardanoSendTxTracking.chainId?.trim()
    ) {
      return;
    }

    successNavigatedRef.current = false;
    const txId = cardanoSendTxTracking.txId.trim();
    const chainId = cardanoSendTxTracking.chainId.trim();
    const generation = ++pollGenerationRef.current;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isPolling = false;
    const startedAt = Date.now();

    const getPollDelayMs = () => {
      if (document.hidden) return CARDANO_TRACKED_TX_POLL_HIDDEN_MS;
      const withinAggressiveWindow =
        Date.now() - startedAt < CARDANO_TRACKED_TX_AGGRESSIVE_WINDOW_MS;
      return withinAggressiveWindow
        ? CARDANO_TRACKED_TX_POLL_FAST_MS
        : CARDANO_TRACKED_TX_POLL_NORMAL_MS;
    };

    const clearTimer = () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNextPoll = () => {
      clearTimer();
      if (cancelled || successNavigatedRef.current || !isOpenRef.current) {
        return;
      }
      if (generation !== pollGenerationRef.current) {
        return;
      }
      timeoutId = setTimeout(() => {
        timeoutId = null;
        void runPoll();
      }, getPollDelayMs());
    };

    const runPoll = async () => {
      if (isPolling) {
        return;
      }
      if (
        cancelled ||
        generation !== pollGenerationRef.current ||
        successNavigatedRef.current ||
        !isOpenRef.current
      ) {
        return;
      }
      isPolling = true;

      try {
        if (chainStore.current.chainId !== chainId) {
          return;
        }
        const requester = new InExtensionMessageRequester();
        const res = await requester.sendMessage(
          BACKGROUND_PORT,
          new GetCardanoTrackedTxStatusMsg(
            txId,
            chainId,
            document.hidden ? "background" : "foreground"
          )
        );

        if (
          cancelled ||
          generation !== pollGenerationRef.current ||
          successNavigatedRef.current ||
          !isOpenRef.current
        ) {
          return;
        }
        if (chainStore.current.chainId !== chainId) {
          return;
        }

        if (res.txStatus === "confirmed") {
          if (!isOpenRef.current || successNavigatedRef.current) {
            return;
          }
          successNavigatedRef.current = true;
          navigate("/send", {
            replace: true,
            state: { trnsxStatus: "success", isNext: true },
          });
          return;
        }
      } catch {
        // Keep pending UX; retry on next tick.
      } finally {
        isPolling = false;
      }

      scheduleNextPoll();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        return;
      }
      clearTimer();
      void runPoll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    void runPoll();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimer();
    };
    // chainStore is read inside runPoll for secondary chain mismatch guard (no subscription needed).
  }, [
    isOpen,
    status,
    cardanoSendTxTracking?.active,
    cardanoSendTxTracking?.txId,
    cardanoSendTxTracking?.chainId,
    navigate,
  ]);

  return (
    <div>
      <Dropdown
        title={""}
        setIsOpen={setIsOpen}
        isOpen={isOpen}
        closeClicked={() => {
          isOpenRef.current = false;
          pollGenerationRef.current += 1;
          setIsOpen(false);
          onClose?.();
        }}
        showCloseIcon={true}
        showTopNav={true}
      >
        {status === "pending" && <TransxPending />}
        {status === "success" && <TransxSuccess />}
        {status === "failed" && <TransxFailed />}
      </Dropdown>
    </div>
  );
};
