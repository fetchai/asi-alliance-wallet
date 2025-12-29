import { Message } from "@keplr-wallet/router";
import { ROUTE } from "./constants";

export interface CardanoTxHistoryItem {
  id: string; // tx id / hash
  blockNo?: number;
  slot?: number;
  status?: "pending" | "confirmed";
  direction: "sent" | "received" | "self" | "unknown";
  amount: string; // lovelace (absolute, no sign)
  fee?: string; // lovelace
}

export interface CardanoTxHistoryResponse {
  items: CardanoTxHistoryItem[];
  mightHaveMore: boolean;
}

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

/**
 * Message for getting Cardano transaction history (ADA-only MVP).
 * Internal-only: the UI requests a serializable list, background uses wallet SDK + providers.
 */
export class GetCardanoTxHistoryMsg extends Message<CardanoTxHistoryResponse> {
  public static type() {
    return "cardano-get-tx-history";
  }

  constructor(
    public readonly pageSize: number,
    public readonly chainId?: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.pageSize || isNaN(Number(this.pageSize)) || Number(this.pageSize) <= 0) {
      throw new Error("pageSize must be a positive number");
    }
  }

  override approveExternal(): boolean {
    // Tx history can reveal sensitive activity. Only allow internal UI to query it.
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetCardanoTxHistoryMsg.type();
  }
}

/**
 * Message for loading more Cardano tx history items (ADA-only MVP).
 * Internal-only.
 */
export class LoadMoreCardanoTxHistoryMsg extends Message<CardanoTxHistoryResponse> {
  public static type() {
    return "cardano-load-more-tx-history";
  }

  constructor(
    public readonly pageSize: number,
    public readonly chainId?: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.pageSize || isNaN(Number(this.pageSize)) || Number(this.pageSize) <= 0) {
      throw new Error("pageSize must be a positive number");
    }
  }

  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return LoadMoreCardanoTxHistoryMsg.type();
  }
}
