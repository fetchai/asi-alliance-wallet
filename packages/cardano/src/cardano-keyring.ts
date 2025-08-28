import { CardanoWalletManager } from './wallet-manager';
import { makeObservable, observable } from "mobx";
import { getCardanoNetworkFromChainId, getCardanoChainIdFromNetwork } from './utils/network';

// Definitions of constants and interfaces specific to Cardano
export const CARDANO_PURPOSE = 1852;
export const CARDANO_COIN_TYPE = 1815;

// Local minimal copies of types to avoid circular dependency on background package
// These are structurally compatible with background's types and used only for typing within this package
export interface KeyStore {
  version?: string;
  type?: string;
  key?: string;
  meta: Record<string, string>;
  curve?: any; // Add curve field for compatibility with background
  crypto?: any; // Add crypto field for compatibility with background
  // Other fields are intentionally omitted as they are not used directly here
}

export interface Key {
  algo: string;
  pubKey: Uint8Array;
  address: Uint8Array;
  isKeystone: boolean;
  isNanoLedger: boolean;
}

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
    const serialized = keyStore.meta["cardanoSerializedAgent"];
    if (!serialized) {
      throw new Error("Cardano agent not found in keyStore meta");
    }

    const { SodiumBip32Ed25519 } = await import('@cardano-sdk/crypto');
    const { InMemoryKeyAgent } = await import('@cardano-sdk/key-management');

    const bip32Ed25519 = await SodiumBip32Ed25519.create();
    this.keyAgent = new InMemoryKeyAgent(
      {
        ...JSON.parse(serialized),
        getPassphrase: async () => Buffer.from(password, 'utf8'),
      },
      { bip32Ed25519, logger: console }
    );
    
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
    
    const network = chainId ? getCardanoNetworkFromChainId(chainId) : 'mainnet';
    
    const blockfrostApiKey = process.env['BLOCKFROST_API_KEY'];
    if (blockfrostApiKey && blockfrostApiKey !== "<API_KEY>") {
      try {
        this.walletManager = await CardanoWalletManager.create({
          mnemonicWords: decryptedMnemonic.split(" "),
          network,
          blockfrostApiKey
        });
      } catch (error) {
        console.warn("Failed to create CardanoWalletManager:", error);

      }
    } else {
      console.warn("BLOCKFROST_API_KEY not set - Cardano balance and advanced features will be unavailable");
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
    const network = getCardanoNetworkFromChainId(chainId);
    const targetChainId = await getCardanoChainIdFromNetwork(network);
    
    if (this.keyAgent && this.keyAgent.chainId && 
        this.keyAgent.chainId.networkMagic === targetChainId.networkMagic) {
      return;
    }
    
    console.log(`Updating Cardano keyAgent from network ${this.keyAgent?.chainId?.networkMagic} to ${targetChainId.networkMagic}`);
    

    const serializedData = this.keyAgent.serializableData;
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
    
    if (this.walletManager) {
      this.walletManager = undefined;
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
   */
  async sendAda(params: {
    to: string;
    amount: string; // in lovelaces
    memo?: string;
  }): Promise<string> {
    if (!this.walletManager) {
      throw new Error("CardanoWalletManager not initialized");
    }
    
    return await this.walletManager.sendAda(params);
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<any> {
    if (!this.walletManager) {
      throw new Error("CardanoWalletManager not initialized");
    }
    
    return await this.walletManager.getBalance();
  }
} 