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
 * Message for sending ADA transaction with password confirmation.
 * This is intended to be used internally by the extension UI (not by external origins).
 */
export class SendAdaWithPasswordMsg extends Message<string> {
  public static type() {
    return "cardano-send-ada-with-password";
  }

  constructor(
    public readonly to: string,
    public readonly amount: string, // in lovelaces
    public readonly password: string,
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

    if (isNaN(Number(this.amount)) || Number(this.amount) <= 0) {
      throw new Error("amount must be a positive number");
    }

    if (!this.password) {
      throw new Error("password is empty");
    }
  }

  // Intentionally do NOT approve external messages for password-based sending.
  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SendAdaWithPasswordMsg.type();
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
    // Balance is sensitive. Only allow internal UI to query it.
    return false;
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
    // Sync status can be used to infer wallet activity. Only allow internal UI to query it.
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetCardanoSyncStatusMsg.type();
  }
}
