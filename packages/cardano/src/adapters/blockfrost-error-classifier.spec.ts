import {
  isBlockfrostRateLimitError,
  isBlockfrostRateLimitHttpStatus,
  isBlockfrostRateLimitMessage,
} from "./blockfrost-error-classifier";

describe("blockfrost-error-classifier", () => {
  it("detects quota-exceeded HTTP status", () => {
    expect(isBlockfrostRateLimitHttpStatus(429)).toBe(false);
    expect(isBlockfrostRateLimitHttpStatus(402)).toBe(true);
    expect(isBlockfrostRateLimitHttpStatus(500)).toBe(false);
    expect(isBlockfrostRateLimitHttpStatus("unknown")).toBe(false);
  });

  it("detects quota-exceeded messages", () => {
    expect(
      isBlockfrostRateLimitMessage("quota exceeded for this project")
    ).toBe(true);
    expect(isBlockfrostRateLimitMessage("Usage quota reached")).toBe(true);
    expect(isBlockfrostRateLimitMessage("not found")).toBe(false);
    expect(isBlockfrostRateLimitMessage("Too Many Requests")).toBe(false);
    expect(isBlockfrostRateLimitMessage("Project rate limit exceeded")).toBe(
      false
    );
    expect(isBlockfrostRateLimitMessage("rate limit exceeded")).toBe(false);
  });

  it("does not treat generic exceeded wording as quota exceeded", () => {
    expect(
      isBlockfrostRateLimitMessage("maximum transaction size exceeded")
    ).toBe(false);
  });

  it("classifies structured Blockfrost errors", () => {
    expect(
      isBlockfrostRateLimitError({
        status: 429,
        message: "Too Many Requests",
      })
    ).toBe(false);
    expect(
      isBlockfrostRateLimitError({
        status: 429,
        message: "Project rate limit exceeded",
      })
    ).toBe(false);
    expect(
      isBlockfrostRateLimitError({
        response: {
          status: 429,
          data: { message: "rate limit exceeded" },
        },
      })
    ).toBe(false);
    expect(
      isBlockfrostRateLimitError({
        response: { status: 402, data: { message: "Usage quota reached" } },
      })
    ).toBe(true);
    expect(isBlockfrostRateLimitError(new Error("network timeout"))).toBe(
      false
    );
  });
});
