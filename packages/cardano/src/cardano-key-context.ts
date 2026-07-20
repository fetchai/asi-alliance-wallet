import { CARDANO_PURPOSE, type Key } from "./cardano-keyring";
import {
  getCardanoChainIdFromNetwork,
  getCardanoNetworkFromChainId,
  type CardanoNetwork,
} from "./utils/network";

/**
 * Offline Cardano key context: InMemoryKeyAgent + deriveAddress only.
 * Must never create CardanoWalletManager, Blockfrost clients, or polling.
 * Independent of background selected-chain / NetworkRuntime lifecycle.
 *
 * Validates only ASI `cardano-*` → Cardano network mapping. Chain registry
 * existence and `features: ["cardano"]` are enforced at the KeyRingService
 * / background service boundary before create/derive is invoked.
 */
export class CardanoKeyContext {
  private constructor(
    private readonly keyAgent: {
      deriveAddress: (
        payment: { index: number; type: number },
        accountIndex: number
      ) => Promise<{ address: string }>;
    },
    private readonly network: CardanoNetwork,
    private readonly chainId: string
  ) {}

  getNetwork(): CardanoNetwork {
    return this.network;
  }

  getChainId(): string {
    return this.chainId;
  }

  static async create(params: {
    mnemonicWords: string[];
    chainId: string;
    accountIndex?: number;
    passphrase?: Uint8Array;
  }): Promise<CardanoKeyContext> {
    const { mnemonicWords, chainId } = params;
    if (!chainId) {
      throw new Error("network_context_missing");
    }
    if (!mnemonicWords?.length) {
      throw new Error("Cardano mnemonic is not available for key context");
    }
    if (mnemonicWords.length !== 24) {
      throw new Error("Cardano requires 24-word mnemonic");
    }

    // Validates ASI cardano-* chain id → network mapping.
    const network = getCardanoNetworkFromChainId(chainId);
    const accountIndex = params.accountIndex ?? 0;
    const passphrase = params.passphrase ?? new Uint8Array();

    const { SodiumBip32Ed25519 } = await import("@cardano-sdk/crypto");
    const { InMemoryKeyAgent } = await import("@cardano-sdk/key-management");
    const cardanoChainId = await getCardanoChainIdFromNetwork(network);
    const bip32Ed25519 = await SodiumBip32Ed25519.create();

    const keyAgent = await InMemoryKeyAgent.fromBip39MnemonicWords(
      {
        mnemonicWords,
        accountIndex,
        purpose: CARDANO_PURPOSE,
        chainId: cardanoChainId,
        getPassphrase: async () => passphrase,
      },
      { bip32Ed25519, logger: console }
    );

    return new CardanoKeyContext(keyAgent, network, chainId);
  }

  async getKey(): Promise<Key> {
    try {
      const addrObj = await this.keyAgent.deriveAddress(
        { index: 0, type: 0 },
        0
      );

      return {
        algo: "cardano_address_only",
        pubKey: new Uint8Array(),
        address: Buffer.from(addrObj.address, "utf8"),
        isNanoLedger: false,
        isKeystone: false,
      };
    } catch (error) {
      console.error("Failed to derive Cardano address:", error);
      throw new Error("Failed to generate Cardano address");
    }
  }
}
