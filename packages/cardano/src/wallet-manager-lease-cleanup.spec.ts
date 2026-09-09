jest.mock("@cardano-sdk/crypto", () => ({
  SodiumBip32Ed25519: {
    create: jest.fn(async () => ({})),
  },
}));

jest.mock("@cardano-sdk/key-management", () => ({
  InMemoryKeyAgent: {
    fromBip39MnemonicWords: jest.fn(async () => ({
      chainId: { networkMagic: 2 },
    })),
  },
  util: {
    createAsyncKeyAgent: jest.fn((agent) => agent),
    createBip32Ed25519Witnesser: jest.fn(() => ({})),
  },
  Bip32Account: {
    fromAsyncKeyAgent: jest.fn(async () => ({})),
  },
}));

jest.mock("@cardano-sdk/core", () => ({
  Cardano: {
    ChainIds: {
      Mainnet: { networkMagic: 1 },
      Preprod: { networkMagic: 2 },
      Preview: { networkMagic: 3 },
      Sanchonet: { networkMagic: 4 },
    },
  },
}));

const mockShutdown = jest.fn();
const mockCreatePersonalWallet = jest.fn(() => ({
  shutdown: mockShutdown,
}));

jest.mock("@cardano-sdk/wallet", () => ({
  createPersonalWallet: (...args: unknown[]) =>
    (mockCreatePersonalWallet as (...a: unknown[]) => unknown)(...args),
  storage: {
    createInMemoryWalletStores: jest.fn(() => ({})),
  },
  DEFAULT_POLLING_CONFIG: { interval: 1000 },
}));

jest.mock("./wallet/lib/providers", () => ({
  createBlockfrostProviders: jest.fn(() => ({
    assetProvider: {},
    networkInfoProvider: {},
    txSubmitProvider: {},
    stakePoolProvider: {},
    utxoProvider: {},
    chainHistoryProvider: {},
    rewardAccountInfoProvider: {},
    rewardsProvider: {},
    addressDiscovery: {},
  })),
}));

import { CardanoWalletManager } from "./wallet-manager";
import {
  CardanoRuntimeInactiveError,
  createCardanoRuntimeLease,
} from "./runtime-lease";

const mnemonicWords = [
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "abandon",
  "about",
];

describe("CardanoWalletManager lease cleanup", () => {
  const previousTelemetry = process.env["CARDANO_RUNTIME_TELEMETRY"];

  beforeEach(() => {
    jest.clearAllMocks();
    // Guard must work with debug telemetry disabled.
    process.env["CARDANO_RUNTIME_TELEMETRY"] = "0";
    mockCreatePersonalWallet.mockImplementation(() => ({
      shutdown: mockShutdown,
    }));
  });

  afterAll(() => {
    if (previousTelemetry === undefined) {
      delete process.env["CARDANO_RUNTIME_TELEMETRY"];
    } else {
      process.env["CARDANO_RUNTIME_TELEMETRY"] = previousTelemetry;
    }
  });

  it("shutdowns personal wallet when lease is revoked after createPersonalWallet", async () => {
    const state = {
      chainId: "cardano-preprod" as string | null,
      revision: 1 as number | null,
      generation: 1,
    };
    const lease = createCardanoRuntimeLease({
      chainId: "cardano-preprod",
      authorityRevision: 1,
      runtimeGeneration: 1,
      authority: {
        getChainId: () => state.chainId,
        getRevision: () => state.revision,
        getRuntimeGeneration: () => state.generation,
      },
    });

    mockCreatePersonalWallet.mockImplementation(() => {
      // Authority moved immediately after wallet construction.
      lease.revoke("authority_commit");
      state.generation = 2;
      state.chainId = "fetchhub-4";
      state.revision = 2;
      return { shutdown: mockShutdown };
    });

    await expect(
      CardanoWalletManager.create({
        mnemonicWords,
        network: "preprod",
        blockfrostConfig: {
          baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
          projectId: "test-project-id",
        },
        runtimeLease: lease,
        chainId: "cardano-preprod",
        runtimeGeneration: 1,
        ownerSwitchGeneration: 1,
      })
    ).rejects.toBeInstanceOf(CardanoRuntimeInactiveError);

    expect(mockCreatePersonalWallet).toHaveBeenCalledTimes(1);
    expect(mockShutdown).toHaveBeenCalledTimes(1);
  });
});
