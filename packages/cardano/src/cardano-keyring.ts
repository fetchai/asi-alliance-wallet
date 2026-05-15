import { CardanoWalletManager } from "./wallet-manager";
// eslint-disable-next-line import/no-extraneous-dependencies
import { makeObservable, observable } from "mobx";
import { KeyCurve } from "@keplr-wallet/crypto";
import {
  getCardanoNetworkFromChainId,
  getCardanoChainIdFromNetwork,
} from "./utils/network";
import { logApiKeyStatus } from "./adapters/env-adapter";
import type { CardanoNetwork } from "./utils/network";

// Definitions of constants and interfaces specific to Cardano
export const CARDANO_PURPOSE = 1852;
export const CARDANO_COIN_TYPE = 1815;

// Local types to avoid circular dependency with background package
export interface KeyStore {
  version: "1.2";
  type: "mnemonic" | "privateKey" | "ledger" | "keystone";
  key?: string;
  meta: Record<string, string>;
  bip44HDPath?: BIP44HDPath;
  curve: SupportedCurve;
  coinTypeForChain?: CoinTypeForChain;
  crypto: any;
}

export interface Key {
  algo: string;
  pubKey: Uint8Array;
  address: Uint8Array;
  isKeystone: boolean;
  isNanoLedger: boolean;
}

export type CoinTypeForChain = {
  [identifier: string]: number | undefined;
};

export type BIP44HDPath = {
  account: number;
  change: number;
  addressIndex: number;
};

// Re-export KeyCurve for compatibility
export type SupportedCurve = KeyCurve;

export class CardanoKeyRing {
  @observable
  private keyAgent: any | undefined;
  @observable
  private walletManager: CardanoWalletManager | undefined;
  private mnemonicWords: string[] | undefined;
  private accountIndex = 0;
  private passphrase: Uint8Array = new Uint8Array();
  private currentNetwork: CardanoNetwork | undefined;

  private resolveNetworkOrThrow(chainId?: string): CardanoNetwork {
    if (!chainId) {
      throw new Error("network_context_missing");
    }
    return getCardanoNetworkFromChainId(chainId);
  }

  constructor() {
    makeObservable(this);
    this.keyAgent = undefined;
    this.walletManager = undefined;
  }

  public async getMetaFromMnemonic(
    mnemonic: string,
    _password: string,
    chainId?: string
  ): Promise<Record<string, string>> {
    const mnemonicWords = mnemonic.trim().split(/\s+/);
    if (mnemonicWords.length !== 24) {
      return {};
    }

    const { SodiumBip32Ed25519 } = await import("@cardano-sdk/crypto");
    const { InMemoryKeyAgent } = await import("@cardano-sdk/key-management");

    const network = this.resolveNetworkOrThrow(chainId);
    const cardanoChainId = await getCardanoChainIdFromNetwork(network);

    const bip32Ed25519 = await SodiumBip32Ed25519.create();

    await InMemoryKeyAgent.fromBip39MnemonicWords(
      {
        mnemonicWords,
        accountIndex: 0,
        purpose: CARDANO_PURPOSE,
        chainId: cardanoChainId,
        getPassphrase: async () => new Uint8Array(),
      },
      { bip32Ed25519, logger: console }
    );

    return {
      cardano: "true",
      coinType: CARDANO_COIN_TYPE.toString(),
    };
  }

  public async restore(
    keyStore: KeyStore,
    password: string,
    decryptFn?: (keyStore: KeyStore, password: string) => Promise<Uint8Array>,
    chainId?: string
  ): Promise<void> {
    const accountIndex = keyStore.bip44HDPath?.account ?? 0;

    // Get mnemonic from keyStore
    let decryptedMnemonic: string;
    if (decryptFn) {
      const decrypted = await decryptFn(keyStore, password);
      decryptedMnemonic = Buffer.from(decrypted).toString();
    } else {
      if (!keyStore.key) {
        throw new Error(
          "keyStore.key is undefined for Cardano restore and no decryptFn provided"
        );
      }
      decryptedMnemonic = keyStore.key;
    }

    const mnemonicWords = decryptedMnemonic.trim().split(/\s+/);

    if (mnemonicWords.length !== 24) {
      throw new Error("Cardano requires 24-word mnemonic");
    }

    const network = this.resolveNetworkOrThrow(chainId);
    this.mnemonicWords = mnemonicWords;
    this.accountIndex = accountIndex;
    // Keep Cardano derivation independent from extension unlock password.
    this.passphrase = new Uint8Array();
    this.currentNetwork = network;

    await this.rebuildAgentsForNetwork(network);

    logApiKeyStatus(network);
  }

  public async getKey(chainId?: string): Promise<Key> {
    if (!this.keyAgent) {
      throw new Error(
        "Cardano key agent not initialized. Please unlock wallet first."
      );
    }

    if (chainId) {
      await this.updateNetworkIfNeeded(chainId);
    }

    try {
      const addrObj = await this.keyAgent.deriveAddress(
        { index: 0, type: 0 },
        0
      );

      return {
        // Cardano account/address is available, but shared crypto pubKey bytes are not guaranteed here.
        // Keep this separate from generic ed25519 key semantics.
        algo: "cardano_address_only",
        pubKey: new Uint8Array(),
        address: Buffer.from(addrObj.address, "utf8"),
        isNanoLedger: false,
        isKeystone: false,
      };
    } catch (error) {
      console.error("Failed to derive Cardano address:", error);
      throw new Error("Failed to generate Cardano address");
    }
  }

  private async updateNetworkIfNeeded(chainId: string): Promise<void> {
    const network = getCardanoNetworkFromChainId(chainId);
    if (this.currentNetwork === network) {
      return;
    }
    await this.rebuildAgentsForNetwork(network);
  }

  private async rebuildAgentsForNetwork(
    network: CardanoNetwork
  ): Promise<void> {
    if (!this.mnemonicWords) {
      throw new Error("Cardano mnemonic is not available for agent rebuild");
    }

    const { SodiumBip32Ed25519 } = await import("@cardano-sdk/crypto");
    const { InMemoryKeyAgent } = await import("@cardano-sdk/key-management");
    const cardanoChainId = await getCardanoChainIdFromNetwork(network);
    const bip32Ed25519 = await SodiumBip32Ed25519.create();

    this.keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords(
      {
        mnemonicWords: this.mnemonicWords,
        accountIndex: this.accountIndex,
        purpose: CARDANO_PURPOSE,
        chainId: cardanoChainId,
        getPassphrase: async () => this.passphrase,
      },
      { bip32Ed25519, logger: console }
    );

    if (this.walletManager?.dispose) {
      this.walletManager.dispose();
    }

    try {
      this.walletManager = await CardanoWalletManager.create({
        mnemonicWords: this.mnemonicWords,
        network,
        accountIndex: this.accountIndex,
        passphrase: this.passphrase,
      });
    } catch (error) {
      console.error(
        "[CardanoKeyRing] Failed to create CardanoWalletManager:",
        error
      );
      this.walletManager = undefined;
    }

    this.currentNetwork = network;
  }

  public async getAddresses(): Promise<string[]> {
    if (!this.walletManager) {
      throw new Error("provider_error: addresses_unavailable");
    }
    try {
      const addresses = await this.walletManager.getAddresses();
      return (addresses as any[]).map((a: any) => a.address);
    } catch (error) {
      throw new Error(
        `provider_error: addresses_unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Gets CardanoWalletManager for transaction operations
   */
  getWalletManager(): CardanoWalletManager | undefined {
    return this.walletManager;
  }

  /**
   * Checks readiness for transaction operations
   * Requires both keyAgent and walletManager with wallet initialized
   */
  isTransactionReady(): boolean {
    const keyAgentExists = !!this.keyAgent;
    const walletManagerExists = !!this.walletManager;
    const hasWallet = this.walletManager?.hasWallet() ?? false;

    return keyAgentExists && walletManagerExists && hasWallet;
  }

  /**
   * Checks if keyAgent is initialized
   */
  isKeyAgentReady(): boolean {
    return !!this.keyAgent;
  }

  /**
   * Send ADA (or ADA + native assets) transaction.
   * When assets are provided, sends a multi-asset transaction.
   * assets: map of assetId (policyId+assetName hex) to base-unit amount string.
   */
  async sendAda(params: {
    to: string;
    amount: string; // in lovelaces
    memo?: string;
    assets?: Map<string, string>;
  }): Promise<string> {
    if (!this.walletManager) {
      throw new Error(
        "CardanoWalletManager not initialized - transaction features unavailable without API key"
      );
    }

    try {
      return await this.walletManager.sendAda(params);
    } catch (error) {
      throw new Error(
        `Transaction failed: ${error.message || "Unknown error"}`
      );
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<any> {
    if (!this.walletManager) {
      throw new Error("provider_error: wallet_manager_unavailable");
    }

    return await this.walletManager.getBalance();
  }
}
