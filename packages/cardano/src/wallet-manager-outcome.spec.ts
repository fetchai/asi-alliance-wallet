let mockValidateOutputs: jest.Mock;

jest.mock("@cardano-sdk/core", () => ({
  Cardano: {
    Address: {
      fromString: () => ({
        getNetworkId: () => 0,
      }),
    },
    PaymentAddress: (addr: string) => addr,
    NetworkMagics: { Mainnet: 1 },
    NetworkId: { Mainnet: 1 },
    Slot: (n: number) => n,
  },
}));

jest.mock("@cardano-sdk/wallet", () => ({
  createWalletUtil: () => ({
    validateOutputs: mockValidateOutputs,
  }),
}));

jest.mock("./wallet/lib/build-transaction-props", () => ({
  buildTransactionProps: ({ outputsMap }: { outputsMap: Map<string, any> }) => {
    const out = outputsMap.get("output1");
    return {
      outputs: new Set([
        {
          address: out.address,
          value: { coins: BigInt(out.value.coins), assets: out.value.assets },
        },
      ]),
    };
  },
}));

import { CardanoWalletManager } from "./wallet-manager";

describe("CardanoWalletManager buildSendAdaTxDraftOutcome", () => {
  beforeEach(() => {
    mockValidateOutputs = jest.fn();
  });

  it("uses real validateOutputs path and returns minimum_violation for ADA-only amount=0", async () => {
    const manager = Object.create(CardanoWalletManager.prototype) as any;
    manager.wallet = {};
    manager.keyAgent = { chainId: { networkMagic: 0 } };
    mockValidateOutputs.mockImplementation(async (outputs: Set<any>) => {
      const out = [...outputs][0];
      return new Map([
        [
          out,
          {
            minimumCoin: BigInt(970000),
            coinMissing: BigInt(969999),
          },
        ],
      ]);
    });

    const res = await manager.buildSendAdaTxDraftOutcome({
      to: "addr_test1qpmockvalid0000000000000000000000000000000000000000000000",
      amount: "0",
    });

    expect(res).toEqual({
      kind: "minimum_violation",
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });
    expect(mockValidateOutputs).toHaveBeenCalledTimes(1);
  });

  it("returns draft outcome when no minimum violation", async () => {
    const manager = Object.create(CardanoWalletManager.prototype) as any;
    manager.wallet = {};
    manager.prepareSendTransactionValidatedOutputs = jest.fn(async () => ({
      sdkAssets: undefined,
      outputs: ["o1"],
      minimumCoinQuantities: new Map([
        [
          "o1",
          {
            minimumCoin: BigInt(1000000),
            coinMissing: BigInt(0),
          },
        ],
      ]),
    }));
    manager.buildSendTransactionFromPrepared = jest.fn(async () => ({
      tx: { id: "tx" },
      fee: "170000",
      minAdaForTokens: "0",
    }));

    const res = await manager.buildSendAdaTxDraftOutcome({
      to: "addr_test1qrecipient",
      amount: "1000000",
    });

    expect(res).toEqual({
      kind: "draft",
      tx: { id: "tx" },
      fee: "170000",
      total: "1170000",
      minAdaForTokens: "0",
    });
  });

  it("does not classify as ADA-only minimum_violation when assets are present", async () => {
    const manager = Object.create(CardanoWalletManager.prototype) as any;
    manager.wallet = {};
    manager.prepareSendTransactionValidatedOutputs = jest.fn(async () => ({
      sdkAssets: new Map([["policy.asset", BigInt(1)]]),
      outputs: ["o1"],
      minimumCoinQuantities: new Map([
        [
          "o1",
          {
            minimumCoin: BigInt(970000),
            coinMissing: BigInt(969999),
          },
        ],
      ]),
      coinsBefore: BigInt(0),
      partialTxProps: {},
    }));
    manager.buildSendTransactionFromPrepared = jest.fn(async () => ({
      tx: { id: "tx-assets" },
      fee: "170000",
      minAdaForTokens: "970000",
    }));

    const res = await manager.buildSendAdaTxDraftOutcome({
      to: "addr_test1qrecipient",
      amount: "0",
      assets: new Map([["policy.asset", "1"]]),
    });

    expect(res.kind).toBe("draft");
    if (res.kind === "draft") {
      expect(res.minAdaForTokens).toBe("970000");
      expect(res.total).toBe("1140000");
    }
  });
});

