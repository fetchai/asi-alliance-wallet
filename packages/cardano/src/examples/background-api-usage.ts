import { CARDANO_MESSAGES, CardanoSendAdaParams, CardanoBalance } from "../background-api";

/**
 * Sends ADA transaction through Background API
 * Used in UI components
 */
export async function sendAdaTransaction(
  to: string,
  amount: string, // in lovelaces
  memo?: string
): Promise<string> {
  const params: CardanoSendAdaParams = {
    to,
    amount,
    memo
  };

  const response = await browser.runtime.sendMessage({
    port: "background-cardano", // ROUTE from constants.ts
    type: CARDANO_MESSAGES.SEND_ADA,
    msg: params
  });

  if (response.error) {
    throw new Error(response.error);
  }

  return response.return;
}

/**
 * Gets Cardano wallet balance through Background API
 */
export async function getCardanoBalance(): Promise<CardanoBalance> {
  const response = await browser.runtime.sendMessage({
    port: "background-cardano",
    type: CARDANO_MESSAGES.GET_BALANCE,
    msg: {}
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
    msg: {}
  });

  if (response.error) {
    return false;
  }

  return response.return;
}

/**
 * Complete workflow for sending ADA transaction
 * Includes readiness check, balance retrieval and sending
 */
export async function completeAdaTransaction(
  to: string,
  amount: string,
  memo?: string
): Promise<{ txId: string; balance: CardanoBalance }> {
  // 1. Check service readiness
  if (!(await isCardanoReady())) {
    throw new Error("Cardano service not ready. Please unlock wallet first.");
  }

  // 2. Get current balance
  const balance = await getCardanoBalance();
  
  // 3. Check sufficient funds
  if (BigInt(balance.available) < BigInt(amount)) {
    throw new Error("Insufficient funds");
  }

  // 4. Send transaction
  const txId = await sendAdaTransaction(to, amount, memo);

  // 5. Return result
  return { txId, balance };
}

/**
 * Handles Cardano transaction errors
 * Follows error handling pattern from Lace
 */
export function handleCardanoError(error: any): string {
  if (error?.code) {
    switch (error.code) {
      case 'InvalidRequest':
        return "Invalid transaction request";
      case 'TxFailure':
        return "Transaction failed to submit";
      case 'InsufficientFunds':
        return "Insufficient funds for transaction";
      case 'NetworkError':
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
