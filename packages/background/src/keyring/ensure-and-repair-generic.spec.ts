import { WEBPAGE_PORT } from "@keplr-wallet/router";
import { KeyRingService } from "./service";
import type { KeyStoreMetaKnown } from "./types";

describe("KeyRingService.resolveGenericWalletNameForChain", () => {
  it("prefers nameByChain over legacy name", () => {
    const name = KeyRingService["resolveGenericWalletNameForChain"](
      {
        __id__: "w1",
        name: "Legacy",
        nameByChain: JSON.stringify({ "fetchhub-4": "Fetch Name" }),
      } as KeyStoreMetaKnown,
      "fetchhub-4"
    );
    expect(name).toBe("Fetch Name");
  });
});

describe("KeyRingService.ensureAndRepairAddressCaches generic path", () => {
  const evmAddressHex = "abcdef0123456789abcdef0123456789abcdef01";
  const evmAddressBytes = Buffer.from(evmAddressHex, "hex");
  const cosmosAddressHex = "aabbccdd";

  function makeService(overrides?: {
    consistency?: { isConsistent: boolean; issues: string[] };
    cache?: Record<string, unknown>;
    chainId?: string;
    features?: string[];
  }) {
    const chainId = overrides?.chainId ?? "evmos_9001-2";
    const checkConsistency = jest
      .fn()
      .mockResolvedValue(
        overrides?.consistency ?? { isConsistent: true, issues: [] }
      );
    const saveGenericChainCache = jest.fn().mockResolvedValue(undefined);
    const clearAllAddressCaches = jest.fn().mockResolvedValue(undefined);
    const loadGenericChainCache = jest.fn().mockResolvedValue(
      overrides?.cache ?? {
        w1: {
          address:
            overrides?.chainId === "fetchhub-4"
              ? cosmosAddressHex
              : evmAddressHex,
          name: "Wallet 1",
          pubKey: "11",
        },
      }
    );
    const dispatchEvent = jest.fn();

    const service = Object.create(KeyRingService.prototype) as KeyRingService;
    Object.assign(service, {
      chainsService: {
        getChainInfo: jest.fn().mockResolvedValue({
          bech32Config: { bech32PrefixAccAddr: "fetch" },
          features: overrides?.features ?? ["evm"],
        }),
      },
      keyRing: {
        addressCacheManager: {
          hasPassword: () => true,
          checkConsistency,
        },
        getMultiKeyStoreInfo: () => [
          {
            selected: true,
            meta: {
              __id__: "w1",
              name: "Wallet 1",
            },
          },
        ],
        loadGenericChainCache,
        saveGenericChainCache,
        clearAllAddressCaches,
      },
      interactionService: { dispatchEvent },
    });

    return {
      service,
      chainId,
      checkConsistency,
      saveGenericChainCache,
      clearAllAddressCaches,
      dispatchEvent,
    };
  }

  it("passes canonical hex to generic consistency check (EVM)", async () => {
    const { service, checkConsistency } = makeService();
    await (service as any).ensureAndRepairAddressCaches(
      "evmos_9001-2",
      [
        {
          name: "Wallet 1",
          algo: "ethsecp256k1",
          address: evmAddressBytes,
          pubKey: Buffer.from("aa", "hex"),
        },
      ],
      { isCardano: false, isEvm: true }
    );

    expect(checkConsistency).toHaveBeenCalledWith(
      "evmos_9001-2",
      ["w1"],
      ["Wallet 1"],
      "w1",
      evmAddressHex,
      false
    );
  });

  it("passes raw hex for Cosmos/Fetchhub consistency check (not bech32)", async () => {
    const { service, checkConsistency } = makeService({
      chainId: "fetchhub-4",
      features: [],
      cache: {
        w1: {
          address: cosmosAddressHex,
          name: "Wallet 1",
          pubKey: "11",
        },
      },
    });

    await (service as any).ensureAndRepairAddressCaches(
      "fetchhub-4",
      [
        {
          name: "Wallet 1",
          algo: "secp256k1",
          address: Buffer.from(cosmosAddressHex, "hex"),
          pubKey: Buffer.from("cc", "hex"),
        },
      ],
      { isCardano: false, isEvm: false }
    );

    expect(checkConsistency).toHaveBeenCalledWith(
      "fetchhub-4",
      ["w1"],
      ["Wallet 1"],
      "w1",
      cosmosAddressHex,
      false
    );
  });

  it("uses nameByChain for generic consistency check", async () => {
    const { service, checkConsistency } = makeService({
      chainId: "fetchhub-4",
      features: [],
      cache: {
        w1: {
          address: cosmosAddressHex,
          name: "Fetch Name",
          pubKey: "11",
        },
      },
    });
    (service as any).keyRing.getMultiKeyStoreInfo = () => [
      {
        selected: true,
        meta: {
          __id__: "w1",
          name: "Legacy",
          nameByChain: JSON.stringify({ "fetchhub-4": "Fetch Name" }),
        },
      },
    ];

    await (service as any).ensureAndRepairAddressCaches(
      "fetchhub-4",
      [
        {
          name: "Fetch Name",
          algo: "secp256k1",
          address: Buffer.from(cosmosAddressHex, "hex"),
          pubKey: Buffer.from("cc", "hex"),
        },
      ],
      { isCardano: false, isEvm: false }
    );

    expect(checkConsistency).toHaveBeenCalledWith(
      "fetchhub-4",
      ["w1"],
      ["Fetch Name"],
      "w1",
      cosmosAddressHex,
      false
    );
  });

  it("does not repair when populated generic cache is consistent", async () => {
    const {
      service,
      saveGenericChainCache,
      clearAllAddressCaches,
      dispatchEvent,
    } = makeService();

    await (service as any).ensureAndRepairAddressCaches(
      "evmos_9001-2",
      [
        {
          name: "Wallet 1",
          algo: "ethsecp256k1",
          address: evmAddressBytes,
          pubKey: Buffer.from("aa", "hex"),
        },
      ],
      { isCardano: false, isEvm: true }
    );

    expect(saveGenericChainCache).not.toHaveBeenCalled();
    expect(clearAllAddressCaches).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("runs unified repair on true generic inconsistency", async () => {
    const chainId = "evmos_9001-2";
    const {
      service,
      saveGenericChainCache,
      clearAllAddressCaches,
      dispatchEvent,
    } = makeService({
      consistency: { isConsistent: false, issues: ["address mismatch"] },
      chainId,
    });

    await (service as any).ensureAndRepairAddressCaches(
      chainId,
      [
        {
          name: "Wallet 1",
          algo: "ethsecp256k1",
          address: evmAddressBytes,
          pubKey: Buffer.from("aa", "hex"),
        },
      ],
      { isCardano: false, isEvm: true }
    );

    expect(clearAllAddressCaches).toHaveBeenCalledTimes(1);
    expect(saveGenericChainCache).toHaveBeenCalledWith(
      chainId,
      expect.any(Object)
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      WEBPAGE_PORT,
      "clear-cache",
      expect.objectContaining({
        seq: expect.any(Number),
      })
    );
  });
});
