import { useEffect, useRef, useState } from "react";
import { checkWebSocket, toWssUrl } from "./utils";

type WebSocketSupportState = {
  supported: boolean;
  loading: boolean;
};

const cache = new Map<string, boolean>();

export const useWebSocketSupport = (
  rpcUrl?: string,
  timeout = 5000
): WebSocketSupportState => {
  const [state, setState] = useState<WebSocketSupportState>({
    supported: false,
    loading: true,
  });

  const activeRef = useRef(true);

  const wsUrl = toWssUrl(rpcUrl || "");

  useEffect(() => {
    activeRef.current = true;
    if (!wsUrl || !wsUrl.startsWith("wss://")) {
      setState({ supported: false, loading: false });
      return;
    }

    // Use cached result if available
    if (cache.has(wsUrl)) {
      setState({
        supported: cache.get(wsUrl)!,
        loading: false,
      });
      return;
    }

    setState((s) => ({ ...s, loading: true }));

    checkWebSocket(wsUrl, timeout).then((result) => {
      if (!activeRef.current) return;
      cache.set(wsUrl, result);
      setState({ supported: result, loading: false });
    });

    return () => {
      activeRef.current = false;
    };
  }, [wsUrl, timeout]);

  return state;
};
