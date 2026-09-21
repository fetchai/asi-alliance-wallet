import { getBlockfrostLimitPresentation } from "./blockfrost-limit-presentation";
import {
  getBlockfrostConfigSource,
  wasRateLimitedRecently,
} from "@keplr-wallet/cardano";

jest.mock("@keplr-wallet/cardano", () => {
  const actual = jest.requireActual("@keplr-wallet/cardano");
  return {
    ...actual,
    wasRateLimitedRecently: jest.fn(),
    getBlockfrostConfigSource: jest.fn(),
  };
});

describe("getBlockfrostLimitPresentation", () => {
  const cardanoService = {
    getBlockfrostCredentialsStore: jest.fn(),
  } as any;

  const keyRingService = {
    getKeyRing: () => ({
      isLocked: () => false,
      currentPassword: "password",
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    cardanoService.getBlockfrostCredentialsStore.mockReturnValue(undefined);
    (wasRateLimitedRecently as jest.Mock).mockReturnValue(true);
  });

  it("shows built-in CTA when rate limited on built-in key", async () => {
    (getBlockfrostConfigSource as jest.Mock).mockReturnValue("builtin");

    const presentation = await getBlockfrostLimitPresentation(
      cardanoService,
      keyRingService,
      "cardano-preprod"
    );

    expect(presentation).toEqual({
      activeKeySource: "builtin",
      showBuiltinLimitCta: true,
      showUserKeyLimitWarning: false,
    });
  });

  it("shows user-key warning when rate limited on custom key", async () => {
    (getBlockfrostConfigSource as jest.Mock).mockReturnValue("custom");

    const presentation = await getBlockfrostLimitPresentation(
      cardanoService,
      keyRingService,
      "cardano-preprod"
    );

    expect(presentation).toEqual({
      activeKeySource: "custom",
      showBuiltinLimitCta: false,
      showUserKeyLimitWarning: true,
    });
  });

  it("shows neither CTA nor warning when no recent rate limit", async () => {
    (getBlockfrostConfigSource as jest.Mock).mockReturnValue("builtin");
    (wasRateLimitedRecently as jest.Mock).mockReturnValue(false);

    const presentation = await getBlockfrostLimitPresentation(
      cardanoService,
      keyRingService,
      "cardano-preprod"
    );

    expect(presentation).toEqual({
      activeKeySource: "builtin",
      showBuiltinLimitCta: false,
      showUserKeyLimitWarning: false,
    });
  });
});
