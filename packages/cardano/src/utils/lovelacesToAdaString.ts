import BigNumber from 'bignumber.js';

const LOVELACE_VALUE = 1_000_000;
const DEFAULT_DECIMALS = 2;

export function lovelacesToAdaString(
  lovelaces: string,
  decimalValues: number = DEFAULT_DECIMALS,
  roundingMode: BigNumber.RoundingMode = BigNumber.ROUND_HALF_UP
): string {
  return new BigNumber(lovelaces).dividedBy(LOVELACE_VALUE).toFixed(decimalValues, roundingMode);
} 