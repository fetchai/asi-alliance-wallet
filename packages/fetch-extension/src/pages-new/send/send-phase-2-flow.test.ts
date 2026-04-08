jest.mock("@keplr-wallet/hooks", () => {
  class EmptyAddressError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "EmptyAddressError";
    }
  }
  return { EmptyAddressError };
});

jest.mock("@keplr-wallet/cardano", () => ({
  CardanoUiErrorCode: {},
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
    return { code, message: rest.slice(sep + 1) };
  },
  lovelacesToAdaString: (lovelaces: string, decimals = 6) => {
    const value = Number(lovelaces) / 10 ** Number(decimals);
    return String(value);
  },
}));

import {
  getCardanoPasswordModalInlineError,
  shouldNavigateCardanoFailedFromError,
  shouldNavigateCardanoSuccessAfterSubmit,
  shouldPushCardanoFailedWarningFromModal,
  shouldStartCardanoSuccessTransition,
} from "./send-phase-2-helpers";

describe("SendPhase2 Cardano flow decisions", () => {
  it("keeps modal open path for modal-level errors", () => {
    const message = "cardano_ui_error:invalid_password:Invalid password";

    expect(
      getCardanoPasswordModalInlineError({
        parsedCode: "invalid_password",
        message,
      })
    ).toBe("Invalid password");
    expect(
      shouldNavigateCardanoFailedFromError({
        isFromPasswordModal: true,
        errorMessage: message,
      })
    ).toBe(false);
    expect(
      shouldPushCardanoFailedWarningFromModal({
        parsedCode: "invalid_password",
        message,
      })
    ).toBe(false);
    expect(
      shouldNavigateCardanoSuccessAfterSubmit({
        submitSucceeded: false,
        isDetachedPage: false,
        currentPathName: "send",
      })
    ).toBe(false);
  });

  it("uses failed flow for system-level errors", () => {
    const message = "submit tx failed: provider unavailable";

    expect(
      getCardanoPasswordModalInlineError({
        message,
      })
    ).toBeUndefined();
    expect(
      shouldNavigateCardanoFailedFromError({
        isFromPasswordModal: true,
        errorMessage: message,
      })
    ).toBe(true);
    expect(
      shouldPushCardanoFailedWarningFromModal({
        message,
      })
    ).toBe(true);
  });

  it("keeps success transition single-owner and submit-driven", () => {
    expect(
      shouldStartCardanoSuccessTransition({
        submitSucceeded: true,
        hasPendingToSuccessTransitionStarted: false,
      })
    ).toBe(true);
    expect(
      shouldStartCardanoSuccessTransition({
        submitSucceeded: true,
        hasPendingToSuccessTransitionStarted: true,
      })
    ).toBe(false);
    expect(
      shouldNavigateCardanoSuccessAfterSubmit({
        submitSucceeded: true,
        isDetachedPage: false,
        currentPathName: "send",
      })
    ).toBe(true);
    expect(
      shouldNavigateCardanoSuccessAfterSubmit({
        submitSucceeded: true,
        isDetachedPage: false,
        currentPathName: "home",
      })
    ).toBe(false);
  });

  it("keeps non-modal submit behavior unchanged", () => {
    expect(
      shouldNavigateCardanoFailedFromError({
        isFromPasswordModal: false,
        errorMessage: "submit tx failed: provider unavailable",
      })
    ).toBe(true);
  });
});
