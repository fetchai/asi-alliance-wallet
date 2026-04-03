import {
  getNativeBridgeModeByChainId,
  type NativeFetBridgeMode,
} from "./native-bridge-mode";

describe("getNativeBridgeModeByChainId", () => {
  const cases: Array<[string, NativeFetBridgeMode]> = [
    ["1", "ethereum"],
    ["fetchhub-4", "fetchhub"],
    ["cardano-mainnet", "none"],
    ["cardano-preview", "none"],
    ["56", "none"],
    ["osmosis-1", "none"],
  ];

  it.each(cases)("chainId %s -> %s", (chainId, expected) => {
    expect(getNativeBridgeModeByChainId(chainId)).toBe(expected);
  });
});
