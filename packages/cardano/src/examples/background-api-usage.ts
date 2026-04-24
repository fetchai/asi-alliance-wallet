import { CARDANO_MESSAGES, CardanoBalance } from "../background-api";

/**
 * Gets Cardano wallet balance through Background API
 */
export async function getCardanoBalance(): Promise<CardanoBalance> {
  const response = await browser.runtime.sendMessage({
    port: "background-cardano",
    type: CARDANO_MESSAGES.GET_BALANCE,
    msg: {},
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.return;
}

/**
 * Checks Cardano service readiness
 */
export async function isCardanoReady(): Promise<boolean> {
  const response = await browser.runtime.sendMessage({
    port: "background-cardano",
    type: CARDANO_MESSAGES.IS_READY,
    msg: {},
  });

  if (response.error) {
    return false;
  }

  return response.return;
}

/**
 * Handles Cardano transaction errors
 * Follows error handling pattern from Lace
 */
export function handleCardanoError(error: any): string {
  if (error?.code) {
    switch (error.code) {
      case "InvalidRequest":
        return "Invalid transaction request";
      case "TxFailure":
        return "Transaction failed to submit";
      case "InsufficientFunds":
        return "Insufficient funds for transaction";
      case "NetworkError":
        return "Network error. Please try again";
      default:
        return error.message || "Transaction failed";
    }
  }

  if (error?.message) {
    return error.message;
  }

  return "Unknown error occurred";
}
