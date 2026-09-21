import { useEffect, useState } from "react";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import {
  GetCardanoSyncStatusMsg,
  type BlockfrostLimitPresentation,
  type CardanoSyncStatusResponse,
} from "@keplr-wallet/background";

const POLL_INTERVAL_MS = 2000;

function toVisibleBlockfrostLimit(
  raw?: BlockfrostLimitPresentation
): BlockfrostLimitPresentation | undefined {
  if (!raw || (!raw.showBuiltinLimitCta && !raw.showUserKeyLimitWarning)) {
    return undefined;
  }
  return raw;
}

export function useCardanoBlockfrostLimit(
  chainId: string | undefined,
  enabled: boolean
): BlockfrostLimitPresentation | undefined {
  const [blockfrostLimit, setBlockfrostLimit] = useState<
    BlockfrostLimitPresentation | undefined
  >();

  useEffect(() => {
    setBlockfrostLimit(undefined);

    if (!enabled || !chainId) {
      return;
    }

    const requester = new InExtensionMessageRequester();

    let cancelled = false;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearPoll = () => {
      if (pollTimeout != null) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
      }
    };

    const poll = async () => {
      try {
        const res = await requester.sendMessage(
          BACKGROUND_PORT,
          new GetCardanoSyncStatusMsg(
            chainId,
            document.hidden ? "background" : "foreground"
          )
        );
        if (!cancelled) {
          setBlockfrostLimit(
            toVisibleBlockfrostLimit(
              (res as CardanoSyncStatusResponse)?.blockfrostLimit
            )
          );
        }
      } catch {
        if (!cancelled) {
          setBlockfrostLimit(undefined);
        }
      }
      if (!cancelled) {
        clearPoll();
        pollTimeout = setTimeout(() => {
          pollTimeout = null;
          void poll();
        }, POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [chainId, enabled]);

  return blockfrostLimit;
}
