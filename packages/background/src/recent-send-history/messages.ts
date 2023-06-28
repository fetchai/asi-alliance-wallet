import { Message } from "@keplr-wallet/router";
import { ROUTE } from "./constants";
import { RecentSendHistory } from "./types";

export class GetRecentSendHistoriesMsg extends Message<RecentSendHistory[]> {
  public static type() {
    return "get-recent-send-histories";
  }

  constructor(
    public readonly chainId: string,
    public readonly historyType: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new Error("chain id is empty");
    }

    if (!this.historyType) {
      throw new Error("type is empty");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetRecentSendHistoriesMsg.type();
  }
}

export class SendTxAndRecordMsg extends Message<Uint8Array> {
  public static type() {
    return "send-tx-and-record";
  }

  constructor(
    public readonly historyType: string,
    public readonly sourceChainId: string,
    public readonly destinationChainId: string,
    public readonly tx: unknown,
    public readonly mode: "async" | "sync" | "block",
    public readonly silent: boolean,
    public readonly sender: string,
    public readonly recipient: string,
    public readonly amount: {
      readonly amount: string;
      readonly denom: string;
    }[],
    public readonly memo: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.historyType) {
      throw new Error("type is empty");
    }

    if (!this.sourceChainId) {
      throw new Error("chain id is empty");
    }

    if (!this.destinationChainId) {
      throw new Error("chain id is empty");
    }

    if (!this.tx) {
      throw new Error("tx is empty");
    }

    if (
      !this.mode ||
      (this.mode !== "sync" && this.mode !== "async" && this.mode !== "block")
    ) {
      throw new Error("invalid mode");
    }

    if (!this.sender) {
      throw new Error("sender is empty");
    }

    if (!this.recipient) {
      throw new Error("recipient is empty");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SendTxAndRecordMsg.type();
  }
}
