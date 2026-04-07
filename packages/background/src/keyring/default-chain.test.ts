import {
  getDefaultFallbackChainId,
  PREFERRED_DEFAULT_CHAIN_ID,
} from "./default-chain";

describe("getDefaultFallbackChainId", () => {
  it("prefers fetchhub-4 when present and non-Cardano", () => {
    const chainInfos = [
      { chainId: "cardano-preview", features: ["cardano"] },
      { chainId: PREFERRED_DEFAULT_CHAIN_ID, features: ["cosmos"] },
    ];
    expect(getDefaultFallbackChainId(chainInfos)).toBe(
      PREFERRED_DEFAULT_CHAIN_ID
    );
  });

  it("uses first non-Cardano when preferred id is missing", () => {
    const chainInfos = [
      { chainId: "cardano-preview", features: ["cardano"] },
      { chainId: "other-cosmos", features: [] },
    ];
    expect(getDefaultFallbackChainId(chainInfos)).toBe("other-cosmos");
  });

  it("skips preferred id when that chain is Cardano", () => {
    const chainInfos = [
      {
        chainId: PREFERRED_DEFAULT_CHAIN_ID,
        features: ["cardano"],
      },
      { chainId: "cosmos-net", features: ["cosmos"] },
    ];
    expect(getDefaultFallbackChainId(chainInfos)).toBe("cosmos-net");
  });
});
