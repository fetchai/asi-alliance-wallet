import {
  AmountConfig,
  FeeConfig,
  GasConfig,
  MemoConfig,
  RecipientConfig,
} from "@keplr-wallet/hooks";

export interface SendConfigs {
  amountConfig: AmountConfig;
  memoConfig: MemoConfig;
  gasConfig: GasConfig;
  feeConfig: FeeConfig;
  recipientConfig: RecipientConfig;
}
