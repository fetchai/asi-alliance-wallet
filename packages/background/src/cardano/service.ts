import { KeyStore, Key } from "../keyring/types";
import { CardanoKeyRing } from "@keplr-wallet/cardano";
import { Crypto } from "../keyring/crypto";

/**
 * Thin wrapper around @keplr-wallet/cardano that makes Cardano logic look like
 * "любая другая" цепочка для уровня background. Тем самым KeyRing остаётся
 * независимо-цепочным, а CardanoService инкапсулирует специфический SDK.
 */
export class CardanoService {
  private keyRing?: CardanoKeyRing;

  /**
   * Восстановить внутренний CardanoKeyRing из сохранённого keystore Background-кошелька.
   */
  async restoreFromKeyStore(store: KeyStore, password: string, crypto?: any): Promise<void> {
    this.clearCaches();
    this.keyRing = new CardanoKeyRing();
    
    try {
      // Create decryption function
      const decryptFn = crypto ? 
        (keyStore: KeyStore, pwd: string) => Crypto.decrypt(crypto, keyStore, pwd) : 
        undefined;
      
      console.log("Restoring CardanoKeyRing from keyStore:", store);
      await this.keyRing.restore(store, password, decryptFn);
      console.log("CardanoKeyRing restored successfully");
    } catch (error) {
      console.error("Failed to restore CardanoKeyRing:", error);
      throw error;
    }
  }

  /**
   * Получить Cardano-специфичную мету (serialized agent etc.) из мнемоники.
   * Используется при создании нового KeyStore.
   */
  async createMetaFromMnemonic(
    mnemonic: string,
    password: string,
  ): Promise<Record<string, string>> {
    const helper = new CardanoKeyRing();
    return helper.getMetaFromMnemonic(mnemonic, password);
  }

  /** 获取 публичный ключ/адрес Cardano для UI и сигнинга */
  async getKey(): Promise<Key> {
    if (!this.keyRing) {
      throw new Error("CardanoService not initialised. Call restoreFromKeyStore() first.");
    }
    return this.keyRing.getKey();
  }

  clearCaches() {
    this.keyRing = undefined;
  }
} 