import { encodeCardanoSendError } from "./blockfrost-limit-presentation";
import {
  encodeCardanoUiError,
  isBlockfrostRateLimitError,
} from "@keplr-wallet/cardano";

jest.mock("@keplr-wallet/cardano", () => {
  const actual = jest.requireActual("@keplr-wallet/cardano");
  return {
    ...actual,
    isBlockfrostRateLimitError: jest.fn(),
    wasRateLimitedRecently: jest.fn(),
    getBlockfrostConfigSource: jest.fn(),
  };
});

const { wasRateLimitedRecently, getBlockfrostConfigSource } = jest.requireMock(
  "@keplr-wallet/cardano"
);

describe("encodeCardanoSendError", () => {
  const cardanoService = {
    getBlockfrostCredentialsStore: jest.fn().mockReturnValue(undefined),
  } as any;
  const keyRingService = {
    getKeyRing: () => ({
      isLocked: () => false,
      currentPassword: "password",
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (isBlockfrostRateLimitError as jest.Mock).mockReturnValue(true);
    (wasRateLimitedRecently as jest.Mock).mockReturnValue(true);
  });

  it("encodes built-in limit errors for built-in key source", async () => {
    (getBlockfrostConfigSource as jest.Mock).mockReturnValue("builtin");

    const encoded = await encodeCardanoSendError(
      { status: 429 },
      "Rate limit exceeded",
      cardanoService,
      keyRingService,
      "cardano-preprod"
    );

    expect(encoded).toBe(
      encodeCardanoUiError("blockfrost_builtin_limit", "Rate limit exceeded")
    );
  });

  it("encodes user-key limit errors for custom key source", async () => {
    (getBlockfrostConfigSource as jest.Mock).mockReturnValue("custom");

    const encoded = await encodeCardanoSendError(
      { status: 429 },
      "Quota exceeded",
      cardanoService,
      keyRingService,
      "cardano-preprod"
    );

    expect(encoded).toBe(
      encodeCardanoUiError("blockfrost_user_limit", "Quota exceeded")
    );
  });

  it("encodes current rate-limit error even when telemetry has not recorded it yet", async () => {
    (wasRateLimitedRecently as jest.Mock).mockReturnValue(false);
    (getBlockfrostConfigSource as jest.Mock).mockReturnValue("builtin");

    const encoded = await encodeCardanoSendError(
      { status: 429 },
      "Rate limit exceeded",
      cardanoService,
      keyRingService,
      "cardano-preprod"
    );

    expect(wasRateLimitedRecently).not.toHaveBeenCalled();
    expect(encoded).toBe(
      encodeCardanoUiError("blockfrost_builtin_limit", "Rate limit exceeded")
    );
  });
});
