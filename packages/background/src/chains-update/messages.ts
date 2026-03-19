import { Message } from "@keplr-wallet/router";
import { ROUTE } from "./constants";
import { LedgerApp } from "../ledger";

export class TryUpdateAllChainInfosMsg extends Message<boolean> {
  public static type() {
    return "TryUpdateAllChainInfosMsg";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return TryUpdateAllChainInfosMsg.type();
  }
}

export class TryUpdateEnabledChainInfosMsg extends Message<boolean> {
  public static type() {
    return "TryUpdateEnabledChainInfosMsg";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return TryUpdateEnabledChainInfosMsg.type();
  }
}

export class TryLedgerInitMsg extends Message<void> {
  public static type() {
    return "try-ledger-init";
  }

  constructor(
    public readonly ledgerApp: LedgerApp,
    public readonly cosmosLikeApp: string
  ) {
    super();
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return TryLedgerInitMsg.type();
  }
}
