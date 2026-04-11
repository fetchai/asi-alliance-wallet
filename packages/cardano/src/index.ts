export * from './api/extension';
export * from './api/extension/wallet';
export * from './api/util';

export * from './wallet/lib';
export * from './wallet/util';

export { CardanoWalletManager } from './wallet-manager';
export { CardanoKeyRing } from './cardano-keyring';
export { CardanoAccount } from './cardano-account';

// Re-export types for compatibility with background package
export type { KeyStore, Key, CoinTypeForChain, BIP44HDPath, SupportedCurve } from "./cardano-keyring";

export * from './background-api';

export * from './utils/lovelacesToAdaString';
export * from './utils/parseAssetId';
export * from './utils/formatAssetAmount';
export * from './utils/network';
export * from './utils/ui-error-contract';
export { CARDANO_SEND_CONFLICT_PENDING_MESSAGE } from './constants/cardano-send-conflict';
export * from './utils/send-minimum-violation';

// Export validators with explicit names to avoid conflict with api/extension/isValidAddress
export {
  isValidAddress as isValidCardanoAddress,
  validateMainnetAddress,
  validateTestnetAddress,
  isValidAddressPerNetwork,
  validateWalletAddress,
  validateWalletName
} from './utils/validators/address-book';

export * from './adapters/env-adapter';
