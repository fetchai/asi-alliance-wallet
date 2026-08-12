export * from "./api/extension";
export * from "./api/extension/wallet";
export * from "./api/util";

export * from "./wallet/lib";
export * from "./wallet/util";

export { CardanoWalletManager } from "./wallet-manager";
export { CardanoKeyRing } from "./cardano-keyring";
export {
  CARDANO_KEY_CONTEXT_DEADLINE_MS,
  CARDANO_KEY_CONTEXT_TIMEOUT_CODE,
  CardanoKeyContext,
  CardanoKeyContextTimeoutError,
  isCardanoKeyContextTimeoutError,
} from "./cardano-key-context";
export type { CardanoKeyContextDerivation } from "./cardano-key-context";
export { CardanoAccount } from "./cardano-account";
export {
  CARDANO_RUNTIME_INACTIVE_CODE,
  CardanoRuntimeInactiveError,
  createCardanoRuntimeLease,
  isCardanoRuntimeInactiveError,
} from "./runtime-lease";
export type {
  CardanoRuntimeInactiveReason,
  CardanoRuntimeInactiveErrorLike,
  CardanoRuntimeLease,
  CardanoRuntimeLeaseAuthorityView,
  MutableCardanoRuntimeLease,
} from "./runtime-lease";

// Re-export types for compatibility with background package
export type {
  KeyStore,
  Key,
  CoinTypeForChain,
  BIP44HDPath,
  SupportedCurve,
  ResolveBlockfrostConfig,
} from "./cardano-keyring";

export * from "./background-api";

export * from "./utils/lovelaces-to-ada-string";
export * from "./utils/parse-asset-id";
export * from "./utils/format-asset-amount";
export * from "./utils/network";
export * from "./utils/ui-error-contract";
export { CARDANO_SEND_CONFLICT_PENDING_MESSAGE } from "./constants/cardano-send-conflict";
export * from "./utils/send-minimum-violation";

// Export validators with explicit names to avoid conflict with api/extension/isValidAddress
export {
  isValidAddress as isValidCardanoAddress,
  validateMainnetAddress,
  validateTestnetAddress,
  isValidAddressPerNetwork,
  validateWalletAddress,
  validateWalletName,
} from "./utils/validators/address-book";

export * from "./adapters/env-adapter";
export * from "./adapters/blockfrost-config-resolver";
export * from "./adapters/blockfrost-error-classifier";
export * from "./utils/blockfrost-network-mapper";
export {
  resetBlockfrostRateLimitTelemetry,
  wasRateLimitedRecently,
  BLOCKFROST_RATE_LIMIT_RECENT_WINDOW_MS,
  createRuntimeInstanceId,
  clearBlockfrostRequestGuardForTests,
  clearCardanoRuntimeTelemetryForTests,
  installBlockfrostRequestGuard,
  markCardanoRuntimeDisposed,
} from "./wallet/lib/blockfrost-request-guard";
export type { CardanoRuntimeCreatedBy } from "./wallet/lib/blockfrost-request-guard";
