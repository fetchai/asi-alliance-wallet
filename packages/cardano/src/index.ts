export * from './api/extension';
export * from './api/extension/wallet';
export * from './api/util';

export * from './wallet/lib';

export { CardanoWalletManager } from './wallet-manager';
export { CardanoKeyRing } from './cardano-keyring';
export { CardanoAccount } from './cardano-account';

// Re-export types for compatibility with background package
export type { KeyStore, Key, CoinTypeForChain, BIP44HDPath, SupportedCurve } from "./cardano-keyring";

export * from './background-api';

export * from './utils/lovelacesToAdaString';
export * from './utils/network';

export * from './adapters/env-adapter';
