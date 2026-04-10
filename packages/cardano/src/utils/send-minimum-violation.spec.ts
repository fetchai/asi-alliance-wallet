import {
  CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD,
  cardanoMalformedMinimumPayloadError,
  formatCardanoMinimumViolationMessage,
  formatLegacyMinimumViolationLovelaceError,
  mapCardanoMinimumViolation,
} from "./send-minimum-violation";

describe("send minimum violation helpers", () => {
  it("maps numeric minimum violation payload", () => {
    expect(
      mapCardanoMinimumViolation({
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "969999",
      })
    ).toEqual({
      classification: "minimum_violation",
      minimumOutputLovelace: "970000",
      coinMissingLovelace: "969999",
    });
  });

  it("returns null for malformed minimum fields", () => {
    expect(
      mapCardanoMinimumViolation({
        minimumOutputLovelace: "not-a-number",
      })
    ).toBeNull();
  });

  it("keeps mapping when coinMissing is malformed", () => {
    expect(
      mapCardanoMinimumViolation({
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "bad",
      })
    ).toEqual({
      classification: "minimum_violation",
      minimumOutputLovelace: "970000",
      coinMissingLovelace: undefined,
    });
  });

  it("returns null when minimum output is zero", () => {
    expect(
      mapCardanoMinimumViolation({
        minimumOutputLovelace: "0",
      })
    ).toBeNull();
  });

  it("keeps mapping with empty optional coinMissing", () => {
    expect(
      mapCardanoMinimumViolation({
        minimumOutputLovelace: "970000",
        coinMissingLovelace: "",
      })
    ).toEqual({
      classification: "minimum_violation",
      minimumOutputLovelace: "970000",
      coinMissingLovelace: undefined,
    });
  });

  it("formats deterministic user-facing minimum message", () => {
    const violation = mapCardanoMinimumViolation({
      minimumOutputLovelace: "970000",
    });
    expect(violation).not.toBeNull();
    expect(
      formatCardanoMinimumViolationMessage({
        violation: violation!,
        cardanoDenom: "tADA",
        nativeAdaCoinDecimals: 6,
      })
    ).toBe("Amount too small. Minimum required is 0.97 tADA");
  });

  it("formats legacy lovelace transport message", () => {
    const violation = mapCardanoMinimumViolation({
      minimumOutputLovelace: "970000",
    });
    expect(violation).not.toBeNull();
    expect(
      formatLegacyMinimumViolationLovelaceError({
        violation: violation!,
      })
    ).toContain("minimum output value is 970000 lovelace");
  });

  it("tags malformed-payload estimate/draft failures with a stable cause id", () => {
    const err = cardanoMalformedMinimumPayloadError("Failed to build transaction");
    expect(err.message).toBe("Failed to build transaction");
    expect((err as Error & { cause?: Error }).cause?.message).toBe(
      CARDANO_MINIMUM_VIOLATION_MALFORMED_PAYLOAD
    );
  });
});
