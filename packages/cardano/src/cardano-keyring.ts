import { CardanoWalletManager } from './wallet-manager';
import { makeObservable, observable } from "mobx";
import { KeyCurve } from "@keplr-wallet/crypto";
import { getCardanoNetworkFromChainId, getCardanoChainIdFromNetwork } from './utils/network';
import { getNetworkConfig, logApiKeyStatus } from './adapters/env-adapter';

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

  constructor() {
    makeObservable(this);
    this.keyAgent = undefined;
    this.walletManager = undefined;
  }

  public async getMetaFromMnemonic(
    mnemonic: string,
    password: string,
    chainId?: string
  ): Promise<Record<string, string>> {
    const mnemonicWords = mnemonic.trim().split(/\s+/);
    if (mnemonicWords.length !== 24) {
      // Lace/Cardano SDK works only with 24 words
      return {};
    }

    const { SodiumBip32Ed25519 } = await import('@cardano-sdk/crypto');
    const { InMemoryKeyAgent } = await import('@cardano-sdk/key-management');
    
    const network = chainId ? getCardanoNetworkFromChainId(chainId) : 'mainnet';
    const cardanoChainId = await getCardanoChainIdFromNetwork(network);

    const bip32Ed25519 = await SodiumBip32Ed25519.create();

    const keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords(
      {
        mnemonicWords,
        accountIndex: 0,
        purpose: CARDANO_PURPOSE,
        chainId: cardanoChainId,
        getPassphrase: async () => Buffer.from(password, "utf8"),
      },
      { bip32Ed25519, logger: console }
    );

    const serialized = keyAgent.serializableData;

    return {
      cardano: "true",
      cardanoSerializedAgent: JSON.stringify(serialized),
      coinType: CARDANO_COIN_TYPE.toString(),
    };
  }

  public async restore(
    keyStore: KeyStore, 
    password: string, 
    decryptFn?: (keyStore: KeyStore, password: string) => Promise<Uint8Array>,
    chainId?: string
  ): Promise<void> {
    // Recreate keyAgent with correct accountIndex from keyStore
    const accountIndex = keyStore.bip44HDPath?.account ?? 0;
    
    // Get mnemonic from keyStore
    let decryptedMnemonic: string;
    if (decryptFn) {
      const decrypted = await decryptFn(keyStore, password);
      decryptedMnemonic = Buffer.from(decrypted).toString();
    } else {
      if (!keyStore.key) {
        throw new Error("keyStore.key is undefined for Cardano restore and no decryptFn provided");
      }
      decryptedMnemonic = keyStore.key;
    }
    
    const mnemonicWords = decryptedMnemonic.trim().split(/\s+/);
    
    if (mnemonicWords.length !== 24) {
      throw new Error("Cardano requires 24-word mnemonic");
    }

    const { SodiumBip32Ed25519 } = await import('@cardano-sdk/crypto');
    const { InMemoryKeyAgent } = await import('@cardano-sdk/key-management');
    
    const network = chainId ? getCardanoNetworkFromChainId(chainId) : 'mainnet';
    const cardanoChainId = await getCardanoChainIdFromNetwork(network);

    const bip32Ed25519 = await SodiumBip32Ed25519.create();
    this.keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords(
      {
        mnemonicWords,
        accountIndex,
        purpose: CARDANO_PURPOSE,
        chainId: cardanoChainId,
        getPassphrase: async () => Buffer.from(password, 'utf8'),
      },
      { bip32Ed25519, logger: console }
    );
    
    // lace-style: use env adapter for better API key management
    logApiKeyStatus(network);
    const networkConfig = getNetworkConfig(network);
    
    if (networkConfig?.projectId) {
      try {
        this.walletManager = await CardanoWalletManager.create({
          mnemonicWords,
          network,
          accountIndex
        });
        console.log("CardanoWalletManager created successfully");
      } catch (error) {
        console.warn("Failed to create CardanoWalletManager:", error);
        // lace-style: graceful fallback - continue without wallet manager
        // This allows basic key operations to work even without API access
      }
    } else {
      console.warn("Blockfrost API key not found - Cardano balance and advanced features will be unavailable");
      // lace-style: continue with limited functionality
    }
  }

  public async getKey(chainId?: string): Promise<Key> {
    if (!this.keyAgent) {
      console.error("Cardano key agent not initialized");
      throw new Error("Cardano key agent not initialized. Please unlock wallet first.");
    }
    

    if (chainId) {
      await this.updateNetworkIfNeeded(chainId);
    }
    
    try {
      const addrObj = await this.keyAgent.deriveAddress({ index: 0, type: 0 }, 0);
      return {
        algo: "ed25519",
        pubKey: Buffer.from(addrObj.rewardAccount, "utf8"),
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
    try {
      const network = getCardanoNetworkFromChainId(chainId);
      const targetChainId = await getCardanoChainIdFromNetwork(network);
      
      // lace-style: avoid unnecessary updates
      if (this.keyAgent && this.keyAgent.chainId && 
          this.keyAgent.chainId.networkMagic === targetChainId.networkMagic) {
        return;
      }
      
      console.log(`Updating Cardano keyAgent from network ${this.keyAgent?.chainId?.networkMagic} to ${targetChainId.networkMagic}`);
      
      // lace-style: safer network switching with error handling
      const serializedData = this.keyAgent?.serializableData;
      if (!serializedData) {
        console.warn("No serialized data available for network switch");
        return;
      }

      const { SodiumBip32Ed25519 } = await import('@cardano-sdk/crypto');
      const { InMemoryKeyAgent } = await import('@cardano-sdk/key-management');
      
      const bip32Ed25519 = await SodiumBip32Ed25519.create();
      this.keyAgent = new InMemoryKeyAgent(
        {
          ...serializedData,
          chainId: targetChainId,
          getPassphrase: async () => Buffer.from('', 'utf8'),
        },
        { bip32Ed25519, logger: console }
      );
      
      // lace-style: properly dispose wallet manager before clearing
      if (this.walletManager) {
        if (this.walletManager.dispose) {
          this.walletManager.dispose();
        }
        this.walletManager = undefined;
      }
    } catch (error) {
      console.error("Failed to update network:", error);
      // lace-style: graceful fallback - don't break the keyring
    }
  }



  public async getAddresses(): Promise<string[]> {
    if (!this.walletManager) {
      if (!this.keyAgent) {
        throw new Error("Cardano key agent not initialized");
      }
      const addrObj = await this.keyAgent.deriveAddress({ index: 0, type: 0 }, 0);
      return [addrObj.address];
    }
    try {
      const addresses = await this.walletManager.getAddresses();
      return (addresses as any[]).map((a: any) => a.address);
    } catch (error) {
      console.warn("Failed to get Cardano addresses from wallet manager:", error);
      const addrObj = await this.keyAgent!.deriveAddress({ index: 0, type: 0 }, 0);
      return [addrObj.address];
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
   */
  isTransactionReady(): boolean {
    return !!(this.keyAgent && this.walletManager);
  }

  /**
   * Send ADA transaction
   * lace-style: graceful error handling
   */
  async sendAda(params: {
    to: string;
    amount: string; // in lovelaces
    memo?: string;
  }): Promise<string> {
    if (!this.walletManager) {
      throw new Error("CardanoWalletManager not initialized - transaction features unavailable without API key");
    }
    
    try {
      return await this.walletManager.sendAda(params);
    } catch (error) {
      console.error("Failed to send ADA transaction:", error);
      // lace-style: re-throw with more context
      throw new Error(`Transaction failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get wallet balance
   * lace-style: graceful fallback when wallet manager is not available
   */
  async getBalance(): Promise<any> {
    if (!this.walletManager) {
      console.warn("CardanoWalletManager not initialized - returning empty balance");
      // lace-style: return empty balance with proper structure
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
      return await this.walletManager.getBalance();
    } catch (error) {
      console.warn("Failed to fetch balance from wallet manager:", error);
      // lace-style: graceful fallback - return empty balance with proper structure
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
} 