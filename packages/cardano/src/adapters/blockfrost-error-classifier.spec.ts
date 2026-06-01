import {
  isBlockfrostRateLimitError,
  isBlockfrostRateLimitHttpStatus,
  isBlockfrostRateLimitMessage,
} from "./blockfrost-error-classifier";

describe("blockfrost-error-classifier", () => {
  it("detects rate-limit HTTP statuses", () => {
    expect(isBlockfrostRateLimitHttpStatus(429)).toBe(true);
    expect(isBlockfrostRateLimitHttpStatus(402)).toBe(true);
    expect(isBlockfrostRateLimitHttpStatus(500)).toBe(false);
    expect(isBlockfrostRateLimitHttpStatus("unknown")).toBe(false);
  });

  it("detects rate-limit messages", () => {
    expect(isBlockfrostRateLimitMessage("Project rate limit exceeded")).toBe(
      true
    );
    expect(
      isBlockfrostRateLimitMessage("quota exceeded for this project")
    ).toBe(true);
    expect(isBlockfrostRateLimitMessage("not found")).toBe(false);
  });

  it("does not treat generic exceeded wording as rate limit", () => {
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
    ).toBe(true);
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
