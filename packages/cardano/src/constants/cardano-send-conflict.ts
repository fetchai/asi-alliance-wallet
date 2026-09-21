/**
 * Thrown by background Cardano send when another outgoing tx is pending
 * (local marker, SDK inFlight$, or signed$). Single immutable string for tests and UI mapping.
 */
export const CARDANO_SEND_CONFLICT_PENDING_MESSAGE =
  "Another transaction is still pending. Please wait until your balance updates.";
