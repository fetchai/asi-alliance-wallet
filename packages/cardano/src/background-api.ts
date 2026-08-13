export interface CardanoBalance {
  available: string; // in lovelaces
  total: string; // in lovelaces
  rewards: string; // in lovelaces
}

export const CARDANO_MESSAGES = {
  GET_BALANCE: "cardano-get-balance",
  IS_READY: "cardano-is-ready",
} as const;

export type CardanoMessageType =
  (typeof CARDANO_MESSAGES)[keyof typeof CARDANO_MESSAGES];

export interface CardanoBackgroundService {
  getBalance(): Promise<CardanoBalance>;
  isReady(): boolean;
}
