import { TendermintTxTracer } from "@keplr-wallet/cosmos";

export class CosmosTxTracer {
  private tmTracer?: TendermintTxTracer;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(
    private readonly rpcUrl: string,
    private readonly wsPath = "/websocket",
    private readonly opts?: {
      wsObject?: new (url: string, protocols?: string | string[]) => WebSocket;
    }
  ) {}

  private toWssUrl(input: string): string {
    if (!input) return "";

    const stripped = input
      .trim()
      .replace(/^(https?:\/\/|wss?:\/\/)/i, "")
      .replace(/\/+$/, "");

    return `wss://${stripped}/websocket`;
  }

  private checkRPCWebSocket = (
    rpcUrl: string,
    timeout = 5000
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      let socket: WebSocket;
      let settled = false;

      try {
        socket = new WebSocket(this.toWssUrl(rpcUrl));
      } catch (e) {
        return resolve(false);
      }

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.close();
          resolve(false);
        }
      }, timeout);

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        resolve(true);
      };

      socket.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      };
    });
  };

  // RPC polling (fallback only)
  private startPolling({
    hash,
    pollIntervalMs,
    pollDelayMs,
    onSuccess,
  }: {
    hash: string;
    pollIntervalMs: number;
    pollDelayMs: number;
    onSuccess: (tx: any) => void;
  }) {
    const poll = async () => {
      if (this.closed) return;

      try {
        const res = await fetch(`${this.rpcUrl}/tx?hash=${hash}`);

        if (res.ok) {
          const json = await res.json();
          if (json?.result?.tx_result) {
            onSuccess(json.result.tx_result);
            return;
          }
        }
      } catch {
        // ignore and retry
      }

      this.pollTimer = setTimeout(poll, pollIntervalMs);
    };

    this.pollTimer = setTimeout(poll, pollDelayMs);
  }

  private toHex0x(txHash: Uint8Array): string {
    return "0x" + Buffer.from(txHash).toString("hex").toUpperCase();
  }

  async traceTx(txHash: Uint8Array): Promise<any> {
    const pollIntervalMs = 6_000;
    const pollDelayMs = 2_000;
    const timeoutMs = 90_000;

    return new Promise(async (resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;

        this.tmTracer?.close();
        if (this.pollTimer) clearTimeout(this.pollTimer);
      };

      //  hard timeout (safety)
      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error("Transaction confirmation is taking longer than usual")
        );
      }, timeoutMs);

      const txHashHex = this.toHex0x(txHash);

      const fallbackToPolling = () => {
        this.startPolling({
          hash: txHashHex,
          pollIntervalMs,
          pollDelayMs,
          onSuccess: (tx) => {
            clearTimeout(timeout);
            cleanup();
            resolve(tx);
          },
        });
      };

      const wsExists = await this.checkRPCWebSocket(this.rpcUrl);

      if (!wsExists) {
        fallbackToPolling();
        return;
      }

      // try tendermint tracer
      try {
        this.tmTracer = new TendermintTxTracer(this.rpcUrl, this.wsPath, {
          wsObject: this.opts?.wsObject,
        });
        this.tmTracer
          .traceTx(txHash)
          .then((tx) => {
            clearTimeout(timeout);
            cleanup();
            resolve(tx);
          })
          .catch(() => {
            fallbackToPolling();
          });
      } catch {
        fallbackToPolling();
      }
    });
  }

  close() {
    this.closed = true;
    this.tmTracer?.close();
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }
}
