

export type CardanoAccountOptions = {
  mnemonicWords: string[];
  accountIndex?: number;
  chainId?: any;
};

export class CardanoAccount {
  private keyAgent: any;

  private constructor(keyAgent: any) {
    this.keyAgent = keyAgent;
  }

  static async create({ mnemonicWords, accountIndex = 0, chainId }: CardanoAccountOptions): Promise<CardanoAccount> {
    const { SodiumBip32Ed25519 } = await import('@cardano-sdk/crypto');
    const { InMemoryKeyAgent } = await import('@cardano-sdk/key-management');
    const { Cardano } = await import('@cardano-sdk/core');

    const bip32Ed25519 = await SodiumBip32Ed25519.create();
    const keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords({
      mnemonicWords,
      accountIndex,
      purpose: 1852,
      chainId: chainId || Cardano.ChainIds.Mainnet,
      getPassphrase: async () => Buffer.from('')
    }, { bip32Ed25519, logger: console });
    return new CardanoAccount(keyAgent);
  }

  async getAddress(index = 0, type: 0 | 1 = 0): Promise<string> {
    const addrObj = await this.keyAgent.deriveAddress({ index, type }, 0);
    return addrObj.address;
  }

  getKeyAgent(): any {
    return this.keyAgent;
  }
} 