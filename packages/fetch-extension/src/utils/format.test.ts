import { formatDisplayAmount } from "./format";

describe("formatDisplayAmount", () => {
  it("keeps explicit contract output for 1.230000 -> 1.23", () => {
    expect(formatDisplayAmount("1.230000", { coinDecimals: 18 })).toBe("1.23");
  });

  it("keeps explicit contract output for 0.000999999 -> 0.001", () => {
    expect(formatDisplayAmount("0.000999999", { coinDecimals: 18 })).toBe(
      "0.001"
    );
  });

  it("never renders tiny non-zero value as zero", () => {
    expect(formatDisplayAmount("0.00000000012345", { coinDecimals: 18 })).not.toBe(
      "0"
    );
    expect(formatDisplayAmount("0.00000000012345", { coinDecimals: 18 })).toBe(
      "0.000000000123"
    );
  });

  it("keeps tiny non-zero visible with low maxDecimals", () => {
    expect(
      formatDisplayAmount("0.00000000012345", {
        coinDecimals: 18,
        maxDecimals: 2,
      })
    ).not.toBe("0");
  });

  it("normalizes scientific notation for display", () => {
    expect(formatDisplayAmount("1e-7", { coinDecimals: 18 })).toBe("0.0000001");
  });

  it("normalizes uppercase scientific notation for display", () => {
    expect(formatDisplayAmount("1E-7", { coinDecimals: 18 })).toBe("0.0000001");
  });

  it("respects coin decimals ceiling", () => {
    expect(formatDisplayAmount("0.123456789", { coinDecimals: 4 })).toBe(
      "0.1235"
    );
  });

  it("returns empty string for empty input", () => {
    expect(formatDisplayAmount("", { coinDecimals: 18 })).toBe("");
  });

  it("normalizes signed zero to plain zero", () => {
    expect(formatDisplayAmount("-0.0000004", { coinDecimals: 6 })).toBe("0");
  });

  it("normalizes sub-base-unit values to zero when coinDecimals cannot represent them", () => {
    expect(formatDisplayAmount("0.0000004", { coinDecimals: 6 })).toBe("0");
    expect(formatDisplayAmount("-0.0000004", { coinDecimals: 6 })).toBe("0");
  });

  it("normalizes all zero-like values to plain zero", () => {
    expect(formatDisplayAmount("0", { coinDecimals: 18 })).toBe("0");
    expect(formatDisplayAmount("-0", { coinDecimals: 18 })).toBe("0");
    expect(formatDisplayAmount("0.0000", { coinDecimals: 18 })).toBe("0");
  });

  it("formats negative non-zero values consistently", () => {
    expect(formatDisplayAmount("-1.2300", { coinDecimals: 18 })).toBe("-1.23");
    expect(formatDisplayAmount("-0.000999999", { coinDecimals: 18 })).toBe(
      "-0.001"
    );
  });

  it("handles incomplete decimal forms in display-only mode", () => {
    expect(formatDisplayAmount(".", { coinDecimals: 18 })).toBe("0");
    expect(formatDisplayAmount("0.", { coinDecimals: 18 })).toBe("0");
  });

  it("keeps contract for ambiguous invalid inputs", () => {
    expect(formatDisplayAmount("-", { coinDecimals: 18 })).toBe("");
    expect(formatDisplayAmount("abc", { coinDecimals: 18 })).toBe("");
  });

  it("normalizes leading and trailing decimal artifacts", () => {
    expect(formatDisplayAmount("0001.2300", { coinDecimals: 18 })).toBe("1.23");
  });

  it("enforces maxDecimals on normal decimal input", () => {
    expect(
      formatDisplayAmount("1.23456789", { coinDecimals: 18, maxDecimals: 2 })
    ).toBe("1.23");
  });

  it("treats maxDecimals=0 as integer-like mode without tiny-value fallback", () => {
    expect(
      formatDisplayAmount("0.0001", { coinDecimals: 18, maxDecimals: 0 })
    ).toBe("0");
  });

  it("enforces coinDecimals ceiling on normal decimal input", () => {
    expect(formatDisplayAmount("1.23456789", { coinDecimals: 3 })).toBe("1.235");
  });

  it("normalizes invalid option values", () => {
    expect(
      formatDisplayAmount("1.2399", {
        coinDecimals: 4.9,
        maxDecimals: -3,
        minExtraDecimalsAfterFirstSignificant: -1,
      })
    ).toBe("1");
  });

  it("clamps very large coinDecimals to avoid toFixed range errors", () => {
    expect(formatDisplayAmount("1e-7", { coinDecimals: 9999 })).toBe("0.0000001");
  });

  it("does not throw on exponential path with oversized precision", () => {
    expect(() =>
      formatDisplayAmount("1e-7", { coinDecimals: 9999, maxDecimals: 9999 })
    ).not.toThrow();
  });

  it("safely handles extremely small exponential input with oversized precision", () => {
    expect(() => formatDisplayAmount("1e-150", { coinDecimals: 9999 })).not.toThrow();
  });

  it("rounds with carry across digit boundary", () => {
    expect(formatDisplayAmount("9.999", { coinDecimals: 18, maxDecimals: 2 })).toBe(
      "10"
    );
    expect(
      formatDisplayAmount("0.9999999", { coinDecimals: 18, maxDecimals: 6 })
    ).toBe("1");
  });
});
