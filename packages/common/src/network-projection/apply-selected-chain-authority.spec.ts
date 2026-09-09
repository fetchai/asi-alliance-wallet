import {
  applySelectedChainAuthority,
  shouldPersistLastViewAfterApply,
  type SelectedChainApplyResult,
  type SelectedChainAuthoritySnapshot,
} from "./apply-selected-chain-authority";

describe("applySelectedChainAuthority", () => {
  const current: SelectedChainAuthoritySnapshot = {
    chainId: "fetchhub-4",
    revision: 3,
  };

  it("applies a newer revision", () => {
    expect(
      applySelectedChainAuthority(current, {
        chainId: "dorado-1",
        revision: 4,
      })
    ).toBe("applied");
  });

  it("marks older revision as stale", () => {
    expect(
      applySelectedChainAuthority(current, {
        chainId: "dorado-1",
        revision: 2,
      })
    ).toBe("stale");
  });

  it("treats equal revision and same chain as already-current", () => {
    expect(
      applySelectedChainAuthority(current, {
        chainId: "fetchhub-4",
        revision: 3,
      })
    ).toBe("already-current");
  });

  it("treats equal revision with different chain as protocol-violation", () => {
    expect(
      applySelectedChainAuthority(current, {
        chainId: "dorado-1",
        revision: 3,
      })
    ).toBe("protocol-violation");
  });

  it("rejects invalid revisions", () => {
    expect(
      applySelectedChainAuthority(current, {
        chainId: "dorado-1",
        revision: 0,
      })
    ).toBe("stale");
    expect(
      applySelectedChainAuthority(current, {
        chainId: "dorado-1",
        revision: Number.NaN,
      })
    ).toBe("stale");
  });
});

describe("shouldPersistLastViewAfterApply", () => {
  const cases: Array<[SelectedChainApplyResult, boolean]> = [
    ["applied", true],
    ["already-current", true],
    ["stale", false],
    ["protocol-violation", false],
  ];

  it.each(cases)("%s -> %s", (result, expected) => {
    expect(shouldPersistLastViewAfterApply(result)).toBe(expected);
  });
});
