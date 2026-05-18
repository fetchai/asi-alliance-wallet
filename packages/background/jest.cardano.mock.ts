/* eslint-disable import/no-extraneous-dependencies */
import { InMemoryKeyAgent } from "@cardano-sdk/key-management";

type WalletLike = { hasWallet: () => boolean; dispose?: () => void };

const defaultWallet: WalletLike = { hasWallet: () => true };

export class CardanoWalletManager {
  static async create(_params?: unknown): Promise<WalletLike> {
    return defaultWallet;
  }
}

export class CardanoKeyRing {
  private keyAgentByChainId = new Map<string, unknown>();

  async restore(
    keyStore: { key?: string },
    _password: string,
    _decryptFn?: unknown,
    chainId = "cardano-mainnet"
  ): Promise<void> {
    const keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords({
      chainId,
      mnemonicWords: (keyStore.key ?? "").split(" ").filter(Boolean),
      getPassphrase: async () => new Uint8Array(),
    });
    this.keyAgentByChainId.set(chainId, keyAgent);
    await CardanoWalletManager.create({
      chainId,
      passphrase: new Uint8Array(),
    });
  }

  async getKey(chainId: string): Promise<unknown> {
    if (!this.keyAgentByChainId.has(chainId)) {
      const keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords({
        chainId,
        mnemonicWords: [],
        getPassphrase: async () => new Uint8Array(),
      });
      this.keyAgentByChainId.set(chainId, keyAgent);
    }
    return this.keyAgentByChainId.get(chainId);
  }

  async getMetaFromMnemonic(): Promise<Record<string, string>> {
    return {};
  }
}

export const createObservableTransactionsByAddressesProvider = () => ({
  latest$: { subscribe: () => ({ unsubscribe() {} }) },
  stop() {},
});

export const createTxHistoryLoader = () => ({
  load: async () => ({ items: [], mightHaveMore: false }),
  loadMore: async () => ({ items: [], mightHaveMore: false }),
});

export const getTxInputsValueAndAddress = async () => ({
  totalInputCoins: BigInt(0),
  inputAddresses: [],
});

export const parseAssetId = (
  assetId: string
): {
  policyId: string;
  assetName: string;
} => ({
  policyId: assetId.slice(0, 56),
  assetName: assetId.slice(56),
});

export const encodeCardanoUiError = (code: string, message: string): string =>
  `cardano_ui_error:${code}:${message}`;

export const isValidCardanoAddress = (address: string): boolean =>
  typeof address === "string" && address.startsWith("addr");

export const isCardanoChainId = (chainId: string): boolean =>
  typeof chainId === "string" && chainId.includes("cardano");

export type CardanoNetwork = "mainnet" | "preview" | "preprod" | "sanchonet";

export function getCardanoNetworkFromChainId(chainId: string): CardanoNetwork {
  switch (chainId) {
    case "cardano-mainnet":
      return "mainnet";
    case "cardano-preview":
      return "preview";
    case "cardano-preprod":
      return "preprod";
    case "cardano-sanchonet":
      return "sanchonet";
    default:
      throw new Error(`network_context_invalid_chain: ${chainId}`);
  }
}

export function isUsableProjectIdString(
  projectId: string | undefined | null
): boolean {
  const trimmed = projectId?.trim();
  return !!(trimmed && trimmed !== "<API_KEY>" && trimmed !== "undefined");
}

export {
  resolveBlockfrostConfig,
  getBlockfrostConfigSource,
} from "../cardano/src/adapters/blockfrost-config-resolver";
export {
  getBlockfrostChainNameFromNetwork,
  getCardanoNetworkFromBlockfrostChainName,
} from "../cardano/src/utils/blockfrost-network-mapper";
export { resetBlockfrostRateLimitTelemetry } from "../cardano/src/wallet/lib/blockfrost-request-telemetry";

export const getBlockfrostConfigs = () => ({
  mainnet: {
    baseUrl: "https://cardano-mainnet.blockfrost.io/api/v0",
    projectId:
      process.env["BLOCKFROST_PROJECT_ID_MAINNET"] ??
      process.env["BLOCKFROST_API_KEY"] ??
      "",
  },
  preview: {
    baseUrl: "https://cardano-preview.blockfrost.io/api/v0",
    projectId:
      process.env["BLOCKFROST_PROJECT_ID_PREVIEW"] ??
      process.env["BLOCKFROST_API_KEY"] ??
      "",
  },
  preprod: {
    baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
    projectId:
      process.env["BLOCKFROST_PROJECT_ID_PREPROD"] ??
      process.env["BLOCKFROST_API_KEY"] ??
      "",
  },
  sanchonet: {
    baseUrl: "https://cardano-sanchonet.blockfrost.io/api/v0",
    projectId:
      process.env["BLOCKFROST_PROJECT_ID_SANCHONET"] ??
      process.env["BLOCKFROST_API_KEY"] ??
      "",
  },
});

export {
  mapCardanoMinimumViolation,
  formatCardanoMinimumViolationMessage,
  formatLegacyMinimumViolationLovelaceError,
  cardanoMalformedMinimumPayloadError,
  CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD,
} from "../cardano/src/utils/send-minimum-violation";
