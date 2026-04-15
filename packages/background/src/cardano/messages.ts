import { Message } from "@keplr-wallet/router";
import { ROUTE } from "./constants";

const validateLovelaceAmountFormat = (amount: string): bigint => {
  if (!/^[0-9]+$/.test(amount)) {
    throw new Error("amount must be a non-negative integer string");
  }
  return BigInt(amount);
};

const validatePositiveLovelaceAmount = (amount: string): void => {
  if (validateLovelaceAmountFormat(amount) <= BigInt(0)) {
    throw new Error("amount must be a positive number");
  }
};

const validateNonNegativeLovelaceAmount = (amount: string): void => {
  validateLovelaceAmountFormat(amount);
};

const validateCardanoAssetAmounts = (
  assets: CardanoAssetAmount[] | undefined
): void => {
  if (!assets || assets.length === 0) return;

  const seen = new Set<string>();
  for (const a of assets) {
    if (!a?.assetId) {
      throw new Error("assetId is empty");
    }
    if (!a?.amount) {
      throw new Error("asset amount is empty");
    }

    const assetId = String(a.assetId);
    const assetAmount = String(a.amount);

    // Strict Cardano AssetId parsing for wallet boundary:
    // policyId: exactly 56 hex chars
    // assetName: hex string with even length, <= 32 bytes => <= 64 hex chars (may be empty)
    if (assetId.length < 56) {
      throw new Error("assetId is too short");
    }

    const policyId = assetId.slice(0, 56);
    const assetName = assetId.slice(56);

    if (!/^[0-9a-fA-F]{56}$/.test(policyId)) {
      throw new Error("policyId must be 56 hex chars");
    }
    if (assetName.length % 2 !== 0) {
      throw new Error("assetName must be even-length hex");
    }
    if (assetName.length > 64) {
      throw new Error("assetName is too long");
    }
    if (assetName && !/^[0-9a-fA-F]+$/.test(assetName)) {
      throw new Error("assetName must be hex");
    }

    // Ensure duplicate detection is case-insensitive for hex ids.
    const assetIdKey = assetId.toLowerCase();
    if (seen.has(assetIdKey)) {
      throw new Error("duplicate assetId");
    }
    seen.add(assetIdKey);

    const qty = validateLovelaceAmountFormat(assetAmount);
    if (qty <= BigInt(0)) {
      throw new Error("asset amount must be positive");
    }
  }
};

/** Describes a single native asset transfer within a Cardano transaction. */
export interface CardanoTxHistoryAsset {
  policyId: string;
  assetName: string; // hex-encoded
  assetId: string; // policyId + assetName (Cardano.AssetId format)
  amount: string; // absolute, in base units
  fingerprint?: string; // CIP-14 asset fingerprint
  displayName?: string; // resolved metadata name
  ticker?: string;
  decimals?: number;
}

/** Serializable asset reference used in send messages. */
export interface CardanoAssetAmount {
  assetId: string; // policyId + assetName
  amount: string; // base-unit amount (no decimals)
}

export interface CardanoTxHistoryItem {
  id: string; // tx id / hash
  blockNo?: number;
  slot?: number;
  status?: "pending" | "confirmed";
  direction: "sent" | "received" | "self" | "unknown";
  amount: string; // lovelace (absolute, no sign)
  fee?: string; // lovelace
  assets?: CardanoTxHistoryAsset[]; // native asset transfers in this tx
  timestamp?: number; // Unix ms, derived from slot using per-network genesis constants
  fromAddresses?: string[]; // non-own input addresses (sender side)
  toAddresses?: string[]; // non-own output addresses (receiver side)
  isDegraded?: boolean; // true when tx data could not be fully resolved (e.g. unresolved inputs)
}

export interface CardanoTxHistoryResponse {
  items: CardanoTxHistoryItem[];
  mightHaveMore: boolean;
  hasDegradedItems?: boolean;
}

export type CardanoServiceState =
  | "ready_with_data"
  | "empty_valid"
  | "temporarily_unavailable"
  | "syncing"
  | "provider_error";

export interface CardanoBalancePayload {
  available: string;
  total: string;
  rewards: string;
}

export interface CardanoBalanceResponse {
  state: CardanoServiceState;
  balance?: CardanoBalancePayload;
  error?: string;
}

export interface CardanoSyncStatusResponse {
  state: CardanoServiceState;
  isSettled?: boolean;
  /** True while a prior Cardano send is pending (local or SDK outgoing). */
  hasOutgoingPendingSpend?: boolean;
  error?: string;
}

export interface CardanoTxHistoryStateResponse {
  state: CardanoServiceState;
  items: CardanoTxHistoryItem[];
  mightHaveMore: boolean;
  hasDegradedItems?: boolean;
  error?: string;
}

/** Wallet/history pipeline state for send-flow tx tracking (subset of {@link CardanoServiceState}). */
export type CardanoTrackedTxServiceState =
  | "ready_with_data"
  | "syncing"
  | "temporarily_unavailable"
  | "provider_error";

export type CardanoTrackedTxStatus = "pending" | "confirmed" | "not_found";

export interface CardanoTrackedTxStatusResponse {
  state: CardanoTrackedTxServiceState;
  txStatus: CardanoTrackedTxStatus;
  /** Optional diagnostic (e.g. ensure/history failure); send-flow UI ignores for pending UX. */
  error?: string;
}

/**
 * Message for getting Cardano balance
 */
export class GetCardanoBalanceMsg extends Message<CardanoBalanceResponse> {
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
    return false;
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
export class EstimateSendAdaMsg extends Message<{
  fee: string;
  total: string;
  minAdaForTokens?: string;
}> {
  public static type() {
    return "cardano-estimate-send-ada";
  }

  constructor(
    public readonly to: string,
    public readonly amount: string, // in lovelaces
    public readonly memo?: string,
    public readonly chainId?: string, // Optional chainId to ensure correct network
    public readonly assets?: CardanoAssetAmount[] // Optional native assets
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

    const hasAssets = this.assets && this.assets.length > 0;
    if (hasAssets) {
      validateNonNegativeLovelaceAmount(this.amount);
      validateCardanoAssetAmounts(this.assets);
    } else {
      validatePositiveLovelaceAmount(this.amount);
    }
  }

  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return EstimateSendAdaMsg.type();
  }
}

export interface CardanoSendAdaTxDraft {
  draftId: string;
  fee: string; // lovelace
  total: string; // lovelace (amount + fee + minAda for token outputs)
  assets?: CardanoAssetAmount[]; // native assets included in draft
  minAdaForTokens?: string; // minAda required by token outputs (lovelace)
}

/** Result of building a send draft: success with draft id, or structured ADA-only minimum violation (no draft created). */
export type BuildSendAdaTxDraftResult =
  | ({ kind: "draft" } & CardanoSendAdaTxDraft)
  | {
      kind: "minimum_violation";
      minimumOutputLovelace: string;
      coinMissingLovelace: string;
    };

/**
 * Internal-only: Build a Cardano send transaction draft once and reuse it for fee display + signing/submission.
 * Supports both ADA-only and multi-asset transactions.
 */
export class BuildSendAdaTxDraftMsg extends Message<BuildSendAdaTxDraftResult> {
  public static type() {
    return "cardano-build-send-ada-tx-draft";
  }

  constructor(
    public readonly to: string,
    public readonly amount: string, // in lovelaces (ADA portion)
    public readonly memo?: string,
    public readonly chainId?: string,
    public readonly assets?: CardanoAssetAmount[], // Optional native assets
    /**
     * ADA-only: when true, `amount` may be `"0"` while the UI still shows a positive decimal
     * (send-adapter maps that to lovelace `"0"` for draft build). Used so minimum-ADA checks
     * run on the draft path instead of being blocked by validatePositiveLovelaceAmount.
     * Must stay false when native assets are present (those paths use non-negative ADA rules).
     */
    public readonly allowZeroForMinimumCheck?: boolean
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

    const hasAssets = this.assets && this.assets.length > 0;
    if (hasAssets) {
      validateNonNegativeLovelaceAmount(this.amount);
      validateCardanoAssetAmounts(this.assets);
    } else if (this.allowZeroForMinimumCheck) {
      validateNonNegativeLovelaceAmount(this.amount);
    } else {
      validatePositiveLovelaceAmount(this.amount);
    }
  }

  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return BuildSendAdaTxDraftMsg.type();
  }
}

/**
 * Internal-only: Sign and submit a previously built Cardano tx draft.
 */
export class SubmitSendAdaTxDraftMsg extends Message<string> {
  public static type() {
    return "cardano-submit-send-ada-tx-draft";
  }

  constructor(
    public readonly draftId: string,
    public readonly chainId?: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.draftId) {
      throw new Error("draftId is empty");
    }
  }

  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SubmitSendAdaTxDraftMsg.type();
  }
}

/**
 * Internal-only: same as SubmitSendAdaTxDraftMsg, but requires password confirmation even if wallet is already unlocked.
 */
export class SubmitSendAdaTxDraftWithPasswordMsg extends Message<string> {
  public static type() {
    return "cardano-submit-send-ada-tx-draft-with-password";
  }

  constructor(
    public readonly draftId: string,
    public readonly password: string,
    public readonly chainId?: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.draftId) {
      throw new Error("draftId is empty");
    }
    if (!this.password) {
      throw new Error("password is empty");
    }
  }

  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SubmitSendAdaTxDraftWithPasswordMsg.type();
  }
}

/**
 * Internal-only: discard a previously built Cardano tx draft (to avoid leaking drafts while user edits form).
 */
export class DiscardSendAdaTxDraftMsg extends Message<void> {
  public static type() {
    return "cardano-discard-send-ada-tx-draft";
  }

  constructor(public readonly draftId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.draftId) {
      throw new Error("draftId is empty");
    }
  }

  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return DiscardSendAdaTxDraftMsg.type();
  }
}

/**
 * Message for getting Cardano wallet sync status (for UI sync status check)
 */
export class GetCardanoSyncStatusMsg extends Message<CardanoSyncStatusResponse> {
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
export class GetCardanoTxHistoryMsg extends Message<CardanoTxHistoryStateResponse> {
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
    if (
      !this.pageSize ||
      isNaN(Number(this.pageSize)) ||
      Number(this.pageSize) <= 0
    ) {
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
 * Internal-only: read pending vs confirmed for a submitted tx id (merged history + local pending).
 */
export class GetCardanoTrackedTxStatusMsg extends Message<CardanoTrackedTxStatusResponse> {
  public static type() {
    return "cardano-get-tracked-tx-status";
  }

  constructor(public readonly txId: string, public readonly chainId: string) {
    super();
  }

  validateBasic(): void {
    if (!this.txId || !this.txId.trim()) {
      throw new Error("txId is empty");
    }
    if (!this.chainId || !this.chainId.trim()) {
      throw new Error("chainId is empty");
    }
  }

  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetCardanoTrackedTxStatusMsg.type();
  }
}

/**
 * Internal-only: compute the maximum spendable ADA amount (lovelace string) using real
 * coin-selection fee estimation. Mirrors lace's useMaxAda / calculateMaxAda algorithm.
 */
export class GetMaxSpendableAdaMsg extends Message<string> {
  public static type() {
    return "cardano-get-max-spendable-ada";
  }

  constructor(
    public readonly chainId: string,
    public readonly sender: string,
    public readonly recipient?: string,
    public readonly memo?: string
  ) {
    super();
  }

  validateBasic(): void {
    if (!this.chainId) {
      throw new Error("chainId is empty");
    }
    if (!this.sender) {
      throw new Error("sender is empty");
    }
  }

  override approveExternal(): boolean {
    return false;
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetMaxSpendableAdaMsg.type();
  }
}

/**
 * Message for loading more Cardano tx history items (ADA-only MVP).
 * Internal-only.
 */
export class LoadMoreCardanoTxHistoryMsg extends Message<CardanoTxHistoryStateResponse> {
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
    if (
      !this.pageSize ||
      isNaN(Number(this.pageSize)) ||
      Number(this.pageSize) <= 0
    ) {
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
