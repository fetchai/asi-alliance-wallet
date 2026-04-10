const mockMapCardanoMinimumViolation = jest.fn(
  ({
    minimumOutputLovelace,
    coinMissingLovelace,
  }: {
    minimumOutputLovelace: string;
    coinMissingLovelace?: string;
  }) =>
    /^\d+$/.test(minimumOutputLovelace) && BigInt(minimumOutputLovelace) > BigInt(0)
      ? {
          classification: "minimum_violation" as const,
          minimumOutputLovelace,
          coinMissingLovelace:
            coinMissingLovelace && /^\d+$/.test(coinMissingLovelace)
              ? coinMissingLovelace
              : undefined,
        }
      : null
);

const mockFormatCardanoMinimumViolationMessage = jest.fn(
  ({
    violation,
    cardanoDenom,
    nativeAdaCoinDecimals,
  }: {
    violation: { minimumOutputLovelace: string };
    cardanoDenom: string;
    nativeAdaCoinDecimals: number;
  }) => {
    const safe = violation.minimumOutputLovelace.replace(/^0+/, "") || "0";
    const padded = safe.padStart(nativeAdaCoinDecimals + 1, "0");
    const whole = padded.slice(0, -nativeAdaCoinDecimals);
    const frac = padded.slice(-nativeAdaCoinDecimals).replace(/0+$/, "");
    const minAda = frac ? `${whole}.${frac}` : whole;
    return `Amount too small. Minimum required is ${minAda} ${cardanoDenom}`;
  }
);

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
    const parsedMessage = rest.slice(sep + 1);
    const knownCodes = new Set([
      "invalid_password",
      "password_required",
      "wallet_locked",
      "wallet_syncing",
    ]);
    return knownCodes.has(code)
      ? { code, message: parsedMessage }
      : { message: parsedMessage };
  },
  lovelacesToAdaString: (lovelaces: string, decimals = 6) => {
    const value = Number(lovelaces) / 10 ** Number(decimals);
    return String(value);
  },
  mapCardanoMinimumViolation: mockMapCardanoMinimumViolation,
  formatCardanoMinimumViolationMessage: mockFormatCardanoMinimumViolationMessage,
}));

import { EmptyAddressError } from "@keplr-wallet/hooks";
import {
  CARDANO_SUCCESS_TRANSITION_DELAY_MS,
  getCardanoPostSubmitStatusSequence,
  getCardanoPasswordModalInlineError,
  parseCardanoUiErrorMessage,
  getMinimumDisplayAmountFromDecimals,
  getBannerValidationError,
  getHighestPriorityNonRecipientBlockingError,
  isCardanoSendDraftInputsReady,
  isCardanoSendOperationalGuard,
  isPositiveDecimalAmount,
  isOnlyEmptyRecipientBlocking,
  isReviewTransactionButtonDisabled,
  formatAdaMinimumViolationMessageFromRawFields,
  normalizeCardanoDraftError,
  parseAmountToBaseUnits,
  isCardanoModalLevelErrorMessage,
  shouldNavigateCardanoSuccessAfterSubmit,
  shouldNavigateCardanoFailedFromError,
  shouldPushCardanoFailedWarningFromModal,
  shouldStartCardanoSuccessTransition,
  shouldEnableReviewWhenInvalid,
} from "./send-phase-2-helpers";

describe("getHighestPriorityNonRecipientBlockingError", () => {
  it("returns amount error when present", () => {
    const amountErr = new Error("bad amount");
    const r = getHighestPriorityNonRecipientBlockingError({
      amountError: amountErr,
      memoError: undefined,
      isCardano: false,
      normalizedCardanoDraftError: null,
      cardanoDraft: null,
      isBuildingCardanoDraft: false,
      gasError: undefined,
      feeError: new Error("fee"),
    });
    expect(r).toBe(amountErr);
  });

  it("returns Transaction is not ready for Cardano without draft when guard is off and inputs ready", () => {
    const r = getHighestPriorityNonRecipientBlockingError({
      amountError: undefined,
      memoError: undefined,
      isCardano: true,
      normalizedCardanoDraftError: null,
      cardanoDraft: null,
      isBuildingCardanoDraft: false,
      cardanoOperationalGuard: false,
      cardanoDraftInputsReady: true,
      gasError: undefined,
      feeError: undefined,
    });
    expect(r?.message).toBe("Transaction is not ready");
  });

  it("omits Transaction is not ready when Cardano draft inputs are not ready yet", () => {
    const r = getHighestPriorityNonRecipientBlockingError({
      amountError: undefined,
      memoError: undefined,
      isCardano: true,
      normalizedCardanoDraftError: null,
      cardanoDraft: null,
      isBuildingCardanoDraft: false,
      cardanoOperationalGuard: false,
      cardanoDraftInputsReady: false,
      gasError: undefined,
      feeError: undefined,
    });
    expect(r).toBeUndefined();
  });

  it("omits Transaction is not ready when Cardano operational guard is on", () => {
    const r = getHighestPriorityNonRecipientBlockingError({
      amountError: undefined,
      memoError: undefined,
      isCardano: true,
      normalizedCardanoDraftError: null,
      cardanoDraft: null,
      isBuildingCardanoDraft: false,
      cardanoOperationalGuard: true,
      gasError: undefined,
      feeError: undefined,
    });
    expect(r).toBeUndefined();
  });
});

describe("isCardanoSendDraftInputsReady", () => {
  it("is false when recipient is empty", () => {
    expect(
      isCardanoSendDraftInputsReady({
        recipient: "  ",
        recipientError: undefined,
        amount: "1",
      })
    ).toBe(false);
  });

  it("is false when recipient has validation error", () => {
    expect(
      isCardanoSendDraftInputsReady({
        recipient: "addr_bad",
        recipientError: new Error("invalid"),
        amount: "1",
      })
    ).toBe(false);
  });

  it("is false when amount is empty", () => {
    expect(
      isCardanoSendDraftInputsReady({
        recipient: "addr1",
        recipientError: undefined,
        amount: "",
      })
    ).toBe(false);
  });

  it("is true when trimmed recipient and non-empty amount with no recipient error", () => {
    expect(
      isCardanoSendDraftInputsReady({
        recipient: "  addr1  ",
        recipientError: undefined,
        amount: "1.5",
      })
    ).toBe(true);
  });
});

describe("isCardanoSendOperationalGuard", () => {
  const base = {
    isCardano: true as const,
    isOnline: true,
    isCardanoSyncing: false,
  };

  it("is false when not Cardano", () => {
    expect(
      isCardanoSendOperationalGuard({
        ...base,
        isCardano: false,
        isOnline: false,
        isCardanoSyncing: true,
      })
    ).toBe(false);
  });

  it("is true when offline", () => {
    expect(isCardanoSendOperationalGuard({ ...base, isOnline: false })).toBe(
      true
    );
  });

  it("is true when syncing", () => {
    expect(
      isCardanoSendOperationalGuard({ ...base, isCardanoSyncing: true })
    ).toBe(true);
  });

  it("is false when ready and online and not syncing", () => {
    expect(isCardanoSendOperationalGuard(base)).toBe(false);
  });
});

describe("getBannerValidationError — precedence", () => {
  it("shows non-recipient error when recipient is empty and amount blocks", () => {
    const emptyErr = new EmptyAddressError("Address is empty");
    const amountErr = new Error("amount invalid");
    const sendConfigError = emptyErr;

    const banner = getBannerValidationError({
      sendConfigError,
      recipientError: emptyErr,
      postRecipientError: amountErr,
      recipientTouched: false,
      reviewAttempted: false,
    });

    expect(banner).toBe(amountErr);
    expect(banner?.message).not.toBe("Address is empty");
  });

  it("defers empty-address message until touched or review when no other blocker", () => {
    const emptyErr = new EmptyAddressError("Address is empty");
    const banner = getBannerValidationError({
      sendConfigError: emptyErr,
      recipientError: emptyErr,
      postRecipientError: undefined,
      recipientTouched: false,
      reviewAttempted: false,
    });
    expect(banner).toBeNull();
  });

  it("shows invalid recipient when not empty error (unchanged chain)", () => {
    const invalidErr = new Error("Invalid bech32");
    const banner = getBannerValidationError({
      sendConfigError: invalidErr,
      recipientError: invalidErr,
      postRecipientError: undefined,
      recipientTouched: false,
      reviewAttempted: false,
    });
    expect(banner).toBe(invalidErr);
  });
});

describe("Review button — special enable", () => {
  it("enables Review when only empty blocks and user has not blurred or reviewed", () => {
    expect(
      shouldEnableReviewWhenInvalid({
        onlyEmptyRecipientBlocking: true,
        recipientTouched: false,
        reviewAttempted: false,
      })
    ).toBe(true);

    const disabled = isReviewTransactionButtonDisabled({
      operationalDisabled: false,
      txStateIsValid: false,
      onlyEmptyRecipientBlocking: true,
      recipientTouched: false,
      reviewAttempted: false,
    });
    expect(disabled).toBe(false);
  });

  it("disables Review after reviewAttempted while still empty", () => {
    const disabled = isReviewTransactionButtonDisabled({
      operationalDisabled: false,
      txStateIsValid: false,
      onlyEmptyRecipientBlocking: true,
      recipientTouched: false,
      reviewAttempted: true,
    });
    expect(disabled).toBe(true);
  });

  it("disables Review after blur on empty field even if only empty blocks", () => {
    const disabled = isReviewTransactionButtonDisabled({
      operationalDisabled: false,
      txStateIsValid: false,
      onlyEmptyRecipientBlocking: true,
      recipientTouched: true,
      reviewAttempted: false,
    });
    expect(disabled).toBe(true);
  });

  it("does not enable Review when another validation error exists", () => {
    expect(
      shouldEnableReviewWhenInvalid({
        onlyEmptyRecipientBlocking: false,
        recipientTouched: false,
        reviewAttempted: false,
      })
    ).toBe(false);
  });
});

describe("isOnlyEmptyRecipientBlocking", () => {
  it("is true only for EmptyAddressError and no post-recipient error", () => {
    const emptyErr = new EmptyAddressError("Address is empty");
    expect(isOnlyEmptyRecipientBlocking(emptyErr, undefined)).toBe(true);
    expect(isOnlyEmptyRecipientBlocking(emptyErr, new Error("other"))).toBe(
      false
    );
  });
});

describe("parseAmountToBaseUnits", () => {
  it("converts sub-lovelace ADA input to zero base units", () => {
    expect(parseAmountToBaseUnits("0.0000001", 6)).toBe(BigInt(0));
  });
});

describe("isPositiveDecimalAmount", () => {
  it("returns true only for valid positive decimals", () => {
    expect(isPositiveDecimalAmount("0.1")).toBe(true);
    expect(isPositiveDecimalAmount("0")).toBe(false);
    expect(isPositiveDecimalAmount("abc")).toBe(false);
  });
});

describe("getMinimumDisplayAmountFromDecimals", () => {
  it("returns smallest display unit from decimals", () => {
    expect(getMinimumDisplayAmountFromDecimals(6)).toBe("0.000001");
    expect(getMinimumDisplayAmountFromDecimals(0)).toBe("1");
  });
});

describe("normalizeCardanoDraftError", () => {
  beforeEach(() => {
    mockMapCardanoMinimumViolation.mockClear();
    mockFormatCardanoMinimumViolationMessage.mockClear();
  });
  const params = {
    cardanoDenom: "tADA",
    sendCurrencyDenom: "tADA",
    sendCurrencyCoinDecimals: 6,
    nativeAdaCoinDecimals: 6,
  };

  it("normalizes recipient required error", () => {
    expect(
      normalizeCardanoDraftError({
        ...params,
        rawError: "recipient address is empty",
      })
    ).toBe("Recipient address is required");
  });

  it("maps legacy positive-number fallback to user-facing zero-amount message", () => {
    expect(
      normalizeCardanoDraftError({
        ...params,
        rawError: "amount must be a positive number",
      })
    ).toBe("Amount must be greater than 0");
  });

  it("formats structured minimum violation for display", () => {
    expect(
      formatAdaMinimumViolationMessageFromRawFields({
        minimumOutputLovelace: "970000",
        cardanoDenom: "tADA",
        nativeAdaCoinDecimals: 6,
      })
    ).toBe("Amount too small. Minimum required is 0.97 tADA");
    expect(mockMapCardanoMinimumViolation).toHaveBeenCalledWith({
      minimumOutputLovelace: "970000",
      coinMissingLovelace: undefined,
    });
  });

  it("returns generic fallback for malformed structured minimum violation", () => {
    expect(
      formatAdaMinimumViolationMessageFromRawFields({
        minimumOutputLovelace: "bad",
        coinMissingLovelace: "1",
        cardanoDenom: "tADA",
        nativeAdaCoinDecimals: 6,
      })
    ).toBe("Failed to build transaction");
  });

  it("normalizes minimum output lovelace error to ADA", () => {
    expect(
      normalizeCardanoDraftError({
        ...params,
        rawError:
          "Amount too small: minimum output value is 970000 lovelace (protocol minimum for this output). Please send at least 970000 lovelace.",
      })
    ).toBe("Amount too small. Minimum required is 0.97 tADA");
    expect(mockMapCardanoMinimumViolation).toHaveBeenCalledWith({
      minimumOutputLovelace: "970000",
    });
    expect(mockFormatCardanoMinimumViolationMessage).toHaveBeenCalled();
  });

  it("returns raw error when no cardano mapping exists", () => {
    expect(
      normalizeCardanoDraftError({
        ...params,
        rawError: "some random failure",
      })
    ).toBe("some random failure");
  });

  it("normalizes UTxO fully depleted SDK error to user-friendly message", () => {
    const expected =
      "Insufficient balance to cover amount + fees. " +
      "Try reducing the amount or leaving some balance for transaction fees.";
    expect(
      normalizeCardanoDraftError({
        ...params,
        rawError: "UTxO Fully Depleted",
      })
    ).toBe(expected);
    expect(
      normalizeCardanoDraftError({
        ...params,
        rawError: "utxo fully depleted",
      })
    ).toBe(expected);
    expect(
      normalizeCardanoDraftError({
        ...params,
        rawError: "Transaction build failed: UTxO Fully Depleted",
      })
    ).toBe(expected);
  });

  it("normalizes token dust error using token decimals", () => {
    expect(
      normalizeCardanoDraftError({
        ...params,
        rawError: "asset amount must be positive",
        sendCurrencyDenom: "TOKEN",
        sendCurrencyCoinDecimals: 4,
      })
    ).toBe("Amount too small. Minimum sendable amount is 0.0001 TOKEN");
  });
});

describe("Cardano post-submit status flow", () => {
  it("keeps pending -> success sequence for post-submit UI flow", () => {
    expect(getCardanoPostSubmitStatusSequence()).toEqual([
      "pending",
      "success",
    ]);
  });

  it("uses a small deterministic delay for pending -> success transition", () => {
    expect(CARDANO_SUCCESS_TRANSITION_DELAY_MS).toBeGreaterThan(0);
  });

  it("enforces single-owner transition scheduling", () => {
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
      shouldStartCardanoSuccessTransition({
        submitSucceeded: false,
        hasPendingToSuccessTransitionStarted: false,
      })
    ).toBe(false);
  });
});

describe("Cardano error classification", () => {
  it("parses structured cardano ui error messages", () => {
    expect(
      parseCardanoUiErrorMessage("cardano_ui_error:invalid_password:Invalid password")
    ).toEqual({
      code: "invalid_password",
      message: "Invalid password",
    });
  });

  it("falls back for plain error messages", () => {
    expect(parseCardanoUiErrorMessage("some generic error")).toEqual({
      message: "some generic error",
    });
  });

  it("rejects unknown structured error codes via whitelist", () => {
    expect(
      parseCardanoUiErrorMessage("cardano_ui_error:unknown_code:Some message")
    ).toEqual({
      message: "Some message",
    });
  });

  it("detects modal-level password and wallet-state errors", () => {
    expect(
      isCardanoModalLevelErrorMessage(
        "cardano_ui_error:wallet_locked:Cardano service not ready. Please unlock wallet first."
      )
    ).toBe(true);
    expect(isCardanoModalLevelErrorMessage("Invalid password")).toBe(true);
    expect(
      isCardanoModalLevelErrorMessage("Password is required")
    ).toBe(true);
    expect(
      isCardanoModalLevelErrorMessage("Wallet is syncing. Please wait")
    ).toBe(true);
    expect(
      isCardanoModalLevelErrorMessage("Please unlock wallet first")
    ).toBe(true);
  });

  it("does not treat generic submit failures as modal-level", () => {
    expect(
      isCardanoModalLevelErrorMessage("submit tx failed: provider unavailable")
    ).toBe(false);
  });

  it("blocks failed navigation for modal-level errors from password modal", () => {
    expect(
      shouldNavigateCardanoFailedFromError({
        isFromPasswordModal: true,
        errorMessage: "cardano_ui_error:invalid_password:Invalid password",
      })
    ).toBe(false);
  });

  it("allows failed navigation for system-level errors from password modal", () => {
    expect(
      shouldNavigateCardanoFailedFromError({
        isFromPasswordModal: true,
        errorMessage: "submit tx failed: provider unavailable",
      })
    ).toBe(true);
  });

  it("allows failed navigation for non-modal submissions", () => {
    expect(
      shouldNavigateCardanoFailedFromError({
        isFromPasswordModal: false,
        errorMessage: "Invalid password",
      })
    ).toBe(true);
  });

  it("maps modal-level errors to inline modal messages", () => {
    expect(
      getCardanoPasswordModalInlineError({
        parsedCode: "invalid_password",
        message: "irrelevant",
      })
    ).toBe("Invalid password");
    expect(
      getCardanoPasswordModalInlineError({
        parsedCode: "wallet_syncing",
        message: "irrelevant",
        syncingMessage: "Syncing wallet… Please wait",
      })
    ).toBe("Syncing wallet… Please wait");
  });

  it("returns undefined for system-level errors (allows warning toast path)", () => {
    expect(
      getCardanoPasswordModalInlineError({
        message: "submit tx failed: provider unavailable",
      })
    ).toBeUndefined();
  });

  it("does not push failed warning payload for modal-level errors", () => {
    expect(
      shouldPushCardanoFailedWarningFromModal({
        parsedCode: "invalid_password",
        message: "Invalid password",
      })
    ).toBe(false);
  });

  it("allows failed warning payload for system-level modal errors", () => {
    expect(
      shouldPushCardanoFailedWarningFromModal({
        message: "submit tx failed: provider unavailable",
      })
    ).toBe(true);
  });

  it("navigates to success only after successful submit on send route", () => {
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
        currentPathName: "activity",
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
});
