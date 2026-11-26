import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  EmptyAmountError,
  IAmountConfig,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
} from "@keplr-wallet/hooks";
import { useStore } from "../../stores";
import { CoinPretty, Dec, DecUtils, Int } from "@keplr-wallet/unit";
import { InputField } from "@components-v2/input-field";
import {
  parseDollarAmount,
  validateDecimalPlaces,
  hasValidDecimals,
} from "@utils/format";
import { useIntl } from "react-intl";
import { useLanguage } from "../../languages";
import style from "./stake-input.module.scss";

export const StakeInput: FunctionComponent<{
  label: string;
  availableBalance?: string;
  isToggleClicked?: boolean;
  amountConfig: IAmountConfig;
}> = observer(({ label, amountConfig, availableBalance, isToggleClicked }) => {
  const { priceStore } = useStore();
  const [inputInFiatCurrency, setInputInFiatCurrency] = useState<
    string | undefined
  >("");
  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;

  const intl = useIntl();
  const error = amountConfig.error;

  const errorText: string | undefined = useMemo(() => {
    if (error) {
      switch (error.constructor) {
        case EmptyAmountError:
          // No need to show the error to user.
          return;
        case InvalidNumberAmountError:
          return intl.formatMessage({
            id: "input.amount.error.invalid-number",
          });
        case ZeroAmountError:
          return intl.formatMessage({
            id: "input.amount.error.is-zero",
          });
        case NegativeAmountError:
          return intl.formatMessage({
            id: "input.amount.error.is-negative",
          });
        case InsufficientAmountError:
          return intl.formatMessage({
            id: "input.amount.error.insufficient",
          });
        default:
          return intl.formatMessage({ id: "input.amount.error.unknown" });
      }
    }
  }, [intl, error]);

  const validateDecimalNumber = (input: string) => {
    // Use the match() method with a regular expression
    const isDecimal = input.match(/^\d*\.?\d*$/);

    // Return true if it's a valid decimal number, otherwise return false
    return isDecimal !== null;
  };

  const convertToFiatCurrency = (currency: any) => {
    const value = priceStore.calculatePrice(currency, fiatCurrency);
    return value && value.shrink(true).maxDecimals(6).toString();
  };

  useEffect(() => {
    const currencyDecimals = amountConfig.sendCurrency.coinDecimals;

    let dec = new Dec(amountConfig.amount ? amountConfig.amount : "0");
    dec = dec.mul(DecUtils.getTenExponentNInPrecisionRange(currencyDecimals));
    const amountInNumber = dec.truncate().toString();
    const inputValue = new CoinPretty(
      amountConfig.sendCurrency,
      new Int(amountInNumber)
    );
    const inputValueInUsd = convertToFiatCurrency(inputValue);
    setInputInFiatCurrency(inputValueInUsd);
  }, [amountConfig.amount]);

  return (
    <div>
      <InputField
        label={label}
        inputClassname={style["stakeInput"]}
        inputContainerClassName={style["stakeInputContainer"]}
        value={
          isToggleClicked
            ? parseDollarAmount(inputInFiatCurrency).toString()
            : amountConfig.amount
        }
        placeholder={`0`}
        rightIcon={
          <div className={style["stakeInputDenomSection"]}>
            {isToggleClicked
              ? fiatCurrency.toUpperCase()
              : amountConfig.sendCurrency.coinDenom}
          </div>
        }
        onChange={(e) => {
          let value = e.target.value.replace(/[^0-9.]/g, "");

          if (value === "") {
            amountConfig.setAmount("");
            return;
          }

          if (!validateDecimalPlaces(value)) {
            return;
          }

          if (
            validateDecimalNumber(value) &&
            Number(value) < 10 ** 18 &&
            hasValidDecimals(value)
          ) {
            if (value !== "0") {
              // Remove leading zeros
              for (let i = 0; i < value.length; i++) {
                if (value[i] === "0" && value[i + 1] !== ".") {
                  value = value.replace("0", "");
                } else {
                  break;
                }
              }
            }
            isToggleClicked
              ? parseDollarAmount(inputInFiatCurrency)
              : amountConfig.setAmount(value);
          }
        }}
        onBeforeInput={(e) => {
          const data = (e as any).data;
          if (data && !/[0-9.]/.test(data)) {
            e.preventDefault();
          }
        }}
        bottomContent={
          <div className={style["stakeInputAvailableBalance"]}>
            {`${intl.formatMessage({
              id: "unstake.available",
            })} ${availableBalance}`}
          </div>
        }
      />

      {error && (
        <div className={style["stakeInputErrorMessage"]}>{errorText}</div>
      )}
    </div>
  );
});
