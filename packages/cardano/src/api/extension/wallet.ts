import { Cardano } from '@cardano-sdk/core';
import { firstValueFrom } from 'rxjs';

import { TX } from '../../config';

import { submitTx } from '.';

import type { UnwitnessedTx } from '@cardano-sdk/tx-construction';
import type { CardanoWalletManager } from '../../wallet-manager';

export const buildTx = async ({
  output,
  auxiliaryData,
  walletManager,
}: Readonly<{
  output: any; // Temporarily using any for compatibility
  auxiliaryData: any; // Temporarily using any for compatibility
  walletManager: CardanoWalletManager;
}>): Promise<UnwitnessedTx> => {
  const txBuilder = walletManager.createTxBuilder();
  const metadata = auxiliaryData?.metadata?.()?.toCore?.() || auxiliaryData?.blob;
  const tip = await firstValueFrom(walletManager.tip$);
  
  // Add output to builder
  if (output.toCore) {
    txBuilder.addOutput(output.toCore());
  } else {
    // Fallback for simple objects
    txBuilder.addOutput(output);
  }

  if (metadata) {
    txBuilder.metadata(metadata);
  }

  // Proper typing for tip object
  const tipSlot = (tip as { slot: number }).slot;
  txBuilder.setValidityInterval({
    invalidHereafter: Cardano.Slot(tipSlot + TX.invalid_hereafter),
  });

  return txBuilder.build();
};

export const signAndSubmit = async ({
  tx,
  walletManager,
}: Readonly<{
  tx: UnwitnessedTx;
  walletManager: CardanoWalletManager;
}>) => {
  // Simplified version for our CardanoWalletManager
  const { cbor: signedTx } = await tx.sign();
  return await submitTx(signedTx, walletManager);
};
