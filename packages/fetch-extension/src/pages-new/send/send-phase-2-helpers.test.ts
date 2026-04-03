jest.mock("@keplr-wallet/hooks", () => {
  class EmptyAddressError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "EmptyAddressError";
    }
  }
  return { EmptyAddressError };
});

import { EmptyAddressError } from "@keplr-wallet/hooks";
import {
  getBannerValidationError,
  getHighestPriorityNonRecipientBlockingError,
  isOnlyEmptyRecipientBlocking,
  isReviewTransactionButtonDisabled,
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
