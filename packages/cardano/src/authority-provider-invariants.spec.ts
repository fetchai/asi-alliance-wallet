/**
 * Authority ↔ Blockfrost provider invariants.
 * Production gates: installBlockfrostRequestGuard + lease + keyring getKey.
 */
const mockCreate = jest.fn();

jest.mock("./wallet-manager", () => ({
  CardanoWalletManager: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

jest.mock("@cardano-sdk/crypto", () => ({
  SodiumBip32Ed25519: {
    create: jest.fn(async () => ({})),
  },
}));

jest.mock("@cardano-sdk/key-management", () => ({
  InMemoryKeyAgent: {
    fromBip39MnemonicWords: jest.fn(async () => ({
      deriveAddress: jest.fn(async () => ({ address: "addr1test" })),
      chainId: { networkMagic: 2 },
    })),
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

jest.mock("./adapters/env-adapter", () => ({
  logBlockfrostProviderStatus: jest.fn(),
}));

import { CardanoKeyRing, type KeyStore } from "./cardano-keyring";
import {
  CardanoRuntimeInactiveError,
  createCardanoRuntimeLease,
} from "./runtime-lease";
import { createFakeBlockfrostTransport } from "./test-utils/fake-blockfrost-transport";
import {
  clearBlockfrostRequestGuardForTests,
  installBlockfrostRequestGuard,
  markCardanoRuntimeDisposed,
} from "./wallet/lib/blockfrost-request-guard";

const mnemonic = Array(23).fill("abandon").concat("about").join(" ");

const makeKeyStore = (): KeyStore => ({
  version: "1.2",
  type: "mnemonic",
  key: mnemonic,
  meta: {},
  curve: "secp256k1",
  crypto: {},
});

const makeAuthority = (state: {
  chainId: string | null;
  revision: number | null;
  generation: number;
}) => ({
  getChainId: () => state.chainId,
  getRevision: () => state.revision,
  getRuntimeGeneration: () => state.generation,
});

function wireLease(
  transport: ReturnType<typeof createFakeBlockfrostTransport>,
  lease: ReturnType<typeof createCardanoRuntimeLease>,
  runtimeInstanceId: string
) {
  installBlockfrostRequestGuard({
    blockfrostClient: transport.client as any,
    chainName: "Preprod",
    runtimeInstanceId,
    runtimeLease: lease,
    chainId: lease.chainId,
  });
}

describe("authority-provider invariants", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({
      dispose: jest.fn(),
      getRuntimeStatus: () => "ready",
      hasWallet: () => true,
      getRuntimeInstanceId: () => "rt_mgr",
      markAttached: jest.fn(),
      markDetached: jest.fn(),
      isAttached: () => true,
      isDisposed: () => false,
    });
  });

  afterEach(() => {
    clearBlockfrostRequestGuardForTests();
  });

  describe("network / runtime transitions", () => {
    it("allows provider requests while lease matches authority", async () => {
      const transport = createFakeBlockfrostTransport();
      const state = {
        chainId: "cardano-preprod",
        revision: 1,
        generation: 1,
      };
      const lease = createCardanoRuntimeLease({
        chainId: "cardano-preprod",
        authorityRevision: 1,
        runtimeGeneration: 1,
        authority: makeAuthority(state),
      });
      wireLease(transport, lease, "rt_active");

      await expect(transport.client.request("network")).resolves.toMatchObject({
        ok: true,
      });
      expect(transport.providerCount()).toBe(1);
      expect(transport.sequence).toEqual([1]);
    });

    it("blocks new provider requests after authority chain commit (revoke)", async () => {
      const transport = createFakeBlockfrostTransport();
      const state = {
        chainId: "cardano-preprod",
        revision: 1,
        generation: 1,
      };
      const lease = createCardanoRuntimeLease({
        chainId: "cardano-preprod",
        authorityRevision: 1,
        runtimeGeneration: 1,
        authority: makeAuthority(state),
      });
      wireLease(transport, lease, "rt_switch");

      await transport.client.request("network");
      expect(transport.providerCount()).toBe(1);

      state.chainId = "fetchhub-4";
      state.revision = 2;
      lease.revoke("authority_commit");

      await expect(transport.client.request("utxos")).rejects.toBeInstanceOf(
        CardanoRuntimeInactiveError
      );
      expect(transport.providerCount()).toBe(1);
    });

    it("blocks on revision mismatch without explicit revoke", async () => {
      const transport = createFakeBlockfrostTransport();
      const state = {
        chainId: "cardano-preprod",
        revision: 1,
        generation: 1,
      };
      const lease = createCardanoRuntimeLease({
        chainId: "cardano-preprod",
        authorityRevision: 1,
        runtimeGeneration: 1,
        authority: makeAuthority(state),
      });
      wireLease(transport, lease, "rt_rev_mismatch");

      state.revision = 2;

      await expect(transport.client.request("network")).rejects.toMatchObject({
        reason: "authority_mismatch",
      });
      expect(transport.providerCount()).toBe(0);
    });

    it("blocks on generation mismatch", async () => {
      const transport = createFakeBlockfrostTransport();
      const state = {
        chainId: "cardano-preprod",
        revision: 1,
        generation: 1,
      };
      const lease = createCardanoRuntimeLease({
        chainId: "cardano-preprod",
        authorityRevision: 1,
        runtimeGeneration: 1,
        authority: makeAuthority(state),
      });
      wireLease(transport, lease, "rt_gen_mismatch");

      state.generation = 2;

      await expect(transport.client.request("network")).rejects.toMatchObject({
        reason: "generation_mismatch",
      });
      expect(transport.providerCount()).toBe(0);
    });

    it("blocks when manager runtime is disposed", async () => {
      const transport = createFakeBlockfrostTransport();

      installBlockfrostRequestGuard({
        blockfrostClient: transport.client as any,
        chainName: "Preprod",
        runtimeInstanceId: "rt_disposed_c8",
        chainId: "cardano-preprod",
        runtimeGeneration: 1,
        ownerSwitchGeneration: 1,
      });

      markCardanoRuntimeDisposed("rt_disposed_c8");

      await expect(transport.client.request("network")).rejects.toBeInstanceOf(
        CardanoRuntimeInactiveError
      );
      expect(transport.providerCount()).toBe(0);
    });

    it("new lease after switch can serve; old lease stays dead", async () => {
      const oldTransport = createFakeBlockfrostTransport();
      const newTransport = createFakeBlockfrostTransport();
      const state = {
        chainId: "cardano-preprod",
        revision: 1,
        generation: 1,
      };

      const oldLease = createCardanoRuntimeLease({
        chainId: "cardano-preprod",
        authorityRevision: 1,
        runtimeGeneration: 1,
        authority: makeAuthority(state),
      });
      wireLease(oldTransport, oldLease, "rt_old");

      await oldTransport.client.request("network");
      expect(oldTransport.providerCount()).toBe(1);

      state.chainId = "cardano-mainnet";
      state.revision = 2;
      state.generation = 2;
      oldLease.revoke("authority_commit");

      const newLease = createCardanoRuntimeLease({
        chainId: "cardano-mainnet",
        authorityRevision: 2,
        runtimeGeneration: 2,
        authority: makeAuthority(state),
      });
      wireLease(newTransport, newLease, "rt_new");

      await expect(
        newTransport.client.request("network")
      ).resolves.toMatchObject({ ok: true });
      expect(newTransport.providerCount()).toBe(1);

      await expect(oldTransport.client.request("utxos")).rejects.toBeInstanceOf(
        CardanoRuntimeInactiveError
      );
      expect(oldTransport.providerCount()).toBe(1);
    });
  });

  describe("key-only @ non-Cardano / offline paths", () => {
    it("stale Cardano lease under non-Cardano authority cannot reach rawRequest", async () => {
      const transport = createFakeBlockfrostTransport();
      const state = {
        chainId: "fetchhub-4",
        revision: 5,
        generation: 2,
      };
      // Physical Cardano runtime leftover after authority left Cardano.
      const lease = createCardanoRuntimeLease({
        chainId: "cardano-preprod",
        authorityRevision: 4,
        runtimeGeneration: 1,
        authority: makeAuthority(state),
      });
      wireLease(transport, lease, "rt_stale_non_cardano");

      await expect(transport.client.request("network")).rejects.toBeInstanceOf(
        CardanoRuntimeInactiveError
      );
      expect(transport.providerCount()).toBe(0);
    });

    it("getKey for another Cardano network does not create WalletManager", async () => {
      const keyRing = new CardanoKeyRing();
      await keyRing.restore(
        makeKeyStore(),
        "password",
        undefined,
        "cardano-preprod"
      );
      mockCreate.mockClear();

      const key = await keyRing.getKey("cardano-mainnet");

      expect(Buffer.from(key.address).toString("utf8")).toBe("addr1test");
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("in-flight across authority commit", () => {
    it("forbids new requests after revoke; pre-commit in-flight may complete", async () => {
      const transport = createFakeBlockfrostTransport();
      const state = {
        chainId: "cardano-preprod",
        revision: 1,
        generation: 1,
      };
      const lease = createCardanoRuntimeLease({
        chainId: "cardano-preprod",
        authorityRevision: 1,
        runtimeGeneration: 1,
        authority: makeAuthority(state),
      });
      wireLease(transport, lease, "rt_inflight");

      const deferred = transport.deferNext();
      const inFlight = transport.client.request("network");
      expect(transport.providerCount()).toBe(1);

      lease.revoke("authority_commit");

      await expect(transport.client.request("txs")).rejects.toBeInstanceOf(
        CardanoRuntimeInactiveError
      );
      expect(transport.providerCount()).toBe(1);

      deferred.resolve({ ok: true, late: true });
      await expect(inFlight).resolves.toEqual({ ok: true, late: true });
    });

    it("records monotonic sequence only for raw entries that pass the lease gate", async () => {
      const transport = createFakeBlockfrostTransport();
      const state = {
        chainId: "cardano-preprod",
        revision: 1,
        generation: 1,
      };
      const lease = createCardanoRuntimeLease({
        chainId: "cardano-preprod",
        authorityRevision: 1,
        runtimeGeneration: 1,
        authority: makeAuthority(state),
      });
      wireLease(transport, lease, "rt_seq");

      await transport.client.request("a");
      await transport.client.request("b");
      lease.revoke("test");
      await expect(transport.client.request("c")).rejects.toBeInstanceOf(
        CardanoRuntimeInactiveError
      );

      expect(transport.sequence).toEqual([1, 2]);
      expect(transport.providerCount()).toBe(2);
    });
  });
});
