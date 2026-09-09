// Mock the utils module to avoid pulling in @cardano-sdk/wallet native bindings
jest.mock("../../../utils/cardano-blockfrost", () => ({
  getBlockfrostLimitBannerMessage: (presentation: {
    showUserKeyLimitWarning?: boolean;
    showBuiltinLimitCta?: boolean;
  }): string => {
    if (presentation.showUserKeyLimitWarning) {
      return "Your Blockfrost API key has reached its usage limit. Try again later or use a different key.";
    }
    if (presentation.showBuiltinLimitCta) {
      return "The built-in Blockfrost API key has reached its usage limit. Add your own key to continue using Cardano features.";
    }
    return "";
  },
}));

import {
  isTransientState,
  getStateErrorMessage,
  BLOCKFROST_RATE_LIMIT_FALLBACK,
} from "./state-helpers";
import type { BlockfrostLimitPresentation } from "@keplr-wallet/background";

describe("Cardano Activity state helpers", () => {
  describe("isTransientState", () => {
    it("marks syncing as transient", () => {
      expect(isTransientState("syncing")).toBe(true);
    });

    it("marks temporarily_unavailable as transient", () => {
      expect(isTransientState("temporarily_unavailable")).toBe(true);
    });

    it("does not mark blockfrost_rate_limited as transient", () => {
      expect(isTransientState("blockfrost_rate_limited")).toBe(false);
    });

    it("does not mark provider_error as transient", () => {
      expect(isTransientState("provider_error")).toBe(false);
    });
  });

  describe("getStateErrorMessage", () => {
    it("returns builtin-key error message when rate-limited with builtin presentation", () => {
      const presentation: BlockfrostLimitPresentation = {
        activeKeySource: "builtin",
        showBuiltinLimitCta: true,
        showUserKeyLimitWarning: false,
      };

      const message = getStateErrorMessage(
        "blockfrost_rate_limited",
        undefined,
        presentation
      );

      expect(message).toContain("built-in Blockfrost");
      expect(message).not.toBe(BLOCKFROST_RATE_LIMIT_FALLBACK);
    });

    it("returns user-key error message when rate-limited with custom presentation", () => {
      const presentation: BlockfrostLimitPresentation = {
        activeKeySource: "custom",
        showBuiltinLimitCta: false,
        showUserKeyLimitWarning: true,
      };

      const message = getStateErrorMessage(
        "blockfrost_rate_limited",
        undefined,
        presentation
      );

      expect(message).toContain("Blockfrost API key");
      expect(message).not.toBe(BLOCKFROST_RATE_LIMIT_FALLBACK);
    });

    it("returns generic fallback when rate-limited without presentation", () => {
      const message = getStateErrorMessage(
        "blockfrost_rate_limited",
        undefined
      );

      expect(message).toBe(BLOCKFROST_RATE_LIMIT_FALLBACK);
    });

    it("returns provider_error fallback when error text is missing", () => {
      expect(getStateErrorMessage("provider_error", undefined)).toBe(
        "Cardano provider unavailable"
      );
    });
  });
});
