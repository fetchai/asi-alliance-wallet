import {
  pickFallbackWhenHidingChains,
  toChainIdentifierSet,
} from "./chain-ui-visibility";

describe("pickFallbackWhenHidingChains", () => {
  it("does not pick a chain that is being hidden by full chain id", () => {
    const fallback = pickFallbackWhenHidingChains(
      ["fetchhub-4", "dorado-1", "asi-devnet-1"],
      ["dorado-1", "asi-devnet-1"]
    );
    expect(fallback).toBe("fetchhub-4");
  });

  it("matches hide list by identifier when visible list uses versioned ids", () => {
    const fallback = pickFallbackWhenHidingChains(
      ["fetchhub-4", "dorado-1"],
      ["dorado"]
    );
    expect(fallback).toBe("fetchhub-4");
  });

  it("returns undefined when every visible chain is hidden", () => {
    expect(
      pickFallbackWhenHidingChains(
        ["dorado-1", "asi-devnet-1"],
        ["dorado-1", "asi-devnet-1"]
      )
    ).toBeUndefined();
  });
});

describe("toChainIdentifierSet", () => {
  it("normalizes full chain ids to identifiers", () => {
    const set = toChainIdentifierSet(["dorado-1", "fetchhub-4"]);
    expect(set.has("dorado")).toBe(true);
    expect(set.has("fetchhub")).toBe(true);
    expect(set.has("dorado-1")).toBe(false);
  });
});
