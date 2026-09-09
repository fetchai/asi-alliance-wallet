jest.mock("@cardano-sdk/crypto", () => ({
  SodiumBip32Ed25519: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("@cardano-sdk/key-management", () => ({
  InMemoryKeyAgent: {
    fromBip39MnemonicWords: jest.fn(),
  },
}));

jest.mock("@cardano-sdk/core", () => ({
  Cardano: {
    ChainIds: {
      Mainnet: { networkId: 1 },
      Preprod: { networkId: 0 },
      Preview: { networkId: 0 },
      Sanchonet: { networkId: 0 },
    },
  },
}));

import { SodiumBip32Ed25519 } from "@cardano-sdk/crypto";
import { InMemoryKeyAgent } from "@cardano-sdk/key-management";
import {
  CardanoKeyContext,
  CardanoKeyContextTimeoutError,
  resetCardanoKeyContextProviderForTests,
} from "./cardano-key-context";
import * as walletManagerModule from "./wallet-manager";

const MNEMONIC_24 = Array.from({ length: 24 }, (_, i) => `word${i}`).join(" ");

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe("CardanoKeyContext", () => {
  beforeEach(() => {
    resetCardanoKeyContextProviderForTests();
    jest.clearAllMocks();
    (SodiumBip32Ed25519.create as jest.Mock).mockResolvedValue({
      provider: "default",
    });
    (InMemoryKeyAgent.fromBip39MnemonicWords as jest.Mock).mockResolvedValue({
      deriveAddress: jest
        .fn()
        .mockResolvedValue({ address: "addr_test1_offline" }),
    });
  });

  it("derives address without creating CardanoWalletManager", async () => {
    const createSpy = jest
      .spyOn(walletManagerModule.CardanoWalletManager, "create")
      .mockImplementation(() => {
        throw new Error(
          "CardanoWalletManager.create must not run for KeyContext"
        );
      });

    try {
      const ctx = await CardanoKeyContext.create({
        mnemonicWords: MNEMONIC_24.trim().split(/\s+/),
        chainId: "cardano-preprod",
        accountIndex: 0,
      });

      const key = await ctx.getKey();

      expect(key.algo).toBe("cardano_address_only");
      expect(Buffer.from(key.address).toString("utf8")).toBe(
        "addr_test1_offline"
      );
      expect(createSpy).not.toHaveBeenCalled();
      expect(InMemoryKeyAgent.fromBip39MnemonicWords).toHaveBeenCalledTimes(1);
    } finally {
      createSpy.mockRestore();
    }
  });

  it("rejects non-cardano / unknown chainId", async () => {
    await expect(
      CardanoKeyContext.create({
        mnemonicWords: MNEMONIC_24.trim().split(/\s+/),
        chainId: "cosmoshub-4",
      })
    ).rejects.toThrow(/network_context_invalid_chain/);
  });

  it("rejects non-24-word mnemonic", async () => {
    await expect(
      CardanoKeyContext.create({
        mnemonicWords: ["one", "two"],
        chainId: "cardano-mainnet",
      })
    ).rejects.toThrow("Cardano requires 24-word mnemonic");
  });

  it("single-flights concurrent Sodium initialization while keeping wallet agents separate", async () => {
    const providerGate = deferred<any>();
    const provider = { provider: "shared" };
    const firstAgent = {
      deriveAddress: jest
        .fn()
        .mockResolvedValue({ address: "addr_test1_wallet_1" }),
    };
    const secondAgent = {
      deriveAddress: jest
        .fn()
        .mockResolvedValue({ address: "addr_test1_wallet_2" }),
    };
    (SodiumBip32Ed25519.create as jest.Mock).mockReturnValue(
      providerGate.promise
    );
    (InMemoryKeyAgent.fromBip39MnemonicWords as jest.Mock)
      .mockResolvedValueOnce(firstAgent)
      .mockResolvedValueOnce(secondAgent);

    const first = CardanoKeyContext.create({
      mnemonicWords: MNEMONIC_24.split(" "),
      chainId: "cardano-preprod",
      accountIndex: 0,
    });
    const second = CardanoKeyContext.create({
      mnemonicWords: MNEMONIC_24.split(" "),
      chainId: "cardano-preprod",
      accountIndex: 1,
    });
    await flushMicrotasks();

    expect(SodiumBip32Ed25519.create).toHaveBeenCalledTimes(1);
    expect(InMemoryKeyAgent.fromBip39MnemonicWords).not.toHaveBeenCalled();

    providerGate.resolve(provider);
    const [firstContext, secondContext] = await Promise.all([first, second]);
    const [firstKey, secondKey] = await Promise.all([
      firstContext.getKey(),
      secondContext.getKey(),
    ]);

    expect(InMemoryKeyAgent.fromBip39MnemonicWords).toHaveBeenCalledTimes(2);
    expect(
      (InMemoryKeyAgent.fromBip39MnemonicWords as jest.Mock).mock.calls[0][1]
        .bip32Ed25519
    ).toBe(provider);
    expect(
      (InMemoryKeyAgent.fromBip39MnemonicWords as jest.Mock).mock.calls[1][1]
        .bip32Ed25519
    ).toBe(provider);
    expect(firstAgent).not.toBe(secondAgent);
    expect(Buffer.from(firstKey.address).toString("utf8")).toBe(
      "addr_test1_wallet_1"
    );
    expect(Buffer.from(secondKey.address).toString("utf8")).toBe(
      "addr_test1_wallet_2"
    );
  });

  it("reuses one successful provider for sequential wallet derivations", async () => {
    const provider = { provider: "reused" };
    (SodiumBip32Ed25519.create as jest.Mock).mockResolvedValue(provider);
    (InMemoryKeyAgent.fromBip39MnemonicWords as jest.Mock).mockImplementation(
      async (params: { accountIndex: number }) => ({
        deriveAddress: jest.fn().mockResolvedValue({
          address: `addr_test1_account_${params.accountIndex}`,
        }),
      })
    );

    const first = await CardanoKeyContext.derive({
      mnemonicWords: MNEMONIC_24.split(" "),
      chainId: "cardano-preprod",
      accountIndex: 0,
    }).result;
    const second = await CardanoKeyContext.derive({
      mnemonicWords: MNEMONIC_24.split(" "),
      chainId: "cardano-preprod",
      accountIndex: 1,
    }).result;

    expect(SodiumBip32Ed25519.create).toHaveBeenCalledTimes(1);
    expect(InMemoryKeyAgent.fromBip39MnemonicWords).toHaveBeenCalledTimes(2);
    expect(Buffer.from(first.address).toString("utf8")).toBe(
      "addr_test1_account_0"
    );
    expect(Buffer.from(second.address).toString("utf8")).toBe(
      "addr_test1_account_1"
    );
  });

  it("clears a rejected initialization flight without retrying the same operation", async () => {
    const initializationError = new Error("sodium initialization failed");
    (SodiumBip32Ed25519.create as jest.Mock).mockRejectedValueOnce(
      initializationError
    );

    const first = CardanoKeyContext.create({
      mnemonicWords: MNEMONIC_24.split(" "),
      chainId: "cardano-preprod",
    });
    const second = CardanoKeyContext.create({
      mnemonicWords: MNEMONIC_24.split(" "),
      chainId: "cardano-preprod",
      accountIndex: 1,
    });
    const failed = await Promise.allSettled([first, second]);

    expect(failed).toEqual([
      { status: "rejected", reason: initializationError },
      { status: "rejected", reason: initializationError },
    ]);
    expect(SodiumBip32Ed25519.create).toHaveBeenCalledTimes(1);
    expect(InMemoryKeyAgent.fromBip39MnemonicWords).not.toHaveBeenCalled();

    (SodiumBip32Ed25519.create as jest.Mock).mockResolvedValueOnce({
      provider: "retry-from-new-operation",
    });
    await expect(
      CardanoKeyContext.create({
        mnemonicWords: MNEMONIC_24.split(" "),
        chainId: "cardano-preprod",
      })
    ).resolves.toBeInstanceOf(CardanoKeyContext);
    expect(SodiumBip32Ed25519.create).toHaveBeenCalledTimes(2);
  });

  it("times out a hung initialization without clearing its single-flight", async () => {
    jest.useFakeTimers();
    const providerGate = deferred<any>();
    (SodiumBip32Ed25519.create as jest.Mock).mockReturnValue(
      providerGate.promise
    );

    try {
      const first = CardanoKeyContext.derive(
        {
          mnemonicWords: MNEMONIC_24.split(" "),
          chainId: "cardano-preprod",
        },
        1_000
      );
      await flushMicrotasks();
      jest.advanceTimersByTime(1_000);
      await expect(first.result).rejects.toBeInstanceOf(
        CardanoKeyContextTimeoutError
      );

      const second = CardanoKeyContext.derive(
        {
          mnemonicWords: MNEMONIC_24.split(" "),
          chainId: "cardano-preprod",
          accountIndex: 1,
        },
        1_000
      );
      await flushMicrotasks();
      expect(SodiumBip32Ed25519.create).toHaveBeenCalledTimes(1);

      providerGate.resolve({ provider: "late" });
      await expect(
        Promise.all([first.completion, second.result])
      ).resolves.toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("times out a hung wallet-specific key-agent creation", async () => {
    jest.useFakeTimers();
    const keyAgentGate = deferred<any>();
    (InMemoryKeyAgent.fromBip39MnemonicWords as jest.Mock).mockReturnValue(
      keyAgentGate.promise
    );

    try {
      const derivation = CardanoKeyContext.derive(
        {
          mnemonicWords: MNEMONIC_24.split(" "),
          chainId: "cardano-preprod",
        },
        1_000
      );
      await flushMicrotasks();
      expect(InMemoryKeyAgent.fromBip39MnemonicWords).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1_000);
      await expect(derivation.result).rejects.toBeInstanceOf(
        CardanoKeyContextTimeoutError
      );

      keyAgentGate.resolve({
        deriveAddress: jest
          .fn()
          .mockResolvedValue({ address: "addr_test1_late_agent" }),
      });
      await expect(derivation.completion).resolves.toMatchObject({
        algo: "cardano_address_only",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("times out a hung address derivation while retaining completion ownership", async () => {
    jest.useFakeTimers();
    const addressGate = deferred<{ address: string }>();
    (InMemoryKeyAgent.fromBip39MnemonicWords as jest.Mock).mockResolvedValue({
      deriveAddress: jest.fn().mockReturnValue(addressGate.promise),
    });

    try {
      const derivation = CardanoKeyContext.derive(
        {
          mnemonicWords: MNEMONIC_24.split(" "),
          chainId: "cardano-preprod",
        },
        1_000
      );
      await flushMicrotasks();

      jest.advanceTimersByTime(1_000);
      await expect(derivation.result).rejects.toBeInstanceOf(
        CardanoKeyContextTimeoutError
      );

      addressGate.resolve({ address: "addr_test1_late_address" });
      await expect(derivation.completion).resolves.toMatchObject({
        address: Buffer.from("addr_test1_late_address", "utf8"),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
