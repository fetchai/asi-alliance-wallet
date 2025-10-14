/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {
  Cardano,
  Serialization,
  ProviderError,
  ProviderFailure,
} from '@cardano-sdk/core';

import { APIError, TxSendError } from '../../config';
import { CardanoWalletManager } from '../../wallet-manager';

export const isValidAddress = (
  address: string,
  currentChain: Readonly<Cardano.ChainId>,
) => {
  try {
    const addr = Cardano.Address.fromBech32(address);
    if (
      (addr.getNetworkId() === Cardano.NetworkId.Mainnet &&
        currentChain.networkMagic === Cardano.NetworkMagics.Mainnet) ||
      (addr.getNetworkId() === Cardano.NetworkId.Testnet &&
        (currentChain.networkMagic === Cardano.NetworkMagics.Preview ||
          currentChain.networkMagic === Cardano.NetworkMagics.Preprod))
    ) {
      return addr.toBytes();
    }
    return false;
  } catch {}
  try {
    const addr = Cardano.ByronAddress.fromAddress(
      Cardano.Address.fromBase58(address),
    )?.toAddress();
    if (
      (addr?.getNetworkId() === Cardano.NetworkId.Mainnet &&
        currentChain.networkMagic === Cardano.NetworkMagics.Mainnet) ||
      (addr?.getNetworkId() === Cardano.NetworkId.Testnet &&
        (currentChain.networkMagic === Cardano.NetworkMagics.Preview ||
          currentChain.networkMagic === Cardano.NetworkMagics.Preprod))
    )
      return addr.toBytes();
    return false;
  } catch {}
  return false;
};

/**
 * Submits transaction to Cardano network
 */
export const submitTx = async (
  tx: string,
  walletManager: CardanoWalletManager,
): Promise<Cardano.TransactionId | undefined> => {
  try {
    const result = await walletManager.submitTx(Serialization.TxCBOR(tx));
    return result;
  } catch (error) {
    if (
      error instanceof ProviderError &&
      ProviderFailure.BadRequest === error.reason
    ) {
      throw { ...TxSendError.Failure, message: error.message };
    }
    throw APIError.InvalidRequest;
  }
};

/**
 * Displays unit for UI
 */
export const displayUnit = (
  quantity?: bigint | number | string,
  decimals: number | string = 6,
) => {
  if (quantity === undefined) return 0;

  return Number.parseInt(quantity.toString()) / 10 ** Number(decimals);
};

/**
 * Converts amount to units considering decimals
 */
export const toUnit = (amount: string, decimals = 6) => {
  if (!amount) return '0';
  let result = Number.parseFloat(
    amount.toString().replace(/[\s,]/g, ''),
  ).toLocaleString('en-EN', { minimumFractionDigits: decimals });
  const split = result.split('.');
  const front = split[0].replace(/[\s,]/g, '');
  result =
    (Number(front) == 0 ? '' : front) +
    (split[1] ? split[1].slice(0, decimals) : '');
  if (!result) return '0';
  else if (result == 'NaN') return '0';
  return result;
};
