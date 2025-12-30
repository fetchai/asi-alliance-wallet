import { CardanoKeyRing, KeyStore, Key, CardanoWalletManager } from "@keplr-wallet/cardano";
import { Crypto } from "../keyring/crypto";
import { Notification } from "../tx/types";
import type { CardanoTxHistoryItem, CardanoTxHistoryResponse } from "./messages";
import type { CardanoSendAdaTxDraft } from "./messages";
import { createObservableTransactionsByAddressesProvider, createTxHistoryLoader, getTxInputsValueAndAddress } from "@keplr-wallet/cardano";
import { firstValueFrom, ReplaySubject, Subscription } from "rxjs";
import { skip, take, timeout } from "rxjs/operators";

/**
 * Thin wrapper around @keplr-wallet/cardano that makes Cardano logic look like
 * any other chain for the background level. This keeps KeyRing chain-independent,
 * while CardanoService encapsulates the specific SDK.
 */
export class CardanoService {
  private keyRing?: CardanoKeyRing;
  private notification?: Notification;
  private txHistoryControllers = new Map<
    string,
    {
      pageSize: number;
      walletManagerRef: unknown;
      hasRealEmission: boolean;
      last: { items: CardanoTxHistoryItem[]; mightHaveMore: boolean };
      loader: ReturnType<typeof createTxHistoryLoader>;
      latest$: ReplaySubject<{ items: CardanoTxHistoryItem[]; mightHaveMore: boolean }>;
      sub: Subscription;
      errorSub: Subscription;
    }
  >();

  constructor(notification?: Notification) {
    this.notification = notification;
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
          Crypto.decrypt(crypto, keyStore as any, pwd)
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
   * Sends ADA transaction
   */
  async sendAda(params: {
    to: string;
    amount: string; // in lovelaces (1 ADA = 1,000,000 lovelaces)
    memo?: string;
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
      const txId = await this.keyRing.sendAda(params);
      this.registerLocallyPendingSentTx(params, txId);
      return txId;
    } catch (error: any) {
      this.processCardanoTxError(error);
      throw error;
    }
  }

  private readonly locallyPendingSentTxs: Map<
    string,
    Map<string, { createdAt: number; amount: string }>
  > = new Map();

  private registerLocallyPendingSentTx(
    params: { amount: string },
    txId: string,
    chainId?: string
  ) {
    const chainKey = chainId || "default";
    const perChain =
      this.locallyPendingSentTxs.get(chainKey) ?? new Map<string, { createdAt: number; amount: string }>();
    perChain.set(txId, { createdAt: Date.now(), amount: params.amount });
    this.locallyPendingSentTxs.set(chainKey, perChain);
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
   * Estimate transaction fee and total amount for ADA send
   * Proxies to walletManager which uses SDK's coin selection
   */
  async estimateSendAda(params: {
    to: string;
    amount: string; // in lovelaces
    memo?: string;
  }): Promise<{ fee: string; total: string }> {
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

    try {
      return await walletManager.estimateSendAda(params);
    } catch (error) {
      throw error;
    }
  }

  private readonly sendAdaTxDrafts: Map<
    string,
    {
      createdAt: number;
      chainId?: string;
      to: string;
      amount: string;
      memo?: string;
      fee: string;
      total: string;
      tx: any;
    }
  > = new Map();

  async buildSendAdaTxDraft(params: {
    to: string;
    amount: string;
    memo?: string;
    chainId?: string;
  }): Promise<CardanoSendAdaTxDraft> {
    const walletManager: CardanoWalletManager | undefined = this.getWalletManager();
    if (!walletManager) {
      throw new Error("Wallet manager not initialized");
    }

    // NOTE: this method is implemented in our @keplr-wallet/cardano wrapper. Depending on workspace
    // TS resolution, background may see older typings; keep the call robust.
    const built = await (walletManager as any).buildSendAdaTx({
      to: params.to,
      amount: params.amount,
      memo: params.memo,
    });

    const draftId = `cad_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2)}`;

    this.sendAdaTxDrafts.set(draftId, {
      createdAt: Date.now(),
      chainId: params.chainId,
      to: params.to,
      amount: params.amount,
      memo: params.memo,
      fee: built.fee,
      total: built.total,
      tx: built.tx,
    });

    return {
      draftId,
      fee: built.fee,
      total: built.total,
    };
  }

  async submitSendAdaTxDraft(params: {
    draftId: string;
    chainId?: string;
  }): Promise<string> {
    const draft = this.sendAdaTxDrafts.get(params.draftId);
    if (!draft) {
      throw new Error("Transaction draft not found. Please rebuild and try again.");
    }

    // Enforce a generous TTL. If expired, refuse to submit to avoid mismatches and stale validity interval.
    const ttlMs = 60 * 60 * 1000; // 1 hour
    if (Date.now() - draft.createdAt > ttlMs) {
      this.sendAdaTxDrafts.delete(params.draftId);
      throw new Error("Transaction draft expired. Please rebuild and try again.");
    }

    // Optional safety: ensure the draft is used on the intended chain.
    if (draft.chainId && params.chainId && draft.chainId !== params.chainId) {
      throw new Error("Transaction draft chain mismatch. Please rebuild and try again.");
    }

    try {
      const walletManager: CardanoWalletManager | undefined = this.getWalletManager();
      if (!walletManager) {
        throw new Error("Wallet manager not initialized");
      }
      const signedTx = (await draft.tx.sign()).cbor;
      const txIdAny = await walletManager.submitTx(signedTx);
      const txId = typeof txIdAny === "string" ? txIdAny : txIdAny?.toString?.() ?? String(txIdAny);

      // Lace-like behavior: show pending immediately after broadcast.
      this.registerLocallyPendingSentTx({ amount: draft.amount }, txId, params.chainId);

      this.sendAdaTxDrafts.delete(params.draftId);
      return txId;
    } catch (error: any) {
      this.sendAdaTxDrafts.delete(params.draftId);
      this.processCardanoTxError(error);
      throw error;
    }
  }

  discardSendAdaTxDraft(draftId: string): void {
    this.sendAdaTxDrafts.delete(draftId);
  }

  /**
   * Checks service readiness for transaction operations
   * Requires both keyRing and walletManager to be initialized
   */
  isReady(): boolean {
    return !!(this.keyRing && this.keyRing.isTransactionReady());
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
  async getTxHistory(params: { pageSize: number; chainId?: string }): Promise<CardanoTxHistoryResponse> {
    const key = params.chainId || "default";
    const controller = await this.ensureTxHistoryController(key, params.pageSize);
    // If controller was just created, it will have a seeded value. Prefer waiting for the first real emission
    // (from wallet history stream), but don't block forever.
    if (!controller.hasRealEmission) {
      try {
        const res = await firstValueFrom(controller.latest$.pipe(skip(1), take(1), timeout(10000)));
        return await this.withPendingTxs(res, params.chainId);
      } catch {
        const res = await firstValueFrom(controller.latest$);
        return await this.withPendingTxs(res, params.chainId);
      }
    }
    const res = await firstValueFrom(controller.latest$);
    return await this.withPendingTxs(res, params.chainId);
  }

  async loadMoreTxHistory(params: { pageSize: number; chainId?: string }): Promise<CardanoTxHistoryResponse> {
    const key = params.chainId || "default";
    const controller = await this.ensureTxHistoryController(key, params.pageSize);
    if (!controller.last.mightHaveMore) {
      return await this.withPendingTxs(controller.last, params.chainId);
    }
    // ReplaySubject emits current immediately; skip it and wait for the next update after loadMore().
    const next = firstValueFrom(controller.latest$.pipe(skip(1), take(1), timeout(10000))).catch(() => controller.last);
    controller.loader.loadMore();
    return await this.withPendingTxs(await next, params.chainId);
  }

  private async withPendingTxs(
    res: { items: CardanoTxHistoryItem[]; mightHaveMore: boolean },
    chainId?: string
  ): Promise<CardanoTxHistoryResponse> {
    const walletManager: CardanoWalletManager | undefined = this.getWalletManager();
    if (!walletManager || !walletManager.hasWallet()) {
      return res;
    }

    const wallet = walletManager.getWallet();
    const walletAddresses = await this.getWalletAddressSet(wallet);
    const pending = await this.transformPendingTxsToItems(wallet, walletAddresses);

    const locallyPending = (() => {
      const chainKey = chainId || "default";
      const perChainKey =
        this.locallyPendingSentTxs.has(chainKey) ? chainKey : chainId ? "default" : chainKey;
      const perChain = this.locallyPendingSentTxs.get(perChainKey);
      if (!perChain) return [] as CardanoTxHistoryItem[];

      const ttlMs = 10 * 60 * 1000;
      const now = Date.now();

      const items: CardanoTxHistoryItem[] = [];
      for (const [id, v] of perChain.entries()) {
        if (now - v.createdAt > ttlMs) {
          perChain.delete(id);
          continue;
        }
        items.push({
          id,
          status: "pending",
          direction: "sent",
          amount: v.amount,
        });
      }

      if (perChain.size === 0) {
        this.locallyPendingSentTxs.delete(perChainKey);
      }
      return items;
    })();

    const confirmedIds = new Set((res.items || []).map((i) => i.id));
    const pendingFiltered = pending.filter((p) => !confirmedIds.has(p.id));
    const locallyPendingFiltered = locallyPending.filter((p) => !confirmedIds.has(p.id));

    // Remove confirmed txs from local pending cache.
    if (confirmedIds.size > 0) {
      const chainKey = chainId || "default";
      const perChainKey =
        this.locallyPendingSentTxs.has(chainKey) ? chainKey : chainId ? "default" : chainKey;
      const perChain = this.locallyPendingSentTxs.get(perChainKey);
      if (perChain) {
        for (const id of confirmedIds) {
          perChain.delete(id);
        }
        if (perChain.size === 0) {
          this.locallyPendingSentTxs.delete(perChainKey);
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
      mightHaveMore: res.mightHaveMore
    };
  }

  private async getWalletAddressSet(wallet: any): Promise<Set<string>> {
    const addressObjects = (await firstValueFrom(wallet.addresses$ as any).catch(() => [])) as any[];
    return new Set((addressObjects || []).map((a: any) => String(a.address ?? a)));
  }

  private async transformPendingTxsToItems(wallet: any, walletAddresses: Set<string>): Promise<CardanoTxHistoryItem[]> {
    const inFlight = (await firstValueFrom(wallet?.transactions?.outgoing?.inFlight$ as any).catch(() => [])) as any[];
    const signed = (await firstValueFrom(wallet?.transactions?.outgoing?.signed$ as any).catch(() => [])) as any[];

    const pendingTxs = ([] as any[]).concat(inFlight || [], signed || []);
    if (!pendingTxs.length) return [];

    const getCoins = (value: any): bigint => {
      const coins = value?.coins ?? value;
      if (typeof coins === "bigint") return coins;
      if (typeof coins === "number") return BigInt(coins);
      if (typeof coins === "string") return BigInt(coins);
      return BigInt(0);
    };

    const items: CardanoTxHistoryItem[] = [];

    for (const pending of pendingTxs) {
      const tx = pending?.tx ?? pending; // some SDK shapes wrap the tx in { tx, status, ... }
      const txId = String(tx?.id ?? pending?.id ?? "");
      if (!txId) continue;

      const body = tx?.body ?? {};
      const outputs = body?.outputs ?? tx?.outputs ?? [];
      const fee = getCoins(body?.fee ?? tx?.fee);

      // Outgoing pending: sum outputs that are not ours (exclude change).
      let sentCoins = BigInt(0);
      for (const out of outputs) {
        const addr = String(out?.address ?? "");
        if (!addr) continue;
        if (!walletAddresses.has(addr)) {
          sentCoins += getCoins(out?.value);
        }
      }

      items.push({
        id: txId,
        status: "pending",
        direction: "sent",
        amount: sentCoins.toString(),
        fee: fee.toString()
      });
    }

    return items;
  }

  private async ensureTxHistoryController(key: string, pageSize: number) {
    const existing = this.txHistoryControllers.get(key);
    const walletManager: CardanoWalletManager | undefined = this.getWalletManager();
    if (!walletManager) {
      throw new Error("Wallet manager not initialized");
    }

    if (existing && existing.pageSize === pageSize && existing.walletManagerRef === walletManager) {
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

    const latest$ = new ReplaySubject<{ items: CardanoTxHistoryItem[]; mightHaveMore: boolean }>(1);
    // Seed an initial value to guarantee GetTxHistory doesn't hang indefinitely.
    // The real values will overwrite this once wallet history emits.
    latest$.next({ items: [], mightHaveMore: true });

    const controller = {
      pageSize,
      walletManagerRef: walletManager,
      hasRealEmission: false,
      last: { items: [] as CardanoTxHistoryItem[], mightHaveMore: true },
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
          chainHistoryProvider
        );
        controller.hasRealEmission = true;
        const next = { items, mightHaveMore: loaded.mightHaveMore };
        controller.last = next;
        latest$.next(next);
      } catch {
        // If transformation fails, still emit an empty list to avoid UI deadlock.
        controller.hasRealEmission = true;
        const next = { items: [], mightHaveMore: loaded.mightHaveMore };
        controller.last = next;
        latest$.next(next);
      }
    });

    const errorSub = loader.error$.subscribe(() => {
      // Intentionally no-op: UI will treat missing items as empty.
    });
    controller.sub = sub;
    controller.errorSub = errorSub;
    this.txHistoryControllers.set(key, controller);

    return controller;
  }

  private async transformHydratedTxsToItems(
    txs: any[],
    wallet: any,
    chainHistoryProvider: any
  ): Promise<CardanoTxHistoryItem[]> {
    const walletAddresses = await this.getWalletAddressSet(wallet);

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
      for (const out of outputs) {
        const addr = String(out?.address ?? "");
        if (walletAddresses.has(addr)) {
          ownedOutputsCoins += getCoins(out?.value);
        }
      }

      let ownedInputsCoins = BigInt(0);
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
            }
          } else {
            missingInputs.push(input);
          }
        }

        if (missingInputs.length > 0) {
          const resolvedInputs = await getTxInputsValueAndAddress(missingInputs, chainHistoryProvider, wallet);
          for (const input of resolvedInputs) {
            const addr = String(input?.address ?? "");
            if (walletAddresses.has(addr)) {
              ownedInputsCoins += getCoins(input?.value);
            }
          }
        }
      } catch {
        // If inputs can't be resolved, leave as 0 and fall back to unknown direction.
      }

      const fee = getFee(tx);
      const net = ownedOutputsCoins - ownedInputsCoins;

      let direction: CardanoTxHistoryItem["direction"] = "unknown";
      let amount = BigInt(0);

      if (net > 0) {
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

      items.push({
        id: txId,
        blockNo: tx?.blockHeader?.blockNo != null ? Number(tx.blockHeader.blockNo) : undefined,
        slot: tx?.blockHeader?.slot != null ? Number(tx.blockHeader.slot) : undefined,
        status: tx?.blockHeader?.blockNo != null || tx?.blockHeader?.slot != null ? "confirmed" : "pending",
        direction,
        amount: amount.toString(),
        fee: fee.toString()
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