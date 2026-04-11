import {
  CardanoKeyRing,
  KeyStore,
  Key,
  CardanoWalletManager,
  formatLegacyMinimumViolationLovelaceError,
  mapCardanoMinimumViolation,
  cardanoMalformedMinimumPayloadError,
  CARDANO_SEND_CONFLICT_PENDING_MESSAGE,
} from "@keplr-wallet/cardano";
import { Crypto } from "../keyring/crypto";
import type { KeyStore as KeyringKeyStore } from "../keyring/types";
import { Notification } from "../tx/types";
import type { CardanoTxHistoryItem, CardanoTxHistoryAsset, CardanoTxHistoryResponse, CardanoAssetAmount } from "./messages";
import type { BuildSendAdaTxDraftResult } from "./messages";
import { createObservableTransactionsByAddressesProvider, createTxHistoryLoader, getTxInputsValueAndAddress, parseAssetId } from "@keplr-wallet/cardano";
import { firstValueFrom, of, ReplaySubject, Subscription } from "rxjs";
import { skip, take, timeout } from "rxjs/operators";
import type { KVStore } from "@keplr-wallet/common";
import { CardanoTxHistoryStore } from "./tx-history-store";
import { computeDraftSummaryHash } from "./draft-summary-hash";
import { createHash } from "crypto";
import {
  getWalletAddressSet,
  transformPendingTxsToItems,
  type WalletForPendingHistory,
  type AssetInfoLike,
  getAssetsFromValue,
} from "./cardano-pending-history";

/**
 * Thin wrapper around @keplr-wallet/cardano that makes Cardano logic look like
 * any other chain for the background level. This keeps KeyRing chain-independent,
 * while CardanoService encapsulates the specific SDK.
 */
export class CardanoService {
  private keyRing?: CardanoKeyRing;
  private notification?: Notification;
  private txHistoryStore?: CardanoTxHistoryStore;
  private txHistoryControllers = new Map<
    string,
    {
      pageSize: number;
      walletId: string;
      walletManagerRef: unknown;
      hasRealEmission: boolean;
      last: { items: CardanoTxHistoryItem[]; mightHaveMore: boolean; hasDegradedItems?: boolean };
      loader: ReturnType<typeof createTxHistoryLoader>;
      latest$: ReplaySubject<{ items: CardanoTxHistoryItem[]; mightHaveMore: boolean; hasDegradedItems?: boolean }>;
      sub: Subscription;
      errorSub: Subscription;
    }
  >();
  private runtimeSessionId = "";
  /** Serializes Cardano ADA draft submit (sign + broadcast + pending bookkeeping). */
  private submitAdaTxDraftSerial: Promise<void> = Promise.resolve();

  constructor(notification?: Notification, kvStore?: KVStore) {
    this.notification = notification;
    if (kvStore) {
      this.txHistoryStore = new CardanoTxHistoryStore(kvStore);
    }
  }

  /**
   * Restore internal CardanoKeyRing from saved keystore of Background wallet.
   */
  async restoreFromKeyStore(
    store: KeyStore,
    password: string,
    crypto?: any,
    chainId?: string
  ): Promise<void> {
    if (!this.keyRing) {
      this.keyRing = new CardanoKeyRing();
    }

    const decryptFn = crypto
      ? (keyStore: KeyStore, pwd: string) =>
          Crypto.decrypt(crypto, keyStore as KeyringKeyStore, pwd)
      : undefined;
    
    try {
      await this.keyRing.restore(
        store as KeyStore,
        password,
        decryptFn,
        chainId
      );
    } catch (error) {
      throw error;
    }

    await this.waitForKeyAgentReady();
    this.runtimeSessionId = `cad_sess_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  /**
   * Get Cardano-specific metadata (serialized agent etc.) from mnemonic.
   * Used when creating new KeyStore.
   */
  async createMetaFromMnemonic(
    mnemonic: string,
    password: string,
    chainId?: string
  ): Promise<Record<string, string>> {
    const helper = new CardanoKeyRing();
    return helper.getMetaFromMnemonic(mnemonic, password, chainId);
  }

  /** Check if CardanoService is properly initialized */
  isInitialized(): boolean {
    return this.keyRing !== undefined;
  }

  /** Reset CardanoService to avoid stale wallet state after switches */
  reset(): void {
    for (const controller of this.txHistoryControllers.values()) {
      try {
        controller.sub?.unsubscribe();
        controller.errorSub?.unsubscribe();
      } catch {
      }
    }
    this.txHistoryControllers.clear();
    this.sendAdaTxDrafts.clear();
    this.locallyPendingSentTxs.clear();
    this.submitAdaTxDraftSerial = Promise.resolve();
    this.keyRing = undefined;
    this.runtimeSessionId = "";
  }

  getCurrentRuntimeSessionId(): string {
    if (!this.runtimeSessionId) {
      this.runtimeSessionId = `cad_sess_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2)}`;
    }
    return this.runtimeSessionId;
  }

  /** Get Cardano public key/address for UI and signing */
  async getKey(chainId?: string): Promise<Key> {
    if (!this.keyRing) {
      throw new Error(
        "CardanoService not initialised. Call restoreFromKeyStore() first."
      );
    }
    return this.keyRing.getKey(chainId);
  }

  /**
   * Sends ADA (or ADA + native assets) transaction
   */
  async sendAda(params: {
    to: string;
    amount: string; // in lovelaces (1 ADA = 1,000,000 lovelaces)
    memo?: string;
    assets?: CardanoAssetAmount[];
  }): Promise<string> {
    if (!this.keyRing) {
      throw new Error(
        "CardanoService not initialised. Call restoreFromKeyStore() first."
      );
    }

    if (!this.keyRing.isTransactionReady()) {
      throw new Error(
        "CardanoService not ready for transactions. Wallet manager not initialized."
      );
    }

    try {
      const sdkAssets = params.assets ? this.toSdkAssetMap(params.assets) : undefined;
      const txId = await this.keyRing.sendAda({
        to: params.to,
        amount: params.amount,
        memo: params.memo,
        assets: sdkAssets,
      });
      this.registerLocallyPendingSentTx(params, txId);
      return txId;
    } catch (error: any) {
      this.processCardanoTxError(error);
      throw error;
    }
  }

  /** Convert serializable CardanoAssetAmount[] to SDK-compatible Map. */
  private toSdkAssetMap(assets: CardanoAssetAmount[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const a of assets) {
      map.set(a.assetId, a.amount);
    }
    return map;
  }

  private readonly locallyPendingSentTxs: Map<
    string,
    Map<string, { createdAt: number; amount: string; fee?: string; minAdaForTokens?: string; assets?: CardanoAssetAmount[] }>
  > = new Map();

  private registerLocallyPendingSentTx(
    params: { amount: string; fee?: string; minAdaForTokens?: string; assets?: CardanoAssetAmount[] },
    txId: string,
    chainId?: string
  ) {
    if (!chainId) {
      return;
    }
    const chainKey = chainId;
    const perChain =
      this.locallyPendingSentTxs.get(chainKey) ?? new Map<string, { createdAt: number; amount: string; fee?: string; minAdaForTokens?: string; assets?: CardanoAssetAmount[] }>();
    perChain.set(txId, {
      createdAt: Date.now(),
      amount: params.amount,
      fee: params.fee != null ? String(params.fee) : undefined,
      minAdaForTokens: params.minAdaForTokens != null ? String(params.minAdaForTokens) : undefined,
      assets: params.assets,
    });
    this.locallyPendingSentTxs.set(chainKey, perChain);
  }

  private removeLocallyPendingSentTx(txId: string, chainId?: string) {
    if (!chainId) {
      return;
    }
    const perChain = this.locallyPendingSentTxs.get(chainId);
    if (!perChain) {
      return;
    }
    perChain.delete(txId);
    if (perChain.size === 0) {
      this.locallyPendingSentTxs.delete(chainId);
    }
  }

  private createDraftPendingTxId(draftId: string): string {
    return `draft-pending:${draftId}`;
  }

  private async runWithSubmitAdaTxDraftLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.submitAdaTxDraftSerial;
    let release!: () => void;
    this.submitAdaTxDraftSerial = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Short window where locallyPendingSentTxs still blocks sends until SDK outgoing updates. */
  private static readonly LOCAL_OUTGOING_GUARD_GRACE_MS = 15_000;

  /**
   * Read-only: SDK outgoing queues. No wallet mutations.
   */
  private async hasSdkOutgoingPending(): Promise<boolean> {
    const walletManager = this.keyRing?.getWalletManager?.() as
      | CardanoWalletManager
      | undefined;
    if (!walletManager?.hasWallet?.()) {
      return false;
    }
    const wallet = walletManager.getWallet() as WalletForPendingHistory;
    const outgoing = wallet?.transactions?.outgoing;
    if (!outgoing) {
      return false;
    }
    const inFlight = (await firstValueFrom(outgoing.inFlight$ ?? of([])).catch(
      () => []
    )) as unknown[];
    const signed = (await firstValueFrom(outgoing.signed$ ?? of([])).catch(
      () => []
    )) as unknown[];
    return (inFlight?.length ?? 0) > 0 || (signed?.length ?? 0) > 0;
  }

  /**
   * Read-only: true if locallyPendingSentTxs has any entry fresh enough to block sends.
   * Does not mutate the map (shared with activity in withPendingTxs).
   */
  private hasFreshLocalOutgoingGuard(chainId?: string): boolean {
    if (!chainId) {
      return false;
    }
    const perChain = this.locallyPendingSentTxs.get(chainId);
    if (!perChain || perChain.size === 0) {
      return false;
    }
    const now = Date.now();
    for (const [, v] of perChain) {
      if (now - v.createdAt <= CardanoService.LOCAL_OUTGOING_GUARD_GRACE_MS) {
        return true;
      }
    }
    return false;
  }

  /** Internal: used by build/submit enforcement (errors propagate). */
  private async hasConflictingOutgoingSpend(chainId?: string): Promise<boolean> {
    if (await this.hasSdkOutgoingPending()) {
      return true;
    }
    if (this.hasFreshLocalOutgoingGuard(chainId)) {
      return true;
    }
    return false;
  }

  /**
   * True while a prior send is still pending (local or SDK outgoing queues).
   * Used by sync status UI; enforcement is in buildSendAdaTxDraft / submitSendAdaTxDraft.
   */
  async getHasOutgoingPendingSpend(chainId?: string): Promise<boolean> {
    try {
      return await this.hasConflictingOutgoingSpend(chainId);
    } catch {
      return false;
    }
  }

  /**
   * Gets Cardano wallet balance
   */
  async getBalance(): Promise<any> {
    if (!this.keyRing) {
      throw new Error(
        "CardanoService not initialised. Call restoreFromKeyStore() first."
      );
    }

    return this.keyRing.getBalance();
  }

  /**
   * Estimate transaction fee and total amount for ADA (or multi-asset) send.
   * Proxies to walletManager which uses SDK's coin selection.
   */
  async estimateSendAda(params: {
    to: string;
    amount: string; // in lovelaces
    memo?: string;
    assets?: CardanoAssetAmount[];
  }): Promise<{ fee: string; total: string; minAdaForTokens?: string }> {
    if (!this.keyRing) {
      throw new Error(
        "CardanoService not initialised. Call restoreFromKeyStore() first."
      );
    }

    if (!this.keyRing.isTransactionReady()) {
      throw new Error(
        "CardanoService not ready for transactions. Wallet manager not initialized."
      );
    }

    const walletManager: CardanoWalletManager | undefined = this.keyRing.getWalletManager();
    if (!walletManager) {
      throw new Error("Wallet manager not initialized");
    }

    const sdkAssets = params.assets ? this.toSdkAssetMap(params.assets) : undefined;
    const outcome = await walletManager.buildSendAdaTxDraftOutcome({
      to: params.to,
      amount: params.amount,
      memo: params.memo,
      assets: sdkAssets,
    });

    if (outcome.kind === "minimum_violation") {
      const violation = mapCardanoMinimumViolation({
        minimumOutputLovelace: outcome.minimumOutputLovelace,
        coinMissingLovelace: outcome.coinMissingLovelace,
      });
      if (!violation) {
        throw cardanoMalformedMinimumPayloadError(
          "Failed to estimate Cardano transaction"
        );
      }
      throw new Error(
        formatLegacyMinimumViolationLovelaceError({
          violation,
        })
      );
    }

    return {
      fee: outcome.fee,
      total: outcome.total,
      minAdaForTokens: outcome.minAdaForTokens,
    };
  }

  /**
   * Returns true if the error indicates coin selection exhausted (insufficient UTxO).
   * Other errors (e.g. network) are rethrown so the UI can fallback.
   */
  private static isInsufficientFundsError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    return (
      msg.toLowerCase().includes("insufficient") ||
      msg.includes("UTxO Balance Insufficient")
    );
  }

  /**
   * Compute the maximum ADA amount (lovelace string) the wallet can send.
   * Mirrors lace's useMaxAda / calculateMaxAda algorithm
   * Constants match lace's UTXO_DEPLETED_ADA_BUFFER (1 ADA) and ADA_BUFFER_LIMIT (10 ADA).
   */
  async getMaxSpendableAda(params: {
    /**
     * The wallet's own address, used only as the probe destination when no
     * recipient is provided (self-send estimation). Balance is always taken
     * from the active wallet context; this parameter does not identify which
     * wallet to query.
     */
    sender: string;
    recipient?: string;
    memo?: string;
  }): Promise<string> {
    if (!this.isReady()) {
      throw new Error("Cardano service not ready. Please unlock wallet first.");
    }

    const balanceRaw = await this.getBalance();
    const balance: bigint = balanceRaw?.utxo?.available?.coins ?? BigInt(0);
    if (balance <= BigInt(0)) return "0";

    const to = params.recipient || params.sender;

    // lace: UTXO_DEPLETED_ADA_BUFFER = 1_000_000; ADA_BUFFER_LIMIT = UTXO_DEPLETED_ADA_BUFFER * 10
    const STEP = BigInt(1_000_000);
    const MAX_BUFFER = BigInt(10_000_000);

    // Phase 1 — probe
    const probeAmount = balance - STEP;
    if (probeAmount <= BigInt(0)) return "0";

    let probeFee: bigint;
    let probeMinAdaForTokens: bigint;
    try {
      const result = await this.estimateSendAda({
        to,
        amount: probeAmount.toString(),
        memo: params.memo,
      });
      probeFee = BigInt(result.fee);
      // minAdaForTokens: ADA locked in token change outputs — mirrors lace's minimumCoins subtraction
      probeMinAdaForTokens = result.minAdaForTokens
        ? BigInt(result.minAdaForTokens)
        : BigInt(0);
    } catch (err) {
      if (!CardanoService.isInsufficientFundsError(err)) throw err;
      return "0";
    }

    // Phase 2 — initial estimate (mirrors lace's spendableBalance = balance − fee − minimumCoins)
    const maxAdaAmount = balance - probeFee - probeMinAdaForTokens;
    if (maxAdaAmount <= BigInt(0)) return "0";

    // Phase 3 — refinement loop (mirrors calculateMaxAda)
    for (let buf = BigInt(0); buf <= MAX_BUFFER; buf += STEP) {
      const amountToTry = maxAdaAmount - buf;
      if (amountToTry <= BigInt(0)) return "0";
      try {
        await this.estimateSendAda({
          to,
          amount: amountToTry.toString(),
          memo: params.memo,
        });
        return amountToTry.toString();
      } catch (err) {
        if (!CardanoService.isInsufficientFundsError(err)) throw err;
        // coin selection exhausted at this amount; retry with 1 ADA less
      }
    }

    return "0";
  }

  private readonly sendAdaTxDrafts: Map<
    string,
    {
      createdAt: number;
      chainId?: string;
      walletId: string;
      selectedAccountAddress: string;
      selectedKeyStoreId: string;
      networkId: string;
      unlockSessionId: string;
      source?: string;
      payloadHash: string;
      to: string;
      amount: string;
      memo?: string;
      assets?: CardanoAssetAmount[];
      fee: string;
      total: string;
      minAdaForTokens?: string;
      tx: any;
    }
  > = new Map();

  async buildSendAdaTxDraft(params: {
    to: string;
    amount: string;
    memo?: string;
    chainId?: string;
    assets?: CardanoAssetAmount[];
    walletId: string;
    selectedAccountAddress: string;
    selectedKeyStoreId: string;
    networkId: string;
    unlockSessionId: string;
    source?: string;
  }): Promise<BuildSendAdaTxDraftResult> {
    const walletManager: CardanoWalletManager | undefined = this.getWalletManager();
    if (!walletManager) {
      throw new Error("Wallet manager not initialized");
    }

    if (await this.hasConflictingOutgoingSpend(params.chainId)) {
      throw new Error(CARDANO_SEND_CONFLICT_PENDING_MESSAGE);
    }

    const sdkAssets = params.assets ? this.toSdkAssetMap(params.assets) : undefined;
    const outcome = await walletManager.buildSendAdaTxDraftOutcome({
      to: params.to,
      amount: params.amount,
      memo: params.memo,
      assets: sdkAssets,
    });
    if (outcome.kind === "minimum_violation") {
      return outcome;
    }
    const built = outcome;

    const draftId = `cad_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2)}`;

    const payloadHash = this.computeDraftPayloadHash({
      chainId: params.chainId,
      walletId: params.walletId,
      selectedAccountAddress: params.selectedAccountAddress,
      selectedKeyStoreId: params.selectedKeyStoreId,
      networkId: params.networkId,
      unlockSessionId: params.unlockSessionId,
      source: params.source,
      to: params.to,
      amount: params.amount,
      memo: params.memo,
      assets: params.assets,
      fee: built.fee,
      total: built.total,
      minAdaForTokens: built.minAdaForTokens,
      tx: built.tx,
    });

    this.sendAdaTxDrafts.set(draftId, {
      payloadHash,
      createdAt: Date.now(),
      chainId: params.chainId,
      walletId: params.walletId,
      selectedAccountAddress: params.selectedAccountAddress,
      selectedKeyStoreId: params.selectedKeyStoreId,
      networkId: params.networkId,
      unlockSessionId: params.unlockSessionId,
      source: params.source,
      to: params.to,
      amount: params.amount,
      memo: params.memo,
      assets: params.assets,
      fee: built.fee,
      total: built.total,
      minAdaForTokens: built.minAdaForTokens,
      tx: built.tx,
    });

    return {
      kind: "draft",
      draftId,
      fee: built.fee,
      total: built.total,
      assets: params.assets,
      minAdaForTokens: built.minAdaForTokens,
    };
  }

  async submitSendAdaTxDraft(params: {
    draftId: string;
    chainId?: string;
    walletId: string;
    selectedAccountAddress: string;
    selectedKeyStoreId: string;
    networkId: string;
    unlockSessionId: string;
    approvedSummaryHash: string;
    approvedPayloadHash: string;
  }): Promise<string> {
    return await this.runWithSubmitAdaTxDraftLock(async () => {
      const draft = this.sendAdaTxDrafts.get(params.draftId);
      if (!draft) {
        throw new Error("Transaction draft not found. Please rebuild and try again.");
      }

      // Keep draft lifetime short to avoid stale context reuse.
      const ttlMs = 10 * 60 * 1000; // 10 minutes
      if (Date.now() - draft.createdAt > ttlMs) {
        this.sendAdaTxDrafts.delete(params.draftId);
        throw new Error("Transaction draft expired. Please rebuild and try again.");
      }

      // Optional safety: ensure the draft is used on the intended chain.
      if (draft.chainId && params.chainId && draft.chainId !== params.chainId) {
        throw new Error("Transaction draft chain mismatch. Please rebuild and try again.");
      }
      if (
        draft.walletId !== params.walletId ||
        draft.selectedAccountAddress !== params.selectedAccountAddress ||
        draft.selectedKeyStoreId !== params.selectedKeyStoreId ||
        draft.networkId !== params.networkId ||
        draft.unlockSessionId !== params.unlockSessionId
      ) {
        this.sendAdaTxDrafts.delete(params.draftId);
        throw new Error("Transaction draft context mismatch. Please rebuild and try again.");
      }
      if (this.getDraftSummaryHash(draft) !== params.approvedSummaryHash) {
        this.sendAdaTxDrafts.delete(params.draftId);
        throw new Error("Transaction draft summary mismatch. Please rebuild and try again.");
      }
      if (draft.payloadHash !== params.approvedPayloadHash) {
        this.sendAdaTxDrafts.delete(params.draftId);
        throw new Error("Transaction draft payload mismatch. Please rebuild and try again.");
      }
      if (this.computeDraftPayloadHash(draft) !== draft.payloadHash) {
        this.sendAdaTxDrafts.delete(params.draftId);
        throw new Error("Transaction draft payload changed. Please rebuild and try again.");
      }

      if (await this.hasConflictingOutgoingSpend(params.chainId)) {
        throw new Error(CARDANO_SEND_CONFLICT_PENDING_MESSAGE);
      }

      const draftPendingTxId = this.createDraftPendingTxId(params.draftId);
      this.registerLocallyPendingSentTx(
        {
          amount: draft.amount,
          fee: draft.fee,
          minAdaForTokens: draft.minAdaForTokens,
          assets: draft.assets,
        },
        draftPendingTxId,
        params.chainId
      );

      try {
        const walletManager: CardanoWalletManager | undefined = this.getWalletManager();
        if (!walletManager) {
          throw new Error("Wallet manager not initialized");
        }
        const signedTx = (await draft.tx.sign()).cbor;
        const txIdAny = await walletManager.submitTx(signedTx);
        const txId =
          typeof txIdAny === "string"
            ? txIdAny
            : txIdAny?.toString?.() ?? String(txIdAny);

        this.removeLocallyPendingSentTx(draftPendingTxId, params.chainId);

        this.registerLocallyPendingSentTx(
          {
            amount: draft.amount,
            fee: draft.fee,
            minAdaForTokens: draft.minAdaForTokens,
            assets: draft.assets,
          },
          txId,
          params.chainId
        );

        this.sendAdaTxDrafts.delete(params.draftId);
        return txId;
      } catch (error: any) {
        this.removeLocallyPendingSentTx(draftPendingTxId, params.chainId);
        this.sendAdaTxDrafts.delete(params.draftId);
        this.processCardanoTxError(error);
        throw error;
      }
    });
  }

  discardSendAdaTxDraft(draftId: string): void {
    this.sendAdaTxDrafts.delete(draftId);
  }

  getSendAdaTxDraftApprovalData(params: {
    draftId: string;
    chainId?: string;
    walletId: string;
    selectedAccountAddress: string;
    selectedKeyStoreId: string;
    networkId: string;
    unlockSessionId: string;
  }): {
    summaryHash: string;
    payloadHash: string;
    createdAt: number;
    draft: {
      draftId: string;
      to: string;
      amount: string;
      memo?: string;
      assets?: CardanoAssetAmount[];
      fee: string;
      total: string;
      minAdaForTokens?: string;
      chainId?: string;
      networkId: string;
      source?: string;
      sender: string;
    };
  } {
    const draft = this.sendAdaTxDrafts.get(params.draftId);
    if (!draft) {
      throw new Error("Transaction draft not found. Please rebuild and try again.");
    }

    const ttlMs = 10 * 60 * 1000;
    if (Date.now() - draft.createdAt > ttlMs) {
      this.sendAdaTxDrafts.delete(params.draftId);
      throw new Error("Transaction draft expired. Please rebuild and try again.");
    }
    if (draft.chainId && params.chainId && draft.chainId !== params.chainId) {
      throw new Error("Transaction draft chain mismatch. Please rebuild and try again.");
    }
    if (
      draft.walletId !== params.walletId ||
      draft.selectedAccountAddress !== params.selectedAccountAddress ||
      draft.selectedKeyStoreId !== params.selectedKeyStoreId ||
      draft.networkId !== params.networkId ||
      draft.unlockSessionId !== params.unlockSessionId
    ) {
      this.sendAdaTxDrafts.delete(params.draftId);
      throw new Error("Transaction draft context mismatch. Please rebuild and try again.");
    }

    return {
      summaryHash: this.getDraftSummaryHash(draft),
      payloadHash: draft.payloadHash,
      createdAt: draft.createdAt,
      draft: {
        draftId: params.draftId,
        to: draft.to,
        amount: draft.amount,
        memo: draft.memo,
        assets: draft.assets,
        fee: draft.fee,
        total: draft.total,
        minAdaForTokens: draft.minAdaForTokens,
        chainId: draft.chainId,
        networkId: draft.networkId,
        source: draft.source,
        sender: draft.selectedAccountAddress,
      },
    };
  }

  private getDraftSummaryHash(draft: {
    to: string;
    amount: string;
    memo?: string;
    assets?: CardanoAssetAmount[];
    fee: string;
    total: string;
    minAdaForTokens?: string;
    networkId: string;
    selectedAccountAddress: string;
  }): string {
    return computeDraftSummaryHash(draft);
  }

  private computeDraftPayloadHash(draft: {
    chainId?: string;
    walletId: string;
    selectedAccountAddress: string;
    selectedKeyStoreId: string;
    networkId: string;
    unlockSessionId: string;
    source?: string;
    to: string;
    amount: string;
    memo?: string;
    assets?: CardanoAssetAmount[];
    fee: string;
    total: string;
    minAdaForTokens?: string;
    tx?: any;
  }): string {
    const normalizedAssets = (draft.assets ?? [])
      .map((a) => `${a.assetId}:${a.amount}`)
      .sort();
    const txFingerprint = this.trySerializeTxFingerprint(draft.tx);
    const payload = JSON.stringify({
      chainId: draft.chainId ?? "",
      walletId: draft.walletId,
      sender: draft.selectedAccountAddress,
      selectedKeyStoreId: draft.selectedKeyStoreId,
      networkId: draft.networkId,
      unlockSessionId: draft.unlockSessionId,
      source: draft.source ?? "",
      to: draft.to,
      amount: draft.amount,
      memo: draft.memo ?? "",
      fee: draft.fee,
      total: draft.total,
      minAdaForTokens: draft.minAdaForTokens ?? "",
      assets: normalizedAssets,
      txFingerprint: txFingerprint ?? "",
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  private trySerializeTxFingerprint(tx: any): string | undefined {
    try {
      if (tx && typeof tx.toCbor === "function") {
        return tx.toCbor();
      }
      if (tx && typeof tx.cbor === "string") {
        return tx.cbor;
      }
      if (tx && typeof tx.toCore === "function") {
        return JSON.stringify(tx.toCore());
      }
    } catch (error) {
      console.warn("[CardanoService] tx fingerprint serialization failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }

    if (tx != null) {
      console.warn("[CardanoService] tx fingerprint unavailable", {
        txType: typeof tx,
        hasToCbor: typeof tx?.toCbor === "function",
        hasCborString: typeof tx?.cbor === "string",
        hasToCore: typeof tx?.toCore === "function",
      });
    }
    return undefined;
  }

  /**
   * Checks service readiness for transaction operations
   * Requires both keyRing and walletManager to be initialized
   */
  isReady(): boolean {
    return !!(this.keyRing && this.keyRing.isTransactionReady());
  }

  getRuntimeState(): "not_initialized" | "provider_unavailable" | "ready" {
    if (!this.keyRing) return "not_initialized";
    const walletManager = this.keyRing.getWalletManager();
    if (!walletManager) return "not_initialized";
    const runtimeStatusGetter = (walletManager as any)?.getRuntimeStatus;
    if (typeof runtimeStatusGetter === "function") {
      return runtimeStatusGetter.call(walletManager);
    }
    return walletManager.hasWallet() ? "ready" : "provider_unavailable";
  }

  /**
   * Gets wallet manager for advanced operations
   * WARNING: Provides direct access to CardanoWalletManager
   */
  getWalletManager() {
    if (!this.keyRing) {
      throw new Error(
        "CardanoService not initialised. Call restoreFromKeyStore() first."
      );
    }

    return this.keyRing.getWalletManager();
  }

  /**
   * Returns paginated transaction history for Cardano (ADA-only MVP).
   * Uses lace-style tx-history-loader to page beyond local wallet store.
   */
  async getTxHistory(params: {
    pageSize: number;
    chainId?: string;
    walletId?: string;
  }): Promise<CardanoTxHistoryResponse> {
    if (!params.chainId) {
      throw new Error("temporarily_unavailable: missing_chain_context");
    }
    if (!params.walletId) {
      throw new Error("temporarily_unavailable: missing_wallet_context");
    }
    const chainKey = params.chainId;
    const walletKey = params.walletId;
    const controller = await this.ensureTxHistoryController(
      chainKey,
      params.pageSize,
      walletKey
    );
    // Wait for first real emission from history loader. Do not treat seed/fallback as valid empty history.
    if (!controller.hasRealEmission) {
      try {
        const res = await firstValueFrom(controller.latest$.pipe(take(1), timeout(10000)));
        return await this.withPendingTxs(res, params.chainId);
      } catch {
        throw new Error("syncing: tx_history_initial_load_timeout");
      }
    }
    const res = await firstValueFrom(controller.latest$);
    return await this.withPendingTxs(res, params.chainId);
  }

  async loadMoreTxHistory(params: {
    pageSize: number;
    chainId?: string;
    walletId?: string;
  }): Promise<CardanoTxHistoryResponse> {
    if (!params.chainId) {
      throw new Error("temporarily_unavailable: missing_chain_context");
    }
    if (!params.walletId) {
      throw new Error("temporarily_unavailable: missing_wallet_context");
    }
    const chainKey = params.chainId;
    const walletKey = params.walletId;
    const controller = await this.ensureTxHistoryController(
      chainKey,
      params.pageSize,
      walletKey
    );
    if (!controller.last.mightHaveMore) {
      return await this.withPendingTxs(controller.last, params.chainId);
    }
    // ReplaySubject emits current immediately; skip it and wait for the next update after loadMore().
    const next = firstValueFrom(controller.latest$.pipe(skip(1), take(1), timeout(10000))).catch(() => {
      throw new Error("syncing: tx_history_load_more_timeout");
    });
    controller.loader.loadMore();
    return await this.withPendingTxs(await next, params.chainId);
  }

  private async withPendingTxs(
    res: { items: CardanoTxHistoryItem[]; mightHaveMore: boolean; hasDegradedItems?: boolean },
    chainId?: string
  ): Promise<CardanoTxHistoryResponse> {
    const walletManager: CardanoWalletManager | undefined = this.getWalletManager();
    if (!walletManager || !walletManager.hasWallet()) {
      return res;
    }

    const wallet = walletManager.getWallet();
    const walletAddresses = await getWalletAddressSet(wallet as WalletForPendingHistory);
    const pending = await transformPendingTxsToItems(
      wallet as WalletForPendingHistory,
      walletAddresses,
      (id, map) => this.resolveAssetMetadata(id, map as Map<string, any>)
    );

    // Resolve asset metadata for locally pending txs (same as for confirmed/SDK-pending txs)
    let assetInfoMap: Map<string, AssetInfoLike> | undefined;
    try {
      assetInfoMap = await firstValueFrom(wallet.assetInfo$).catch(() => undefined) as Map<string, AssetInfoLike> | undefined;
    } catch { /* non-critical */ }

    const locallyPending = (() => {
      if (!chainId) return [] as CardanoTxHistoryItem[];
      const perChain = this.locallyPendingSentTxs.get(chainId);
      if (!perChain) return [] as CardanoTxHistoryItem[];

      const ttlMs = 10 * 60 * 1000;
      const now = Date.now();

      const items: CardanoTxHistoryItem[] = [];
      for (const [id, v] of perChain.entries()) {
        if (now - v.createdAt > ttlMs) {
          perChain.delete(id);
          continue;
        }
        const historyAssets: CardanoTxHistoryAsset[] | undefined = v.assets?.map((a) => {
          const { policyId, assetName } = parseAssetId(a.assetId);
          const meta = this.resolveAssetMetadata(a.assetId, assetInfoMap);
          return {
            policyId,
            assetName,
            assetId: a.assetId,
            amount: a.amount,
            displayName: meta.displayName,
            ticker: meta.ticker,
            decimals: meta.decimals,
            fingerprint: meta.fingerprint,
          };
        });
        // For token sends, amount is 0; show total ADA (amount + minAdaForTokens) so user sees non-zero
        const amountDisplay =
          v.minAdaForTokens && v.amount !== undefined
            ? (BigInt(v.amount) + BigInt(v.minAdaForTokens)).toString()
            : v.amount;

        items.push({
          id,
          status: "pending",
          direction: "sent",
          amount: amountDisplay,
          fee: v.fee,
          assets: historyAssets && historyAssets.length > 0 ? historyAssets : undefined,
        });
      }

      if (perChain.size === 0) {
        this.locallyPendingSentTxs.delete(chainId);
      }
      return items;
    })();

    const confirmedIds = new Set((res.items || []).map((i) => i.id));
    const pendingFiltered = pending.filter((p) => !confirmedIds.has(p.id));
    const locallyPendingFiltered = locallyPending.filter((p) => !confirmedIds.has(p.id));

    // Remove confirmed txs from local pending cache.
    if (confirmedIds.size > 0 && chainId) {
      const perChain = this.locallyPendingSentTxs.get(chainId);
      if (perChain) {
        for (const id of confirmedIds) {
          perChain.delete(id);
        }
        if (perChain.size === 0) {
          this.locallyPendingSentTxs.delete(chainId);
        }
      }
    }

    // Lace behavior: pending txs are shown above confirmed history.
    // Also dedupe by txId to avoid temporary duplicates between local pending vs wallet outgoing pending.
    const mergedPendingById = new Map<string, CardanoTxHistoryItem>();
    for (const p of locallyPendingFiltered) {
      mergedPendingById.set(p.id, p);
    }
    for (const p of pendingFiltered) {
      if (!mergedPendingById.has(p.id)) {
        mergedPendingById.set(p.id, p);
      }
    }

    return {
      items: [...Array.from(mergedPendingById.values()), ...(res.items || [])],
      mightHaveMore: res.mightHaveMore,
      hasDegradedItems: res.hasDegradedItems || (res.items || []).some((item) => item.isDegraded === true),
    };
  }

  private async ensureTxHistoryController(
    chainKey: string,
    pageSize: number,
    walletId: string
  ) {
    const key = `${chainKey}:${walletId}`;
    const existing = this.txHistoryControllers.get(key);
    const walletManager: CardanoWalletManager | undefined = this.getWalletManager();
    if (!walletManager) {
      throw new Error("Wallet manager not initialized");
    }

    if (
      existing &&
      existing.pageSize === pageSize &&
      existing.walletId === walletId &&
      existing.walletManagerRef === walletManager
    ) {
      return existing;
    }

    if (existing) {
      existing.sub.unsubscribe();
      existing.errorSub.unsubscribe();
      this.txHistoryControllers.delete(key);
    }

    if (!walletManager || !walletManager.hasWallet()) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }

    const wallet = walletManager.getWallet();
    const chainHistoryProvider = walletManager.getChainHistoryProvider();

    // lace-style provider with polling/backoff
    const { DEFAULT_POLLING_CONFIG } = await import("@cardano-sdk/wallet");
    const retryBackoffConfig = {
      initialInterval: DEFAULT_POLLING_CONFIG.pollInterval,
      maxInterval: DEFAULT_POLLING_CONFIG.pollInterval * DEFAULT_POLLING_CONFIG.maxIntervalMultiplier
    };

    const provider = createObservableTransactionsByAddressesProvider(chainHistoryProvider, retryBackoffConfig, console);

    const loader = createTxHistoryLoader(
      provider,
      {
        addresses$: wallet.addresses$,
        transactions: { history$: wallet.transactions.history$ },
        syncStatus: { isSettled$: wallet.syncStatus.isSettled$ }
      },
      pageSize
    );

    const latest$ = new ReplaySubject<{ items: CardanoTxHistoryItem[]; mightHaveMore: boolean; hasDegradedItems?: boolean }>(1);

    const controller = {
      pageSize,
      walletId,
      walletManagerRef: walletManager,
      hasRealEmission: false,
      last: { items: [] as CardanoTxHistoryItem[], mightHaveMore: true, hasDegradedItems: false },
      loader,
      latest$,
      // will be assigned below
      sub: undefined as unknown as Subscription,
      errorSub: undefined as unknown as Subscription
    };

    const sub = loader.loadedHistory$.subscribe(async (loaded) => {
      try {
        const items = await this.transformHydratedTxsToItems(
          loaded.transactions,
          wallet,
          chainHistoryProvider,
          chainKey
        );
        controller.hasRealEmission = true;
        const next = {
          items,
          mightHaveMore: loaded.mightHaveMore,
          hasDegradedItems: items.some((item) => item.isDegraded === true),
        };
        controller.last = next;
        latest$.next(next);
        await this.txHistoryStore?.set(chainKey, walletId, next);
      } catch {
        // Keep last known good history on transformation failures.
        if (controller.hasRealEmission) {
          latest$.next(controller.last);
        }
      }
    });

    const errorSub = loader.error$.subscribe(() => {
      // Keep last known good value on loader errors.
      if (controller.hasRealEmission) {
        latest$.next(controller.last);
      }
    });
    controller.sub = sub;
    controller.errorSub = errorSub;
    this.txHistoryControllers.set(key, controller);

    return controller;
  }

  /** Resolve display metadata for an assetId from SDK wallet.assetInfo$. */
  private resolveAssetMetadata(
    assetId: string,
    assetInfoMap: Map<string, AssetInfoLike> | undefined
  ): { displayName?: string; ticker?: string; decimals?: number; fingerprint?: string } {
    if (!assetInfoMap) return {};
    const info = assetInfoMap.get(assetId);
    if (!info) return {};
    return {
      displayName: info?.nftMetadata?.name ?? info?.tokenMetadata?.name ?? info?.name,
      ticker: info?.tokenMetadata?.ticker ?? info?.ticker,
      decimals: info?.tokenMetadata?.decimals ?? info?.decimals ?? 0,
      fingerprint: info?.fingerprint ? String(info.fingerprint) : undefined,
    };
  }

  /** Dedup console noise when history contains many txs for an unsupported chain id. */
  private static warnedUnknownSlotTimeChainKeys = new Set<string>();

  // Cardano genesis constants used to convert absolute slot → wall-clock Unix ms.
  // Byron: 20s/slot. Shelley and later: 1s/slot.
  // Mainnet + testnet systemStart values must match book.world.dev shelley-genesis.json (not environments.html summaries).
  private static slotToTimestampMs(slot: number, chainKey: string): number | undefined {
    switch (chainKey) {
      case "cardano-mainnet": {
        // Byron/system start: 2017-09-23T21:44:51Z = 1506203091s
        // Shelley transition: slot 4492800 → unix 1596059091s (1506203091 + 4492800 * 20)
        const SHELLEY_SLOT = 4_492_800;
        const SHELLEY_UNIX_S = 1_596_059_091;
        const BYRON_GENESIS_S = 1_506_203_091;
        if (slot >= SHELLEY_SLOT) {
          return (SHELLEY_UNIX_S + (slot - SHELLEY_SLOT)) * 1000;
        }
        return (BYRON_GENESIS_S + slot * 20) * 1000;
      }
      case "cardano-preview":
        // preview/shelley-genesis.json systemStart 2022-10-25T00:00:00Z, 1s/slot from chain slot 0
        return (1_666_656_000 + slot) * 1000;
      case "cardano-preprod":
        // preprod/shelley-genesis.json systemStart 2022-06-01T00:00:00Z, 1s/slot from chain slot 0
        return (1_654_041_600 + slot) * 1000;
      default:
        if (!CardanoService.warnedUnknownSlotTimeChainKeys.has(chainKey)) {
          CardanoService.warnedUnknownSlotTimeChainKeys.add(chainKey);
          console.warn(
            "[CardanoService] Unknown chainKey for slotToTimestampMs; timestamps omitted (no cross-network fallback):",
            chainKey
          );
        }
        return undefined;
    }
  }

  private async transformHydratedTxsToItems(
    txs: any[],
    wallet: WalletForPendingHistory,
    chainHistoryProvider: any,
    chainKey: string
  ): Promise<CardanoTxHistoryItem[]> {
    const walletAddresses = await getWalletAddressSet(wallet);

    // Try to load asset metadata for display names
    let assetInfoMap: Map<string, AssetInfoLike> | undefined;
    try {
      if (wallet.assetInfo$) {
        assetInfoMap = await firstValueFrom(wallet.assetInfo$).catch(() => undefined) as Map<string, AssetInfoLike> | undefined;
      }
    } catch { /* non-critical */ }

    const getCoins = (value: any): bigint => {
      const coins = value?.coins ?? value;
      if (typeof coins === "bigint") return coins;
      if (typeof coins === "number") return BigInt(coins);
      if (typeof coins === "string") return BigInt(coins);
      return BigInt(0);
    };

    const getFee = (tx: any): bigint => {
      const fee = tx?.body?.fee ?? tx?.fee;
      return getCoins(fee);
    };

    const getOutputs = (tx: any): any[] => tx?.body?.outputs ?? tx?.outputs ?? [];
    const getInputs = (tx: any): any[] => tx?.body?.inputs ?? tx?.inputs ?? [];

    const items: CardanoTxHistoryItem[] = [];

    for (const tx of txs) {
      const txId = String(tx?.id ?? "");
      if (!txId) continue;

      const outputs = getOutputs(tx);
      let ownedOutputsCoins = BigInt(0);
      const ownedOutputAssets = new Map<string, bigint>();
      const nonOwnOutputAddrs: string[] = [];

      for (const out of outputs) {
        const addr = String(out?.address ?? "");
        if (walletAddresses.has(addr)) {
          ownedOutputsCoins += getCoins(out?.value);
          for (const [assetId, qty] of getAssetsFromValue(out?.value)) {
            ownedOutputAssets.set(assetId, (ownedOutputAssets.get(assetId) ?? BigInt(0)) + qty);
          }
        } else if (addr) {
          nonOwnOutputAddrs.push(addr);
        }
      }

      let ownedInputsCoins = BigInt(0);
      const ownedInputAssets = new Map<string, bigint>();
      const nonOwnInputAddrs: string[] = [];
      let isInputResolutionDegraded = false;
      try {
        const inputs = getInputs(tx);
        const missingInputs: any[] = [];

        for (const input of inputs) {
          const addr = String(input?.address ?? "");
          const hasAddr = addr.length > 0;
          const hasValue = input?.value != null;

          if (hasAddr && hasValue) {
            if (walletAddresses.has(addr)) {
              ownedInputsCoins += getCoins(input.value);
              for (const [assetId, qty] of getAssetsFromValue(input.value)) {
                ownedInputAssets.set(assetId, (ownedInputAssets.get(assetId) ?? BigInt(0)) + qty);
              }
            } else {
              nonOwnInputAddrs.push(addr);
            }
          } else {
            missingInputs.push(input);
          }
        }

        if (missingInputs.length > 0) {
          const resolvedInputs = await getTxInputsValueAndAddress(missingInputs, chainHistoryProvider, wallet as any);
          if (resolvedInputs.length < missingInputs.length) {
            isInputResolutionDegraded = true;
          }
          for (const input of resolvedInputs) {
            const addr = String(input?.address ?? "");
            if (!addr || input?.value == null) {
              isInputResolutionDegraded = true;
              continue;
            }
            if (walletAddresses.has(addr)) {
              ownedInputsCoins += getCoins(input?.value);
              for (const [assetId, qty] of getAssetsFromValue(input?.value)) {
                ownedInputAssets.set(assetId, (ownedInputAssets.get(assetId) ?? BigInt(0)) + qty);
              }
            } else if (addr) {
              nonOwnInputAddrs.push(addr);
            }
          }
        }
      } catch {
        isInputResolutionDegraded = true;
      }

      const fee = getFee(tx);
      const net = ownedOutputsCoins - ownedInputsCoins;

      let direction: CardanoTxHistoryItem["direction"] = "unknown";
      let amount = BigInt(0);

      if (isInputResolutionDegraded) {
        direction = "unknown";
        amount = BigInt(0);
      } else if (net > 0) {
        direction = "received";
        amount = net;
      } else if (net < 0) {
        // net = -(sent + fee) for typical outgoing transactions with change.
        const abs = net * BigInt(-1);
        const maybeSent = abs > fee ? abs - fee : abs;
        direction = abs === fee ? "self" : "sent";
        amount = maybeSent;
      } else {
        direction = "self";
        amount = BigInt(0);
      }

      // Deduplicate counterparty addresses and assign based on direction.
      const uniqueNonOwnOutputAddrs = [...new Set(nonOwnOutputAddrs)];
      const uniqueNonOwnInputAddrs = [...new Set(nonOwnInputAddrs)];
      const fromAddresses = direction === "sent" || direction === "self" ? undefined : (uniqueNonOwnInputAddrs.length > 0 ? uniqueNonOwnInputAddrs : undefined);
      const toAddresses = direction === "received" || direction === "self" ? undefined : (uniqueNonOwnOutputAddrs.length > 0 ? uniqueNonOwnOutputAddrs : undefined);

      // Compute per-asset net transfers
      const assetTransfers: CardanoTxHistoryAsset[] = [];
      const allAssetIds = new Set([...ownedOutputAssets.keys(), ...ownedInputAssets.keys()]);
      for (const assetId of allAssetIds) {
        const outQty = ownedOutputAssets.get(assetId) ?? BigInt(0);
        const inQty = ownedInputAssets.get(assetId) ?? BigInt(0);
        const netAsset = outQty - inQty;
        if (netAsset === BigInt(0)) continue;
        const absAmount = netAsset < 0 ? netAsset * BigInt(-1) : netAsset;

        const { policyId, assetName } = parseAssetId(assetId);
        const meta = this.resolveAssetMetadata(assetId, assetInfoMap);

        assetTransfers.push({
          policyId,
          assetName,
          assetId,
          amount: absAmount.toString(),
          displayName: meta.displayName,
          ticker: meta.ticker,
          decimals: meta.decimals,
          fingerprint: meta.fingerprint,
        });
      }

      const slotParsed =
        tx?.blockHeader?.slot != null ? Number(tx.blockHeader.slot) : NaN;
      const slot = Number.isFinite(slotParsed) ? slotParsed : undefined;

      items.push({
        id: txId,
        blockNo: tx?.blockHeader?.blockNo != null ? Number(tx.blockHeader.blockNo) : undefined,
        slot,
        status: tx?.blockHeader?.blockNo != null || tx?.blockHeader?.slot != null ? "confirmed" : "pending",
        direction,
        amount: amount.toString(),
        fee: fee.toString(),
        assets:
          isInputResolutionDegraded || assetTransfers.length === 0
            ? undefined
            : assetTransfers,
        timestamp: slot != null ? CardanoService.slotToTimestampMs(slot, chainKey) : undefined,
        fromAddresses,
        toAddresses,
        isDegraded: isInputResolutionDegraded || undefined,
      });
    }

    return items;
  }

  /**
   * Handles Cardano transaction errors
   */
  private processCardanoTxError(error: any): void {
    if (!this.notification) return;

    let message = error?.message || "Unknown error occurred";

    if (error?.code) {
      switch (error.code) {
        case "InvalidRequest":
          message = "Invalid transaction request";
          break;
        case "TxFailure":
          message = "Transaction failed to submit";
          break;
        case "InsufficientFunds":
          message = "Insufficient funds for transaction";
          break;
        case "NetworkError":
          message = "Network error. Please try again";
          break;
        default:
          message = error.message || "Transaction failed";
      }
    }

    if (error?.details && typeof error.details === "string") {
      try {
        const details = JSON.parse(error.details);
        if (details.message) {
          message = details.message;
        }
      } catch {
        message = error.details;
      }
    }

    if (message.includes("Invalid Cardano address")) {
      message = "Invalid recipient address";
    }

    if (
      message.toLowerCase().includes("insufficient") ||
      message.toLowerCase().includes("not enough")
    ) {
      message = "Insufficient funds to complete transaction";
    }
    // Notifications intentionally disabled to avoid blocking the tx flow
  }

  /**
   * Wait for keyAgent to be ready with exponential backoff
   */
  private async waitForKeyAgentReady(): Promise<void> {
    if (!this.keyRing) {
      throw new Error("CardanoKeyRing not initialized");
    }
    
    const config = {
      maxAttempts: 100,        // 1 second maximum
      initialDelay: 5,         // Start with 5ms
      maxDelay: 50,            // Maximum 50ms between attempts
      backoffMultiplier: 1.2   // Increase delay by 20%
    };
    
    let attempts = 0;
    let delay = config.initialDelay;
    
    while (!this.keyRing.isKeyAgentReady() && attempts < config.maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
    
    if (!this.keyRing.isKeyAgentReady()) {
      throw new Error(`CardanoKeyRing keyAgent failed to initialize after ${attempts} attempts`);
    }
  }
}