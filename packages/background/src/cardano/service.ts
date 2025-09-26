import { CardanoKeyRing, KeyStore, Key } from "@keplr-wallet/cardano";
import { Crypto } from "../keyring/crypto";
import { Notification } from "../tx/types";
import { BalanceAdapter } from "@keplr-wallet/cardano";

/**
 * Thin wrapper around @keplr-wallet/cardano that makes Cardano logic look like
 * any other chain for the background level. This keeps KeyRing chain-independent,
 * while CardanoService encapsulates the specific SDK.
 */
export class CardanoService {
  private keyRing?: CardanoKeyRing;
  private notification?: Notification;
  private balanceAdapter?: BalanceAdapter;
  private readonly balancePollingIntervalMs = process.env[
    "CARDANO_BALANCE_POLLING_INTERVAL_SEC"
  ]
    ? Number(process.env["CARDANO_BALANCE_POLLING_INTERVAL_SEC"]) * 1000
    : 30 * 1000; // lace-style: 30 seconds default

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
    const cachedBalance = this.clearCaches();
    
    // Only create new CardanoKeyRing if not already initialized
    if (!this.keyRing) {
      this.keyRing = new CardanoKeyRing();
    }

    try {
      const decryptFn = crypto
        ? (keyStore: KeyStore, pwd: string) =>
            Crypto.decrypt(crypto, keyStore as any, pwd)
        : undefined;
      
      await this.keyRing.restore(
        store as KeyStore,
        password,
        decryptFn,
        chainId
      );

      // Wait for keyAgent to be fully initialized with exponential backoff
      await this.waitForKeyAgentReady();

      this.initializeBalanceAdapter(cachedBalance);
    } catch (error) {
      throw error;
    }
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
   * Uses high-level sendAda function from wallet/lib with Keplr-style notifications
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

    // Notification about transaction start (like in BackgroundTxService)
    if (this.notification) {
      this.notification.create({
        iconRelativeUrl: "assets/logo-256.png",
        title: "Cardano transaction is pending...",
        message: "Please wait while we process your ADA transaction",
      });
    }

    try {
      const txId = await this.keyRing.sendAda(params);

      // Success notification (pattern from Lace and Keplr)
      if (this.notification) {
        this.notification.create({
          iconRelativeUrl: "assets/logo-256.png",
          title: "Cardano transaction submitted",
          message: `Transaction successful! TxID: ${txId.slice(0, 16)}...`,
        });
      }

      return txId;
    } catch (error) {
      // Cardano error handling
      this.processCardanoTxError(error);
      throw error;
    }
  }

  /**
   * Gets Cardano wallet balance
   * lace-style: with caching and error handling
   */
  async getBalance(): Promise<any> {
    if (!this.keyRing) {
      throw new Error(
        "CardanoService not initialised. Call restoreFromKeyStore() first."
      );
    }

    if (!this.keyRing.isTransactionReady()) {
      if (this.balanceAdapter?.currentBalance) {
        return this.balanceAdapter.currentBalance;
      }
      return {
        utxo: {
          available: { coins: BigInt(0) },
          total: { coins: BigInt(0) },
          unspendable: { coins: BigInt(0) }
        },
        rewards: BigInt(0),
        deposits: BigInt(0),
        assetInfo: new Map()
      };
    }

    try {
      const balance = await this.keyRing.getBalance();
      if (this.balanceAdapter) {
        (this.balanceAdapter as any).balanceSubject.next({ ...balance, lastUpdated: Date.now() });
      }
      return balance;
    } catch (error) {
      console.warn("Failed to fetch fresh balance:", error);
      if (this.balanceAdapter?.currentBalance) {
        return this.balanceAdapter.currentBalance;
      }
      return {
        utxo: {
          available: { coins: BigInt(0) },
          total: { coins: BigInt(0) },
          unspendable: { coins: BigInt(0) }
        },
        rewards: BigInt(0),
        deposits: BigInt(0),
        assetInfo: new Map()
      };
    }
  }

  /**
   * Get balance as reactive observable stream
   */
  get balance$() {
    if (!this.balanceAdapter) {
      throw new Error("Balance adapter not initialized. Call restoreFromKeyStore() first.");
    }
    return this.balanceAdapter.balance$;
  }

  /**
   * Get current balance value
   */
  get currentBalance() {
    return this.balanceAdapter?.currentBalance || null;
  }

  /**
   * Checks service readiness for transaction operations
   * Requires both keyRing and walletManager to be initialized
   */
  isReady(): boolean {
    return !!(this.keyRing && this.keyRing.isTransactionReady());
  }

  /**
   * Get cached balance without making new request
   */
  getCachedBalance(): any | null {
    return this.balanceAdapter?.currentBalance || null;
  }

  /**
   * Get balance age in milliseconds
   */
  getBalanceAge(): number {
    return this.balanceAdapter?.balanceAge || Infinity;
  }

  /**
   * Initialize reactive balance adapter
   * @param initialBalance - Optional initial balance to prevent UI flickering
   */
  private initializeBalanceAdapter(initialBalance?: any): void {
    if (this.balanceAdapter) {
      // Preserve current balance before destruction
      const currentBalance = this.balanceAdapter.currentBalance;
      this.balanceAdapter.destroy();
      
      // Use current balance as initial if no initialBalance provided
      const balanceToUse = initialBalance || currentBalance;
      
      this.balanceAdapter = new BalanceAdapter(
        () => this.getBalance(),
        this.balancePollingIntervalMs,
        balanceToUse
      );
    } else {
      this.balanceAdapter = new BalanceAdapter(
        () => this.getBalance(),
        this.balancePollingIntervalMs,
        initialBalance
      );
    }

    // Start reactive polling
    this.balanceAdapter.startPolling();
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
   * Handles Cardano transaction errors
   */
  private processCardanoTxError(error: any): void {
    if (!this.notification) return;

    console.error("Cardano transaction error:", error);
    let message = error?.message || "Unknown error occurred";

    // Handle specific Cardano errors
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

    // Handle errors from Cardano SDK
    if (error?.details && typeof error.details === "string") {
      try {
        const details = JSON.parse(error.details);
        if (details.message) {
          message = details.message;
        }
      } catch {
        // If not JSON, use as is
        message = error.details;
      }
    }

    // Handle address validation errors
    if (message.includes("Invalid Cardano address")) {
      message = "Invalid recipient address";
    }

    // Handle insufficient funds errors
    if (
      message.toLowerCase().includes("insufficient") ||
      message.toLowerCase().includes("not enough")
    ) {
      message = "Insufficient funds to complete transaction";
    }

    // Create error notification (pattern from BackgroundTxService)
    this.notification.create({
      iconRelativeUrl: "assets/logo-256.png",
      title: "Cardano transaction failed",
      message,
    });
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

  /**
   * Clear internal state and caches
   * Preserves current balance to prevent UI flickering
   */
  private clearCaches(): any {
    let cachedBalance: any = null;
    
    if (this.balanceAdapter) {
      // Preserve current balance before destruction
      cachedBalance = this.balanceAdapter.currentBalance;
      this.balanceAdapter.destroy();
      this.balanceAdapter = undefined;
    }
    
    // Don't clear keyRing to prevent race conditions
    return cachedBalance;
  }

  /**
   * Force manual balance refresh
   */
  async refreshBalance(): Promise<any> {
    if (!this.balanceAdapter) {
      throw new Error("Balance adapter not initialized");
    }
    return await this.balanceAdapter.forceRefresh();
  }

  /**
   * Enable/disable balance polling
   */
  setBalancePolling(enabled: boolean): void {
    if (!this.balanceAdapter) return;
    
    if (enabled) {
      this.balanceAdapter.startPolling();
    } else {
      this.balanceAdapter.stopPolling();
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.balanceAdapter) {
      this.balanceAdapter.destroy();
    }
    this.clearCaches();
  }
}
