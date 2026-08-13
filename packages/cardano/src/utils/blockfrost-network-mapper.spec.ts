import {
  getBlockfrostChainNameFromChainId,
  getBlockfrostChainNameFromNetwork,
  getCardanoNetworkFromBlockfrostChainName,
} from "./blockfrost-network-mapper";

describe("blockfrost-network-mapper", () => {
  it("maps CardanoNetwork to Blockfrost chainName", () => {
    expect(getBlockfrostChainNameFromNetwork("mainnet")).toBe("Mainnet");
    expect(getBlockfrostChainNameFromNetwork("preprod")).toBe("Preprod");
    expect(getBlockfrostChainNameFromNetwork("preview")).toBe("Preview");
    expect(getBlockfrostChainNameFromNetwork("sanchonet")).toBe("Sanchonet");
  });

  it("maps chainName back to CardanoNetwork", () => {
    expect(getCardanoNetworkFromBlockfrostChainName("Mainnet")).toBe("mainnet");
    expect(getCardanoNetworkFromBlockfrostChainName("Preprod")).toBe("preprod");
    expect(getCardanoNetworkFromBlockfrostChainName("Preview")).toBe("preview");
    expect(getCardanoNetworkFromBlockfrostChainName("Sanchonet")).toBe(
      "sanchonet"
    );
  });

  it("maps chainId networkMagic to chainName", async () => {
    const { Cardano } = await import("@cardano-sdk/core");

    await expect(
      getBlockfrostChainNameFromChainId({
        networkMagic: Cardano.NetworkMagics.Mainnet,
      })
    ).resolves.toBe("Mainnet");
    await expect(
      getBlockfrostChainNameFromChainId({
        networkMagic: Cardano.NetworkMagics.Preprod,
      })
    ).resolves.toBe("Preprod");
    await expect(
      getBlockfrostChainNameFromChainId({
        networkMagic: Cardano.NetworkMagics.Preview,
      })
    ).resolves.toBe("Preview");
    await expect(
      getBlockfrostChainNameFromChainId({
        networkMagic: Cardano.NetworkMagics.Sanchonet,
      })
    ).resolves.toBe("Sanchonet");
    await expect(
      getBlockfrostChainNameFromChainId({
        networkMagic: 999999,
      })
    ).resolves.toBeUndefined();
  });
});
