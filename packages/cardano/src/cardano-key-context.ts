import { CARDANO_PURPOSE, type Key } from "./cardano-keyring";
import {
  getCardanoChainIdFromNetwork,
  getCardanoNetworkFromChainId,
  type CardanoNetwork,
} from "./utils/network";

export const CARDANO_KEY_CONTEXT_DEADLINE_MS = 10_000;
export const CARDANO_KEY_CONTEXT_TIMEOUT_CODE = "cardano_key_context_timeout";

export class CardanoKeyContextTimeoutError extends Error {
  readonly code = CARDANO_KEY_CONTEXT_TIMEOUT_CODE;

  constructor(readonly timeoutMs: number) {
    super(`Cardano key context timed out after ${timeoutMs}ms`);
    this.name = "CardanoKeyContextTimeoutError";
    Object.setPrototypeOf(this, CardanoKeyContextTimeoutError.prototype);
  }
}

export function isCardanoKeyContextTimeoutError(
  error: unknown
): error is CardanoKeyContextTimeoutError {
  return (
    error instanceof CardanoKeyContextTimeoutError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === CARDANO_KEY_CONTEXT_TIMEOUT_CODE)
  );
}

type SodiumBip32Ed25519Provider = Awaited<
  ReturnType<
    typeof import("@cardano-sdk/crypto")["SodiumBip32Ed25519"]["create"]
  >
>;

let sodiumBip32Ed25519Provider: SodiumBip32Ed25519Provider | undefined;
let sodiumBip32Ed25519Flight: Promise<SodiumBip32Ed25519Provider> | undefined;

/**
 * Process-scoped provider single-flight. It owns only the stateless Sodium
 * provider; mnemonic words, passphrases, and wallet key agents stay per-call.
 */
async function getSodiumBip32Ed25519Provider(): Promise<SodiumBip32Ed25519Provider> {
  if (sodiumBip32Ed25519Provider) {
    return sodiumBip32Ed25519Provider;
  }
  if (sodiumBip32Ed25519Flight) {
    return sodiumBip32Ed25519Flight;
  }

  const flight = import("@cardano-sdk/crypto").then(({ SodiumBip32Ed25519 }) =>
    SodiumBip32Ed25519.create()
  );
  sodiumBip32Ed25519Flight = flight;
  flight.then(
    (provider) => {
      if (sodiumBip32Ed25519Flight === flight) {
        sodiumBip32Ed25519Provider = provider;
        sodiumBip32Ed25519Flight = undefined;
      }
    },
    () => {
      if (sodiumBip32Ed25519Flight === flight) {
        sodiumBip32Ed25519Flight = undefined;
      }
    }
  );
  return flight;
}

export type CardanoKeyContextDerivation = {
  /** Settles only when the underlying, non-cancellable SDK work settles. */
  completion: Promise<Key>;
  /** Bounded caller view of completion. */
  result: Promise<Key>;
};

function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let callerSettled = false;
    const timer = setTimeout(() => {
      if (!callerSettled) {
        callerSettled = true;
        reject(new CardanoKeyContextTimeoutError(timeoutMs));
      }
    }, timeoutMs);
    (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();

    operation.then(
      (value) => {
        if (!callerSettled) {
          callerSettled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      (error) => {
        if (!callerSettled) {
          callerSettled = true;
          clearTimeout(timer);
          reject(error);
        }
      }
    );
  });
}

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

    const [{ InMemoryKeyAgent }, cardanoChainId, bip32Ed25519] =
      await Promise.all([
        import("@cardano-sdk/key-management"),
        getCardanoChainIdFromNetwork(network),
        getSodiumBip32Ed25519Provider(),
      ]);

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

  /**
   * Starts one bounded offline address derivation while preserving an owned
   * completion promise for SDK calls that cannot be cancelled.
   */
  static derive(
    params: {
      mnemonicWords: string[];
      chainId: string;
      accountIndex?: number;
      passphrase?: Uint8Array;
    },
    timeoutMs = CARDANO_KEY_CONTEXT_DEADLINE_MS
  ): CardanoKeyContextDerivation {
    const completion = (async () => {
      const context = await CardanoKeyContext.create(params);
      return await context.getKey();
    })();

    return {
      completion,
      result: withDeadline(completion, timeoutMs),
    };
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

/** Test-only reset; production callers must keep the process-wide provider. */
export function resetCardanoKeyContextProviderForTests(): void {
  sodiumBip32Ed25519Provider = undefined;
  sodiumBip32Ed25519Flight = undefined;
}
