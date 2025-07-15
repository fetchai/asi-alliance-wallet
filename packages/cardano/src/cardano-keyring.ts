import { KeyStore, Key } from "@keplr-wallet/background/src/keyring/types";
import { CardanoWalletManager } from './wallet-manager';
import { makeObservable, observable } from "mobx";

// Definitions of constants and interfaces specific to Cardano
export const CARDANO_PURPOSE = 1852;
export const CARDANO_COIN_TYPE = 1815;

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
    password: string
  ): Promise<Record<string, string>> {
    const mnemonicWords = mnemonic.trim().split(/\s+/);
    if (mnemonicWords.length !== 24) {
      // Lace/Cardano SDK works only with 24 words
      return {};
    }

    const { SodiumBip32Ed25519 } = await import('@cardano-sdk/crypto');
    const { InMemoryKeyAgent } = await import('@cardano-sdk/key-management');
    const { Cardano } = await import('@cardano-sdk/core');

    const bip32Ed25519 = await SodiumBip32Ed25519.create();

    const keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords(
      {
        mnemonicWords,
        accountIndex: 0,
        purpose: CARDANO_PURPOSE,
        chainId: Cardano.ChainIds.Mainnet,
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
    decryptFn?: (keyStore: KeyStore, password: string) => Promise<Uint8Array>
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
    
    const blockfrostApiKey = process.env['BLOCKFROST_API_KEY'];
    if (blockfrostApiKey && blockfrostApiKey !== "<API_KEY>") {
      try {
        this.walletManager = await CardanoWalletManager.create({
          mnemonicWords: decryptedMnemonic.split(" "),
          network: 'mainnet',
          blockfrostApiKey
        });
      } catch (error) {
        console.warn("Failed to create CardanoWalletManager:", error);
        // Don't throw error - basic functionality (address) still works
      }
    } else {
      console.warn("BLOCKFROST_API_KEY not set - Cardano balance and advanced features will be unavailable");
    }
  }

  public async getKey(): Promise<Key> {
    if (!this.keyAgent) {
      console.error("Cardano key agent not initialized");
      throw new Error("Cardano key agent not initialized. Please unlock wallet first.");
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

  public async getBalance(): Promise<string> {
    if (!this.walletManager) {
      console.warn("Cardano wallet manager not initialized - balance unavailable");
      return '0';
    }
    try {
      const balance = await this.walletManager.getBalance();
      return (balance as any)?.coins?.toString() || '0';
    } catch (error) {
      console.warn("Failed to get Cardano balance:", error);
      return '0';
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
} 