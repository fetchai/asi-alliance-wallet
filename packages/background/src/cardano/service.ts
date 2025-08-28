import { KeyStore, Key } from "../keyring/types";
import { CardanoKeyRing, KeyStore as CardanoKeyStore } from "@keplr-wallet/cardano";
import { Crypto } from "../keyring/crypto";
import { Notification } from "../tx/types";

/**
 * Thin wrapper around @keplr-wallet/cardano that makes Cardano logic look like
 * any other chain for the background level. This keeps KeyRing chain-independent,
 * while CardanoService encapsulates the specific SDK.
 */
export class CardanoService {
  private keyRing?: CardanoKeyRing;
  private notification?: Notification;
  private balancePollingInterval?: NodeJS.Timeout;
  private readonly balancePollingIntervalMs = process.env['CARDANO_BALANCE_POLLING_INTERVAL_SEC'] 
    ? Number(process.env['CARDANO_BALANCE_POLLING_INTERVAL_SEC']) * 1000
    : 30 * 1000; // lace-style: 30 seconds default
  private cachedBalance: any = null;
  private lastBalanceCheck = 0;

  constructor(notification?: Notification) {
    this.notification = notification;
  }

  /**
   * Restore internal CardanoKeyRing from saved keystore of Background wallet.
   */
  async restoreFromKeyStore(store: KeyStore, password: string, crypto?: any, chainId?: string): Promise<void> {
    this.clearCaches();
    this.keyRing = new CardanoKeyRing();
    
    try {
      // Create decryption function with proper type casting
      const decryptFn = crypto ? 
        (keyStore: CardanoKeyStore, pwd: string) => Crypto.decrypt(crypto, keyStore as any, pwd) : 
        undefined;
      
      console.log("Restoring CardanoKeyRing from keyStore:", store);
      // Cast store to CardanoKeyStore for compatibility
      await this.keyRing.restore(store as CardanoKeyStore, password, decryptFn, chainId);
      console.log("CardanoKeyRing restored successfully");
      
      // lace-style: start balance polling after successful restoration
      this.startBalancePolling();
    } catch (error) {
      console.error("Failed to restore CardanoKeyRing:", error);
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
    chainId?: string,
  ): Promise<Record<string, string>> {
    const helper = new CardanoKeyRing();
    return helper.getMetaFromMnemonic(mnemonic, password, chainId);
  }

  /** Get Cardano public key/address for UI and signing */
  async getKey(chainId?: string): Promise<Key> {
    if (!this.keyRing) {
      throw new Error("CardanoService not initialised. Call restoreFromKeyStore() first.");
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
      throw new Error("CardanoService not initialised. Call restoreFromKeyStore() first.");
    }
    
    if (!this.keyRing.isTransactionReady()) {
      throw new Error("CardanoService not ready for transactions. Wallet manager not initialized.");
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
      throw new Error("CardanoService not initialised. Call restoreFromKeyStore() first.");
    }

    if (!this.keyRing.isTransactionReady()) {
      // lace-style: return cached balance if available, graceful fallback
      if (this.cachedBalance) {
        console.warn("Wallet manager not ready, returning cached balance");
        return this.cachedBalance;
      }
      throw new Error("CardanoService not ready for transactions. Wallet manager not initialized.");
    }

    try {
      const balance = await this.keyRing.getBalance();
      // lace-style: cache successful balance fetch
      this.cachedBalance = balance;
      this.lastBalanceCheck = Date.now();
      return balance;
    } catch (error) {
      console.warn("Failed to fetch fresh balance:", error);
      // lace-style: return cached balance if available
      if (this.cachedBalance) {
        return this.cachedBalance;
      }
      throw error;
    }
  }

  /**
   * Checks service readiness for transaction operations
   * Requires both keyRing and walletManager to be initialized
   */
  isReady(): boolean {
    return !!(this.keyRing && this.keyRing.isTransactionReady());
  }

  /**
   * lace-style: Get cached balance without making new request
   */
  getCachedBalance(): any | null {
    return this.cachedBalance;
  }

  /**
   * lace-style: Get balance age in milliseconds
   */
  getBalanceAge(): number {
    return this.lastBalanceCheck ? Date.now() - this.lastBalanceCheck : Infinity;
  }

  /**
   * Gets wallet manager for advanced operations
   * WARNING: Provides direct access to CardanoWalletManager
   */
  getWalletManager() {
    if (!this.keyRing) {
      throw new Error("CardanoService not initialised. Call restoreFromKeyStore() first.");
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
        case 'InvalidRequest':
          message = "Invalid transaction request";
          break;
        case 'TxFailure':
          message = "Transaction failed to submit";
          break;
        case 'InsufficientFunds':
          message = "Insufficient funds for transaction";
          break;
        case 'NetworkError':
          message = "Network error. Please try again";
          break;
        default:
          message = error.message || "Transaction failed";
      }
    }

    // Handle errors from Cardano SDK
    if (error?.details && typeof error.details === 'string') {
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
    if (message.includes('Invalid Cardano address')) {
      message = "Invalid recipient address";
    }

    // Handle insufficient funds errors
    if (message.toLowerCase().includes('insufficient') || 
        message.toLowerCase().includes('not enough')) {
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
   * Clear internal state and caches
   */
  private clearCaches(): void {
    // lace-style: clear cached balance on keyring reset
    this.cachedBalance = null;
    this.lastBalanceCheck = 0;
    this.stopBalancePolling();
    // Clear keyring (original logic)
    this.keyRing = undefined;
  }

  /**
   * lace-style: Start automatic balance polling
   */
  private startBalancePolling(): void {
    if (this.balancePollingInterval) {
      this.stopBalancePolling();
    }

    console.log(`Starting Cardano balance polling every ${this.balancePollingIntervalMs / 1000}s`);
    
    this.balancePollingInterval = setInterval(async () => {
      try {
        if (this.keyRing && this.keyRing.isTransactionReady()) {
          await this.pollBalance();
        }
      } catch (error) {
        console.warn("Balance polling error:", error);
      }
    }, this.balancePollingIntervalMs);

    // lace-style: immediate first poll
    this.pollBalance().catch(error => 
      console.warn("Initial balance poll failed:", error)
    );
  }

  /**
   * lace-style: Stop automatic balance polling
   */
  private stopBalancePolling(): void {
    if (this.balancePollingInterval) {
      clearInterval(this.balancePollingInterval);
      this.balancePollingInterval = undefined;
      console.log("Stopped Cardano balance polling");
    }
  }

  /**
   * lace-style: Internal method for polling balance
   */
  private async pollBalance(): Promise<void> {
    try {
      if (!this.keyRing || !this.keyRing.isTransactionReady()) {
        return;
      }

      const balance = await this.keyRing.getBalance();
      
      // Check if balance has changed (simple comparison)
      const hasChanged = !this.cachedBalance || 
        JSON.stringify(this.cachedBalance) !== JSON.stringify(balance);
      
      if (hasChanged) {
        console.log("Cardano balance updated:", balance);
        this.cachedBalance = balance;
        this.lastBalanceCheck = Date.now();
        
        // lace-style: could emit events here for UI updates
        // this.notifyBalanceChange(balance);
      }
    } catch (error) {
      console.warn("Failed to poll balance:", error);
    }
  }

  /**
   * lace-style: Force manual balance refresh
   */
  async refreshBalance(): Promise<any> {
    await this.pollBalance();
    return this.cachedBalance;
  }

  /**
   * lace-style: Enable/disable balance polling
   */
  setBalancePolling(enabled: boolean): void {
    if (enabled) {
      this.startBalancePolling();
    } else {
      this.stopBalancePolling();
    }
  }

  /**
   * lace-style: Cleanup resources
   */
  destroy(): void {
    this.stopBalancePolling();
    this.clearCaches();
  }
} 