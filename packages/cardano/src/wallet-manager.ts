import { firstValueFrom } from 'rxjs';
import { getNetworkConfig, type BlockfrostConfig } from './adapters/env-adapter';
import type { CardanoNetwork } from './utils/network';
import { Cardano } from '@cardano-sdk/core';

export class CardanoWalletManager {
  private wallet: any;
  private wsProvider: any;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private keyAgent: any;
  private chainHistoryProvider: any;

  private constructor(wallet: any, keyAgent: any, wsProvider?: any) {
    this.wallet = wallet;
    this.keyAgent = keyAgent;
    this.wsProvider = wsProvider;
    if (this.wallet) {
      this.setupWSErrorHandling();
    }
  }

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

  static async create({
    mnemonicWords,
    network,
    accountIndex = 0,
    passphrase = new Uint8Array(),
  }: {
    mnemonicWords: string[];
    network: CardanoNetwork;
    accountIndex?: number;
    passphrase?: Uint8Array;
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
      chainId: network === 'mainnet'
        ? Cardano.ChainIds.Mainnet
        : network === 'preprod'
          ? Cardano.ChainIds.Preprod
          : network === 'sanchonet'
            ? Cardano.ChainIds.Sanchonet
            : Cardano.ChainIds.Preview,
      getPassphrase: async () => passphrase
    }, { bip32Ed25519, logger: console });

    // Check if Blockfrost is available
    const networkConfig = getNetworkConfig(network);
    let wallet: any = undefined;
    let chainHistoryProvider: any = undefined;
    
    if (networkConfig?.projectId) {
      try {
        const created = await this.createFullWallet(networkConfig, keyAgent);
        wallet = created.wallet;
        chainHistoryProvider = created.providers?.chainHistoryProvider;
      } catch (error) {
        console.error('[CardanoWalletManager] Failed to create full wallet:', error);
      }
    } else {
      console.warn('[CardanoWalletManager] No Blockfrost API key found for network:', network);
    }

    const manager = new CardanoWalletManager(wallet, keyAgent);
    manager.chainHistoryProvider = chainHistoryProvider;
    return manager;
  }

  private static async createFullWallet(
    networkConfig: BlockfrostConfig,
    keyAgent: any
  ): Promise<{ wallet: any; providers: any }> {
    // Import necessary SDK modules
    const walletModule = await import('@cardano-sdk/wallet');
    const { createPersonalWallet, storage, DEFAULT_POLLING_CONFIG } = walletModule;
    const KeyManagement = await import('@cardano-sdk/key-management');
    const { createBlockfrostProviders } = await import('./wallet/lib/providers');
    const { Cardano } = await import('@cardano-sdk/core');

    let extensionLocalStorage: any = undefined;
    try {
      // Use require to avoid TypeScript errors with webextension-polyfill
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const webextensionPolyfill = require('webextension-polyfill');
      if (webextensionPolyfill?.storage?.local) {
        extensionLocalStorage = webextensionPolyfill.storage.local;
      }
    } catch (error) {
      // If webextension-polyfill not available, use in-memory cache fallback
    }

    const chainId = keyAgent.chainId;
    let chainName: 'Mainnet' | 'Preview' | 'Preprod' | 'Sanchonet' | undefined;
    if (chainId) {
      if (chainId.networkMagic === Cardano.NetworkMagics.Mainnet) {
        chainName = 'Mainnet';
      } else if (chainId.networkMagic === Cardano.NetworkMagics.Preview) {
        chainName = 'Preview';
      } else if (chainId.networkMagic === Cardano.NetworkMagics.Preprod) {
        chainName = 'Preprod';
      } else if (chainId.networkMagic === Cardano.NetworkMagics.Sanchonet) {
        chainName = 'Sanchonet';
      }
    }

    const providers = createBlockfrostProviders({
      blockfrostConfig: networkConfig,
      logger: console,
      extensionLocalStorage,
      chainName
    });

    const stores = storage.createInMemoryWalletStores();
    const asyncKeyAgent = KeyManagement.util.createAsyncKeyAgent(keyAgent);
    const witnesser = KeyManagement.util.createBip32Ed25519Witnesser(asyncKeyAgent);
    const bip32Account = await KeyManagement.Bip32Account.fromAsyncKeyAgent(asyncKeyAgent) as any;

    const wallet = createPersonalWallet(
      {
        name: 'Cardano Wallet',
        polling: DEFAULT_POLLING_CONFIG
      },
      {
        logger: console,
        ...providers,
        stores,
        witnesser,
        bip32Account
      }
    );

    return { wallet, providers };
  }

  async getBalance() {
    if (!this.wallet) {
      return {
        utxo: {
          available: { coins: BigInt(0), utxos: [] },
          total: { coins: BigInt(0), utxos: [] },
          unspendable: { coins: BigInt(0), utxos: [] }
        },
        rewards: BigInt(0),
        deposits: BigInt(0),
        assetInfo: new Map()
      };
    }

    try {
      // Use timeout to prevent hanging on Blockfrost errors
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Balance fetch timeout')), 10000);
      });

      const balancePromise = Promise.all([
        firstValueFrom(this.wallet.balance.utxo.available$),
        firstValueFrom(this.wallet.balance.utxo.total$),
        firstValueFrom(this.wallet.balance.utxo.unspendable$),
        firstValueFrom(this.wallet.balance.rewardAccounts.rewards$),
        firstValueFrom(this.wallet.balance.rewardAccounts.deposit$),
        firstValueFrom(this.wallet.assetInfo$).catch(() => new Map())
      ]);

      const [available, total, unspendable, rewards, deposits, assetInfo] = await Promise.race([
        balancePromise,
        timeoutPromise
      ]) as any;

      return {
        utxo: { 
          available: available || { coins: BigInt(0), utxos: [] },
          total: total || { coins: BigInt(0), utxos: [] },
          unspendable: unspendable || { coins: BigInt(0), utxos: [] }
        },
        rewards: rewards || BigInt(0),
        deposits: deposits || BigInt(0),
        assetInfo: assetInfo || new Map()
      };
    } catch (error: any) {
      // Return zero balance on error - tx.inspect() will validate sufficient funds
      return {
        utxo: {
          available: { coins: BigInt(0), utxos: [] },
          total: { coins: BigInt(0), utxos: [] },
          unspendable: { coins: BigInt(0), utxos: [] }
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

  get syncStatus$() {
    if (!this.wallet) {
      throw new Error("Wallet not initialized");
    }
    return this.wallet.syncStatus.isSettled$;
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
   * Checks if wallet is initialized and available for transactions
   */
  hasWallet(): boolean {
    return !!this.wallet;
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
   * Gets protocol parameters
   * Needed for minAdaRequired validation
   */
  get protocolParameters$() {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    return this.wallet.protocolParameters$;
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
   * Returns ChainHistoryProvider used by the wallet.
   * This is required for lace-style tx history loading and input resolution.
   */
  getChainHistoryProvider() {
    if (!this.chainHistoryProvider) {
      throw new Error("Chain history provider unavailable without Blockfrost API key");
    }
    return this.chainHistoryProvider;
  }

  /** Convert string-keyed asset map to SDK AssetId map (lace buildTransactionProps contract). */
  private toSdkAssetMap(assets: Map<string, string>): Map<Cardano.AssetId, string> {
    const map = new Map<Cardano.AssetId, string>();
    for (const [id, amount] of assets) {
      map.set(Cardano.AssetId(id), amount);
    }
    return map;
  }

  private async buildSendTransaction(params: {
    to: string;
    amount: string;
    memo?: string;
    assets?: Map<string, string>;
  }) {
    if (!params.to || typeof params.to !== 'string') {
      throw new Error(`Invalid recipient address: ${params.to}`);
    }

    let address: any;
    try {
      address = Cardano.PaymentAddress(params.to);
    } catch (parseError: any) {
      throw new Error(`Invalid Cardano address format: ${parseError?.message || parseError}`);
    }

    const { createWalletUtil } = await import('@cardano-sdk/wallet');
    const { buildTransactionProps } = await import('./wallet/lib/build-transaction-props');
    const { setMissingCoins } = await import('./wallet/lib/set-missing-coins');
    const { TX } = await import('./config');

    const sdkAssets =
      params.assets && params.assets.size > 0 ? this.toSdkAssetMap(params.assets) : undefined;

    const outputsMap = new Map([
      ['output1', {
        address,
        value: {
          coins: params.amount,
          assets: sdkAssets,
        }
      }]
    ]);

    // Omit assetsInfo: our asset amounts are already in base units (lovelace / token smallest unit).
    // Passing assetsInfo would trigger assetBalanceToBigInt to apply decimal scaling again (double conversion).
    const partialTxProps = buildTransactionProps({
      outputsMap,
      metadata: params.memo,
    });

    if (!partialTxProps.outputs) {
      throw new Error('Transaction outputs are undefined');
    }

    // Track coins before setMissingCoins to calculate minAda added for tokens
    const coinsBefore = [...partialTxProps.outputs].reduce(
      (sum, out) => sum + (out.value?.coins ?? BigInt(0)),
      BigInt(0)
    );

    const util = createWalletUtil(this.wallet);
    const minimumCoinQuantities = await util.validateOutputs(partialTxProps.outputs);

    // For ADA-only transfers, if the requested amount is below the protocol minimum
    // output value, surface it immediately with the calculated minimum (no hardcoded constant).
    if (!sdkAssets) {
      const outputEntry = partialTxProps.outputs ? [...partialTxProps.outputs][0] : undefined;
      const validation = outputEntry ? minimumCoinQuantities.get(outputEntry) : undefined;
      if (validation && validation.coinMissing > BigInt(0)) {
        throw new Error(
          `Amount too small: minimum output value is ${validation.minimumCoin} lovelace (protocol minimum for this output). Please send at least ${validation.minimumCoin} lovelace.`
        );
      }
    }

    const outputsWithMissingCoins = setMissingCoins(minimumCoinQuantities, partialTxProps.outputs);

    if (!outputsWithMissingCoins.outputs) {
      throw new Error('Outputs with missing coins are undefined');
    }

    const coinsAfter = [...outputsWithMissingCoins.outputs].reduce(
      (sum, out) => sum + (out.value?.coins ?? BigInt(0)),
      BigInt(0)
    );
    const minAdaForTokens = coinsAfter > coinsBefore ? (coinsAfter - coinsBefore).toString() : "0";

    const txBuilder = this.createTxBuilder();
    const tip = await firstValueFrom(this.tip$) as { slot: number };

    txBuilder.setValidityInterval({
      invalidHereafter: Cardano.Slot(tip.slot + TX.invalid_hereafter)
    });

    outputsWithMissingCoins.outputs.forEach((output) => txBuilder.addOutput(output));

    if (partialTxProps?.auxiliaryData?.blob) {
      txBuilder.metadata(partialTxProps.auxiliaryData.blob);
    }

    const tx = txBuilder.build();
    const inspection = await tx.inspect();
    const fee = inspection?.inputSelection?.fee;

    if (!fee) {
      throw new Error('Transaction inspection failed: no inputSelection');
    }

    const feeStr = fee.toString();
    return { tx, fee: feeStr, minAdaForTokens };
  }

  async buildSendAdaTx(params: {
    to: string;
    amount: string;
    memo?: string;
    assets?: Map<string, string>;
  }): Promise<{ tx: any; fee: string; total: string; minAdaForTokens: string }> {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }
    const { tx, fee, minAdaForTokens } = await this.buildSendTransaction(params);
    const total = (BigInt(params.amount) + BigInt(fee) + BigInt(minAdaForTokens)).toString();
    return { tx, fee, total, minAdaForTokens };
  }

  async estimateSendAda(params: {
    to: string;
    amount: string;
    memo?: string;
    assets?: Map<string, string>;
  }): Promise<{ fee: string; total: string; minAdaForTokens?: string }> {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }

    const { fee, total, minAdaForTokens } = await this.buildSendAdaTx(params);

    return {
      fee,
      total,
      minAdaForTokens,
    };
  }

  async sendAda(params: {
    to: string;
    amount: string; // in lovelaces (1 ADA = 1,000,000 lovelaces)
    memo?: string;
    assets?: Map<string, string>;
  }): Promise<string> {
    if (!this.wallet) {
      throw new Error("Transaction features unavailable without Blockfrost API key");
    }

    try {
      const { tx: builtTx } = await this.buildSendTransaction(params);
      const { submitTx } = await import('./api/extension');

      const signedTx = (await builtTx.sign()).cbor;
      const txId = await submitTx(signedTx, this);

      return typeof txId === 'string' ? txId : txId.toString();
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';

      if (errorMessage.includes('insufficient') || errorMessage.includes('UTxO Balance Insufficient')) {
        throw new Error('Insufficient funds for transaction');
      }
      if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        throw new Error('Network error. Please try again');
      }
      if (errorMessage.includes('Mock wallet') || errorMessage.includes('subscribe')) {
        throw new Error('Transaction sending requires a full wallet with Blockfrost API key. Please configure Blockfrost API key.');
      }

      throw new Error(errorMessage);
    }
  }

  // Key agent access for CardanoKeyRing
  getKeyAgent(): any {
    return this.keyAgent;
  }


} 