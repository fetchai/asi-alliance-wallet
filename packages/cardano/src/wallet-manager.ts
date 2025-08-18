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

export class CardanoWalletManager {
  private wallet: any;

  private constructor(wallet: any) {
    this.wallet = wallet;
  }

  static async create({ mnemonicWords, network, accountIndex = 0, blockfrostApiKey }: {
    mnemonicWords: string[];
    network: 'mainnet' | 'testnet';
    accountIndex?: number;
    blockfrostApiKey: string;
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

    // lace-style: always use two arguments for BlockfrostClient
    const baseUrl = network === 'mainnet'
      ? 'https://cardano-mainnet.blockfrost.io/api/v0'
      : 'https://cardano-preview.blockfrost.io/api/v0';
    // lace-style: use Bottleneck for rateLimiter
    const rateLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 334 // ~3 requests per second (Blockfrost free tier)
    });
    const blockfrostConfig = {
      baseUrl,
      projectId: blockfrostApiKey
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
    return new CardanoWalletManager(wallet);
  }

  async getBalance() {
    return await firstValueFrom(this.wallet.balance.utxo.available$);
  }

  async getAddresses() {
    return await firstValueFrom(this.wallet.addresses$);
  }

  async signAndSubmitTx(txProps: any) {
    const txInit = await this.wallet.initializeTx(txProps);
    const finalizedTx = await this.wallet.finalizeTx({ tx: txInit });
    return await this.wallet.submitTx(finalizedTx);
  }


  
  /**
   * Creates TxBuilder for building transactions
   * Direct access to BaseWallet method
   */
  createTxBuilder() {
    return this.wallet.createTxBuilder();
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