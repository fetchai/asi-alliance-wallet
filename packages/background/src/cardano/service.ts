import { CardanoKeyRing, KeyStore, Key } from "@keplr-wallet/cardano";
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
    // Only create new CardanoKeyRing if not already initialized
    if (!this.keyRing) {
      this.keyRing = new CardanoKeyRing();
    }

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
}