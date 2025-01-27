export interface Result {
  /**
   * NOTE: If `error` is of type `{ module:string; code: number; message: string }`,
   * it should be considered and processed as `WalletError`.
   */
  error?: string | { module: string; code: number; message: string };
  return?: any;
}
