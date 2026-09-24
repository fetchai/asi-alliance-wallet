import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppCurrency } from "@keplr-wallet/types";
import { CoinPretty, Int } from "@keplr-wallet/unit";

type FreezePhase = "idle" | "frozen" | "awaiting-refetch" | "refetching";

const FAIL_UNFREEZE_MS = 8000;

/**
 * Keeps the home total stable while claim rewards is in flight.
 * Cached rewards can lag behind spendable; freezing avoids double-counting
 * until the rewards query has refetched.
 */
export const useClaimFrozenTotal = ({
  liveTotal,
  currency,
  isClaimPending,
  bech32Address,
  chainId,
  isRewardsFetching,
}: {
  liveTotal: CoinPretty;
  currency: AppCurrency;
  isClaimPending: boolean;
  bech32Address: string;
  chainId: string;
  isRewardsFetching: boolean;
}): { total: CoinPretty; isFrozen: boolean } => {
  const queryClient = useQueryClient();
  const [frozenTotal, setFrozenTotal] = useState<CoinPretty | null>(null);
  const phaseRef = useRef<FreezePhase>("idle");
  const wasClaimPendingRef = useRef(false);
  const failTimerRef = useRef<number | null>(null);
  const resetKey = `${bech32Address}:${chainId}`;
  const prevResetKeyRef = useRef(resetKey);

  const rewardsQueryKey = useMemo(
    () => ["rewards", bech32Address, chainId] as const,
    [bech32Address, chainId]
  );

  const clearFailTimer = useCallback(() => {
    if (failTimerRef.current != null) {
      window.clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
  }, []);

  const unfreeze = useCallback(() => {
    clearFailTimer();
    phaseRef.current = "idle";
    setFrozenTotal(null);
  }, [clearFailTimer]);

  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      unfreeze();
    }
  }, [resetKey, unfreeze]);

  useEffect(() => {
    if (isClaimPending) {
      if (phaseRef.current === "idle") {
        phaseRef.current = "frozen";
        setFrozenTotal(liveTotal);
        queryClient.setQueryData(
          [...rewardsQueryKey],
          new CoinPretty(currency, new Int(0))
        );
      }
    } else if (wasClaimPendingRef.current) {
      phaseRef.current = "awaiting-refetch";
      queryClient.invalidateQueries({ queryKey: [...rewardsQueryKey] });
      clearFailTimer();
      failTimerRef.current = window.setTimeout(() => {
        failTimerRef.current = null;
        unfreeze();
      }, FAIL_UNFREEZE_MS);
    }

    wasClaimPendingRef.current = isClaimPending;
    // Only react to claim pending transitions; capture liveTotal at freeze start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClaimPending]);

  useEffect(() => {
    if (phaseRef.current === "awaiting-refetch" && isRewardsFetching) {
      phaseRef.current = "refetching";
      return;
    }

    if (
      phaseRef.current === "refetching" &&
      !isRewardsFetching &&
      !isClaimPending
    ) {
      unfreeze();
    }
  }, [isRewardsFetching, isClaimPending, unfreeze]);

  useEffect(() => clearFailTimer, [clearFailTimer]);

  return {
    total: frozenTotal ?? liveTotal,
    isFrozen: frozenTotal != null,
  };
};
