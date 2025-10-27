import { Message } from "@keplr-wallet/router";
import { ROUTE } from "./constants";

/**
 * Message for sending ADA transaction
 */
export class SendAdaMsg extends Message<string> {
  public static type() {
    return "cardano-send-ada";
  }

  constructor(
    public readonly to: string,
    public readonly amount: string, // in lovelaces
    public readonly memo?: string,
    public readonly chainId?: string // Optional chainId to ensure correct network
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.to) {
      throw new Error("recipient address is empty");
    }

    if (!this.amount) {
      throw new Error("amount is empty");
    }

    // Check that amount is a number
    if (isNaN(Number(this.amount)) || Number(this.amount) <= 0) {
      throw new Error("amount must be a positive number");
    }
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SendAdaMsg.type();
  }
}

/**
 * Message for getting Cardano balance
 */
export class GetCardanoBalanceMsg extends Message<any> {
  public static type() {
    return "cardano-get-balance";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    // No parameters to validate
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetCardanoBalanceMsg.type();
  }
}

/**
 * Message for checking Cardano service readiness
 */
export class IsCardanoReadyMsg extends Message<boolean> {
  public static type() {
    return "cardano-is-ready";
  }

  constructor() {
    super();
  }

  validateBasic(): void {
    // No parameters to validate
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return IsCardanoReadyMsg.type();
  }
}

/**
 * Message for estimating Cardano transaction fee
 */
export class EstimateSendAdaMsg extends Message<{ fee: string; total: string }> {
  public static type() {
    return "cardano-estimate-send-ada";
  }

  constructor(
    public readonly to: string,
    public readonly amount: string, // in lovelaces
    public readonly chainId?: string // Optional chainId to ensure correct network
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.to) {
      throw new Error("recipient address is empty");
    }

    if (!this.amount) {
      throw new Error("amount is empty");
    }

    if (isNaN(Number(this.amount)) || Number(this.amount) <= 0) {
      throw new Error("amount must be a positive number");
    }
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return EstimateSendAdaMsg.type();
  }
}

/**
 * Message for getting Cardano wallet sync status (for UI sync status check)
 */
export class GetCardanoSyncStatusMsg extends Message<{ isSettled: boolean }> {
  public static type() {
    return "cardano-get-sync-status";
  }

  constructor(public readonly chainId?: string) {
    super();
  }

  validateBasic(): void {
    // chainId is optional
  }

  override approveExternal(): boolean {
    return true;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetCardanoSyncStatusMsg.type();
  }
}
