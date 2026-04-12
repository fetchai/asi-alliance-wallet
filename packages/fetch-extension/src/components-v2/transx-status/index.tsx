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

const CARDANO_TRACKED_TX_POLL_MS = 2500;

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
      }, CARDANO_TRACKED_TX_POLL_MS);
    };

    const runPoll = async () => {
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

      try {
        const requester = new InExtensionMessageRequester();
        const res = await requester.sendMessage(
          BACKGROUND_PORT,
          new GetCardanoTrackedTxStatusMsg(txId, chainId)
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
      }

      scheduleNextPoll();
    };

    void runPoll();

    return () => {
      cancelled = true;
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
