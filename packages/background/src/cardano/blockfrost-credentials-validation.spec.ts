import {
  assertCardanoNetworkMatchesChainId,
  validateBlockfrostProjectId,
} from "./blockfrost-credentials-validation";
import { getCardanoNetworkFromChainId } from "@keplr-wallet/cardano";

describe("blockfrost credentials validation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("assertCardanoNetworkMatchesChainId rejects mismatch", () => {
    expect(() =>
      assertCardanoNetworkMatchesChainId(
        "cardano-mainnet",
        "preprod",
        getCardanoNetworkFromChainId
      )
    ).toThrow("cardano_network_mismatch");
  });

  it("validateBlockfrostProjectId accepts matching network magic", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ network_magic: 1 }),
    }) as any;

    await expect(
      validateBlockfrostProjectId("valid-key", "preprod")
    ).resolves.toEqual({ ok: true });
  });

  it("validateBlockfrostProjectId treats unreachable as confirmation flow", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("network down"));

    await expect(
      validateBlockfrostProjectId("valid-key", "preprod")
    ).resolves.toEqual({
      ok: false,
      reason: "unreachable",
      requiresConfirmation: true,
    });
  });

  it("validateBlockfrostProjectId flags network mismatch", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ network_magic: 764824073 }),
    }) as any;

    await expect(
      validateBlockfrostProjectId("valid-key", "preprod")
    ).resolves.toEqual({
      ok: false,
      reason: "network_mismatch",
      requiresConfirmation: true,
    });
  });
});
