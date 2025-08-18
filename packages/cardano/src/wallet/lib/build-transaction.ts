import { createWalletUtil } from '@cardano-sdk/wallet';
import { InitializeTxProps, InitializeTxResult, MinimumCoinQuantityPerOutput } from '@cardano-sdk/tx-construction';
import { CardanoWalletManager } from '../../wallet-manager';

export interface InitializedCardanoTransaction {
  transaction: InitializeTxResult;
  minimumCoinQuantities: MinimumCoinQuantityPerOutput;
}

/**
 * Validates and initializes a Cardano transaction
 * @param txProps Transaction value
 * @param walletManager Wallet manager sending the transaction
 * @returns transaction built and minimum coin quantities
 */
export const buildTransaction = async (
  txProps: InitializeTxProps,
  walletManager: CardanoWalletManager
): Promise<InitializedCardanoTransaction> => {
  const wallet = walletManager.getWallet();
  if (!wallet) {
    throw new Error('Wallet not initialized');
  }

  const util = createWalletUtil(wallet);
  const minimumCoinQuantities = await util.validateOutputs(txProps.outputs || []);
  const transaction = await wallet.initializeTx(txProps);

  return { transaction, minimumCoinQuantities };
};
