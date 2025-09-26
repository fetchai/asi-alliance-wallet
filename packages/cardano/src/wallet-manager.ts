import { firstValueFrom } from 'rxjs';
import { getNetworkConfig } from './adapters/env-adapter';

export class CardanoWalletManager {
  private wallet: any;
  private wsProvider: any;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private keyAgent: any;

  private constructor(wallet: any, keyAgent: any, wsProvider?: any) {
    this.wallet = wallet;
    this.keyAgent = keyAgent;
    this.wsProvider = wsProvider;
    if (this.wallet) {
      this.setupWSErrorHandling();
    }
  }

  // lace-style: WebSocket error handling and auto-reconnection
  private setupWSErrorHandling() {
    if (!this.wsProvider) return;
    
    // Handle WebSocket disconnections with auto-reconnect
    const handleReconnect = () => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        
        setTimeout(() => {
          try {
            if (this.wsProvider && this.wsProvider.connect) {
              this.wsProvider.connect();
            }
          } catch (error) {
            console.warn("WebSocket reconnect failed:", error);
          }
        }, Math.pow(2, this.reconnectAttempts) * 1000); // exponential backoff
      }
    };

    // Reset reconnect attempts on successful connection
    if (this.wsProvider.on) {
      this.wsProvider.on('connect', () => {
        this.reconnectAttempts = 0;
      });
      
      this.wsProvider.on('disconnect', handleReconnect);
      this.wsProvider.on('error', (error: any) => {
        console.warn("WebSocket error:", error);
        handleReconnect();
      });
    }
  }

  static async create({ mnemonicWords, network, accountIndex = 0 }: {
    mnemonicWords: string[];
    network: 'mainnet' | 'testnet';
    accountIndex?: number;
  }): Promise<CardanoWalletManager> {
    // Create key agent
    const { SodiumBip32Ed25519 } = await import('@cardano-sdk/crypto');
    const { InMemoryKeyAgent } = await import('@cardano-sdk/key-management');
    const { Cardano } = await import('@cardano-sdk/core');

    const bip32Ed25519 = await SodiumBip32Ed25519.create();
    const keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords({
      mnemonicWords,
      accountIndex,
      purpose: 1852,
      chainId: network === 'mainnet' ? Cardano.ChainIds.Mainnet : Cardano.ChainIds.Preview,
      getPassphrase: async () => Buffer.from('')
    }, { bip32Ed25519, logger: console });

    // Check if Blockfrost is available
    const networkConfig = getNetworkConfig(network);
    let wallet: any = undefined;
    
    if (networkConfig?.projectId) {
      try {
        // Try to create full wallet with Blockfrost
        wallet = await this.createFullWallet(networkConfig);
      } catch (error) {
        console.warn('Failed to create full wallet, using Koios-only mode:', error);
      }
    } else {
    }

    return new CardanoWalletManager(wallet, keyAgent);
  }

  private static async createFullWallet(_networkConfig: any): Promise<any> {
    // This would create the full BaseWallet with Blockfrost providers
    // For now, return undefined to use basic mode
    return undefined;
  }

  async getBalance() {
    if (!this.wallet) {
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
      const [available, total, unspendable, rewards, deposits, assetInfo] = await Promise.all([
        firstValueFrom(this.wallet.balance.utxo.available$),
        firstValueFrom(this.wallet.balance.utxo.total$),
        firstValueFrom(this.wallet.balance.utxo.unspendable$),
        firstValueFrom(this.wallet.balance.rewardAccounts.rewards$),
        firstValueFrom(this.wallet.balance.rewardAccounts.deposit$),
        firstValueFrom(this.wallet.assetInfo$).catch(() => new Map())
      ]);

      return {
        utxo: { available, total, unspendable },
        rewards: rewards || BigInt(0),
        deposits: deposits || BigInt(0),
        assetInfo: assetInfo || new Map()
      };
    } catch (error) {
      console.warn("Failed to get balance:", error);
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

  async getAddresses() {
    if (!this.wallet) {
      return [];
    }
    
    try {
      return await firstValueFrom(this.wallet.addresses$);
    } catch (error) {
      console.warn("Failed to get addresses:", error);
      return [];
    }
  }

  async signAndSubmitTx(txProps: any) {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    
    try {
      const txInit = await this.wallet.initializeTx(txProps);
      const finalizedTx = await this.wallet.finalizeTx({ tx: txInit });
      return await this.wallet.submitTx(finalizedTx);
    } catch (error) {
      console.error("Transaction failed:", error);
      if (error?.message?.includes('insufficient')) {
        throw new Error('Insufficient funds for transaction');
      }
      if (error?.message?.includes('network')) {
        throw new Error('Network error. Please try again');
      }
      throw error;
    }
  }


  
  /**
   * Creates TxBuilder for building transactions
   * Direct access to BaseWallet method
   */
  createTxBuilder() {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return this.wallet.createTxBuilder();
  }

  /**
   * lace-style: cleanup method for proper resource management
   */
  dispose() {
    try {
      if (this.wsProvider && this.wsProvider.close) {
        this.wsProvider.close().catch((error: any) => 
          console.warn("Error closing WebSocket:", error)
        );
      }
      if (this.wallet && this.wallet.shutdown) {
        this.wallet.shutdown();
      }
    } catch (error) {
      console.warn("Error during wallet disposal:", error);
    }
  }

  /**
   * Initializes transaction with given parameters
   * Direct access to BaseWallet method
   */
  async initializeTx(txProps: any) {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return await this.wallet.initializeTx(txProps);
  }

  /**
   * Finalizes and signs transaction
   * Direct access to BaseWallet method
   */
  async finalizeTx(params: { tx: any }) {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return await this.wallet.finalizeTx(params);
  }

  /**
   * Submits signed transaction to network
   * Direct access to BaseWallet method
   */
  async submitTx(signedTx: any) {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return await this.wallet.submitTx(signedTx);
  }

  /**
   * Gets current blockchain tip
   * Needed for setting validity interval
   */
  get tip$() {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return this.wallet.tip$;
  }

  /**
   * Gets wallet UTXO
   */
  get utxo() {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return this.wallet.utxo;
  }

  /**
   * Gets wallet addresses
   */
  get addresses$() {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return this.wallet.addresses$;
  }

  /**
   * Gets base wallet for access to ObservableWallet API
   * Needed for integration with functions from Lace wallet/lib
   */
  getWallet() {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return this.wallet;
  }

  /**
   * High-level function for sending ADA
   * Delegates execution to modular function from wallet/lib
   */
  async sendAda(params: {
    to: string;
    amount: string; // in lovelaces (1 ADA = 1,000,000 lovelaces)
    memo?: string;
  }): Promise<string> {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    
    const { Cardano } = await import('@cardano-sdk/core');
    const address = Cardano.Address.fromBech32(params.to);
    const value = { coins: BigInt(params.amount) };
    const output = { address, value } as any;
    
    const auxiliaryData = params.memo ? { blob: { 674: params.memo } } as any : undefined;
    
    const { buildTx, signAndSubmit } = await import('./api/extension/wallet');
    const tx = await buildTx({
      output,
      auxiliaryData,
      walletManager: this,
    });
    
    return await signAndSubmit({ tx, walletManager: this });
  }

  // Key agent access for CardanoKeyRing
  getKeyAgent(): any {
    return this.keyAgent;
  }


} 