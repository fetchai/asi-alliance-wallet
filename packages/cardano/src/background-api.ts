export interface CardanoSendAdaParams {
  to: string;
  amount: string; // in lovelaces (1 ADA = 1,000,000 lovelaces)
  memo?: string;
}

export interface CardanoBalance {
  available: string; // in lovelaces
  total: string; // in lovelaces
  rewards: string; // in lovelaces
}

export const CARDANO_MESSAGES = {
  SEND_ADA: "cardano-send-ada",
  GET_BALANCE: "cardano-get-balance",
  IS_READY: "cardano-is-ready"
} as const;

export type CardanoMessageType = typeof CARDANO_MESSAGES[keyof typeof CARDANO_MESSAGES];

export interface CardanoBackgroundService {
  sendAda(params: CardanoSendAdaParams): Promise<string>;
  getBalance(): Promise<CardanoBalance>;
  isReady(): boolean;
}
