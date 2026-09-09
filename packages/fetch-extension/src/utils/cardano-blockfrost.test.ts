jest.mock("@keplr-wallet/cardano", () => ({
  parseCardanoUiError: (message: string) => {
    const prefix = "cardano_ui_error:";
    if (!message.startsWith(prefix)) {
      return { message };
    }
    const rest = message.slice(prefix.length);
    const sep = rest.indexOf(":");
    if (sep < 0) {
      return { message: rest };
    }
    const code = rest.slice(0, sep);
    const parsedMessage = rest.slice(sep + 1);
    const knownCodes = new Set([
      "blockfrost_builtin_limit",
      "blockfrost_user_limit",
    ]);
    return knownCodes.has(code)
      ? { code, message: parsedMessage }
      : { message: parsedMessage };
  },
  getCardanoNetworkFromChainId: jest.fn(),
}));

import {
  blockfrostLimitPresentationFromUiError,
  getBlockfrostLimitBannerMessage,
  mapBlockfrostCredentialsErrorMessage,
} from "./cardano-blockfrost";

describe("mapBlockfrostCredentialsErrorMessage", () => {
  it("maps known credential errors", () => {
    expect(
      mapBlockfrostCredentialsErrorMessage(new Error("cardano_wallet_locked"))
    ).toBe("Unlock your wallet to change Blockfrost settings.");
    expect(
      mapBlockfrostCredentialsErrorMessage(
        new Error("blockfrost_credentials_requires_confirmation")
      )
    ).toBe("Could not verify this key online. You can save it anyway.");
  });

  it("falls back for unknown errors", () => {
    expect(mapBlockfrostCredentialsErrorMessage(new Error("unexpected"))).toBe(
      "Could not save Blockfrost settings. Please try again."
    );
  });
});

describe("blockfrostLimitPresentationFromUiError", () => {
  it("maps builtin limit code", () => {
    expect(
      blockfrostLimitPresentationFromUiError(
        "cardano_ui_error:blockfrost_builtin_limit:Rate limit exceeded"
      )
    ).toEqual({
      activeKeySource: "builtin",
      showBuiltinLimitCta: true,
      showUserKeyLimitWarning: false,
    });
  });

  it("maps user limit code", () => {
    expect(
      blockfrostLimitPresentationFromUiError(
        "cardano_ui_error:blockfrost_user_limit:Custom key quota reached"
      )
    ).toEqual({
      activeKeySource: "custom",
      showBuiltinLimitCta: false,
      showUserKeyLimitWarning: true,
    });
  });

  it("returns undefined for unrelated errors", () => {
    expect(
      blockfrostLimitPresentationFromUiError(
        "cardano_ui_error:provider_error:down"
      )
    ).toBeUndefined();
  });
});

describe("getBlockfrostLimitBannerMessage", () => {
  it("returns builtin limit copy", () => {
    expect(
      getBlockfrostLimitBannerMessage({
        activeKeySource: "builtin",
        showBuiltinLimitCta: true,
        showUserKeyLimitWarning: false,
      })
    ).toContain("built-in Blockfrost API key");
  });

  it("returns user key limit copy", () => {
    expect(
      getBlockfrostLimitBannerMessage({
        activeKeySource: "custom",
        showBuiltinLimitCta: false,
        showUserKeyLimitWarning: true,
      })
    ).toContain("Your Blockfrost API key");
  });
});
