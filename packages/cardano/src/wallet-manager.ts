import {
  BlockfrostClient,
  BlockfrostAssetProvider,
  BlockfrostChainHistoryProvider,
  BlockfrostNetworkInfoProvider,
  BlockfrostRewardsProvider,
  BlockfrostRewardAccountInfoProvider,
  BlockfrostUtxoProvider,
  BlockfrostTxSubmitProvider
} from '@cardano-sdk/cardano-services-client';
import Bottleneck from 'bottleneck';
import { firstValueFrom } from 'rxjs';
import { getNetworkConfig } from './adapters/env-adapter';

export class CardanoWalletManager {
  private wallet: any;
  private wsProvider: any;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  private constructor(wallet: any, wsProvider?: any) {
    this.wallet = wallet;
    this.wsProvider = wsProvider;
    this.setupWSErrorHandling();
  }

  // lace-style: WebSocket error handling and auto-reconnection
  private setupWSErrorHandling() {
    if (!this.wsProvider) return;
    
    // Handle WebSocket disconnections with auto-reconnect
    const handleReconnect = () => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`WebSocket reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
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
        console.log("WebSocket connected successfully");
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
    const { SodiumBip32Ed25519 } = await import('@cardano-sdk/crypto');
    const { InMemoryKeyAgent, util, Bip32Account } = await import('@cardano-sdk/key-management');
    const { Cardano } = await import('@cardano-sdk/core');
    const { BaseWallet } = await import('@cardano-sdk/wallet');

    const bip32Ed25519 = await SodiumBip32Ed25519.create();
    const keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords({
      mnemonicWords,
      accountIndex,
      purpose: 1852,
      chainId: network === 'mainnet' ? Cardano.ChainIds.Mainnet : Cardano.ChainIds.Preview,
      getPassphrase: async () => Buffer.from('')
    }, { bip32Ed25519, logger: console });

    const asyncKeyAgent = util.createAsyncKeyAgent(keyAgent);
    const bip32Account = await Bip32Account.fromAsyncKeyAgent(asyncKeyAgent);
    const witnesser = util.createBip32Ed25519Witnesser(asyncKeyAgent);

    const { SingleAddressDiscovery } = await import('@cardano-sdk/wallet');
    const addressDiscovery = new SingleAddressDiscovery();

    const publicCredentialsManager: any = {
      __type: 'BIP32_CREDENTIALS_MANAGER',
      bip32Account,
      addressDiscovery
    };

    // lace-style: use configuration instead of hardcoded URLs
    const networkConfig = getNetworkConfig(network);
    if (!networkConfig) {
      throw new Error(`No Blockfrost configuration found for network: ${network}`);
    }
    const baseUrl = networkConfig.baseUrl;
    // lace-style: use proper rate limiter configuration like in lace
    const rateLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 200, // 5 requests per second (more conservative for stability)
      reservoir: 500, // lace-style: use reservoir pattern
      reservoirIncreaseAmount: 10,
      reservoirIncreaseMaximum: 500,
      reservoirIncreaseInterval: 1000
    });
    const blockfrostConfig = {
      baseUrl,
      projectId: networkConfig.projectId
    };
    const blockfrostClient = new BlockfrostClient(blockfrostConfig, { rateLimiter });
    const assetProvider = new BlockfrostAssetProvider(blockfrostClient, console);
    const networkInfoProvider = new BlockfrostNetworkInfoProvider(blockfrostClient, console);
    const rewardsProvider = new BlockfrostRewardsProvider(blockfrostClient, console);
    const txSubmitProvider = new BlockfrostTxSubmitProvider(blockfrostClient, console);
    const utxoProvider = new BlockfrostUtxoProvider({
      client: blockfrostClient,
      cache: {} as any,
      logger: console
    });
    const chainHistoryProvider = new BlockfrostChainHistoryProvider({
      client: blockfrostClient,
      cache: {} as any,
      networkInfoProvider,
      logger: console
    });
    const rewardAccountInfoProvider = new BlockfrostRewardAccountInfoProvider({
      client: blockfrostClient,
      stakePoolProvider: {} as any,
      dRepProvider: {} as any,
      logger: console
    });

    const wallet = new BaseWallet(
      { name: 'Cardano Wallet' },
      {
        witnesser,
        txSubmitProvider,
        assetProvider,
        networkInfoProvider,
        utxoProvider,
        chainHistoryProvider,
        rewardAccountInfoProvider,
        rewardsProvider,
        logger: console,
        publicCredentialsManager
      }
    );
    
    // lace-style: initialize with proper WebSocket support
    return new CardanoWalletManager(wallet);
  }

  async getBalance() {
    try {
      // lace-style: Get comprehensive balance data following lace patterns
      const [available, total, unspendable, rewards, deposits, assetInfo] = await Promise.all([
        firstValueFrom(this.wallet.balance.utxo.available$),
        firstValueFrom(this.wallet.balance.utxo.total$),
        firstValueFrom(this.wallet.balance.utxo.unspendable$),
        firstValueFrom(this.wallet.balance.rewardAccounts.rewards$),
        firstValueFrom(this.wallet.balance.rewardAccounts.deposit$),
        firstValueFrom(this.wallet.assetInfo$).catch(() => new Map()) // lace-style: graceful fallback for asset info
      ]);

      return {
        utxo: {
          available,
          total,
          unspendable
        },
        rewards: rewards || BigInt(0),
        deposits: deposits || BigInt(0),
        assetInfo: assetInfo || new Map() // lace-style: include native tokens info
      };
    } catch (error) {
      console.warn("Failed to get balance:", error);
      // lace-style: graceful fallback with zero balance
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
    try {
      return await firstValueFrom(this.wallet.addresses$);
    } catch (error) {
      console.warn("Failed to get addresses:", error);
      // lace-style: graceful fallback with empty array
      return [];
    }
  }

  async signAndSubmitTx(txProps: any) {
    try {
      const txInit = await this.wallet.initializeTx(txProps);
      const finalizedTx = await this.wallet.finalizeTx({ tx: txInit });
      return await this.wallet.submitTx(finalizedTx);
    } catch (error) {
      console.error("Transaction failed:", error);
      // lace-style: rethrow with proper error context
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
    return await this.wallet.initializeTx(txProps);
  }

  /**
   * Finalizes and signs transaction
   * Direct access to BaseWallet method
   */
  async finalizeTx(params: { tx: any }) {
    return await this.wallet.finalizeTx(params);
  }

  /**
   * Submits signed transaction to network
   * Direct access to BaseWallet method
   */
  async submitTx(signedTx: any) {
    return await this.wallet.submitTx(signedTx);
  }

  /**
   * Gets current blockchain tip
   * Needed for setting validity interval
   */
  get tip$() {
    return this.wallet.tip$;
  }

  /**
   * Gets wallet UTXO
   */
  get utxo() {
    return this.wallet.utxo;
  }

  /**
   * Gets wallet addresses
   */
  get addresses$() {
    return this.wallet.addresses$;
  }

  /**
   * Gets base wallet for access to ObservableWallet API
   * Needed for integration with functions from Lace wallet/lib
   */
  getWallet() {
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
    const { Cardano } = await import('@cardano-sdk/core');
    const address = Cardano.Address.fromBech32(params.to);
    const value = { coins: BigInt(params.amount) };
    const output = { address, value } as any; // Temporarily using any for compatibility
    
    const auxiliaryData = params.memo ? { blob: { 674: params.memo } } as any : undefined; // Temporarily using any
    
    const { buildTx, signAndSubmit } = await import('./api/extension/wallet');
    const tx = await buildTx({
      output,
      auxiliaryData,
      walletManager: this,
    });
    
    return await signAndSubmit({ tx, walletManager: this });
  }


} 