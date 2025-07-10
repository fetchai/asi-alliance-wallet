import React, { FunctionComponent, useEffect, useMemo, useState } from "react";

import classnames from "classnames";
import styleCoinInput from "./coin-input.module.scss";

import {
  BridgeAmountError,
  EmptyAmountError,
  IAmountConfig,
  InsufficientAmountError,
  InvalidNumberAmountError,
  NegativeAmountError,
  ZeroAmountError,
} from "@keplr-wallet/hooks";
import { AppCurrency } from "@keplr-wallet/types";
import { CoinPretty, Dec, DecUtils, Int } from "@keplr-wallet/unit";
import {
  hasValidDecimals,
  parseDollarAmount,
  parseExponential,
  validateDecimalPlaces,
} from "@utils/format";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import { FormGroup, Label } from "reactstrap";
import { useLanguage } from "../../languages";
import { useStore } from "../../stores";
import { Card } from "../card";
import { Dropdown } from "../dropdown";
import { SUPPORTED_LOCALE_FIAT_CURRENCIES } from "../../config.ui";

export interface CoinInputProps {
  amountConfig: IAmountConfig;
  balanceText?: string;
  className?: string;
  label?: string;
  disableAllBalance?: boolean;
  overrideSelectableCurrencies?: AppCurrency[];
  dropdownDisabled?: boolean;
  onPress?: () => void;
}

export const CoinInput: FunctionComponent<CoinInputProps> = observer(
  ({ amountConfig, disableAllBalance, onPress }) => {
    const intl = useIntl();
    const [inputInFiatCurrency, setInputInFiatCurrency] = useState<
      string | undefined
    >("");
    const [isToggleClicked, setIsToggleClicked] = useState<boolean>(false);

    const { priceStore } = useStore();

    const language = useLanguage();
    const fiatCurrency = language.fiatCurrency;
    const convertToFiatCurrency = (currency: any) => {
      const value = priceStore.calculatePrice(currency, fiatCurrency);
      const inUsd = value && value.shrink(true).maxDecimals(6).toString();
      return inUsd;
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

    const [randomId] = useState(() => {
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);
      return Buffer.from(bytes).toString("hex");
    });

    const error = amountConfig.error;
    const errorText: string | undefined = useMemo(() => {
      if (error) {
        switch (error.constructor) {
          case EmptyAmountError:
            // No need to show the error to the user.
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
          case BridgeAmountError:
            return error.message;
          default:
            return intl.formatMessage({ id: "input.amount.error.unknown" });
        }
      }
    }, [intl, error]);

    const resizable = (el: any) => {
      const int = 17.7;
      const resize = () => {
        el.style.width = `${(el.value.length + 1) * int}px`;
      };
      const events = ["keyup", "keypress", "focus", "blur", "change"];
      for (const event of events) {
        el.addEventListener(event, resize, false);
      }
      resize();
    };
    useEffect(() => {
      const inputElement = document.getElementById(`input-${randomId}`);
      if (inputElement) {
        resizable(inputElement);
      }
    }, [randomId]);

    const isClicked = () => {
      setIsToggleClicked(!isToggleClicked);
    };

    useEffect(() => {
      const inputElement = document.getElementById(`input-${randomId}`);
      const charWidth = 17.7;
      const resize = (el: any) => {
        el.style.width = `${(el.value.length + 1) * charWidth}px`;
      };
      if (inputElement) {
        resize(inputElement);
      }
    }, [inputInFiatCurrency, isToggleClicked]);

    const currency =
      priceStore.supportedVsCurrencies[fiatCurrency]?.currency?.toUpperCase();

    return (
      <React.Fragment>
        <FormGroup className={styleCoinInput["input-size"]}>
          <div className={styleCoinInput["input-container"]}>
            <div className={styleCoinInput["amount-label"]}>
              <div>ENTER AMOUNT</div>
            </div>
            <div className={styleCoinInput["input-wrapper"]}>
              <input
                placeholder={`0`}
                className={classnames(
                  "form-control-alternative",
                  styleCoinInput["input"],
                  { [styleCoinInput["input-error"]]: errorText != null }
                )}
                id={`input-${randomId}`}
                type="number"
                step="any"
                value={
                  isToggleClicked &&
                  amountConfig.sendCurrency["coinGeckoId"] !== undefined
                    ? parseDollarAmount(inputInFiatCurrency).toString()
                    : parseExponential(
                        amountConfig.amount,
                        amountConfig.sendCurrency.coinDecimals
                      )
                }
                onChange={(e: any) => {
                  e.preventDefault();
                  let value = e.target.value;
                  if (value !== "" && !validateDecimalPlaces(value)) {
                    return;
                  }

                  if (value !== "0") {
                    // Remove leading zeros
                    value = value.replace(/^0+(?!\.)/, "");
                  }

                  if (
                    (Number(value) < 10 ** 9 && hasValidDecimals(value)) ||
                    value === "0" ||
                    value === ""
                  ) {
                    if (
                      parseExponential(
                        amountConfig.amount,
                        amountConfig.sendCurrency.coinDecimals
                      ).toString().length > 1 &&
                      isNaN(parseFloat(value))
                    ) {
                      return;
                    }
                    isToggleClicked &&
                    amountConfig.sendCurrency["coinGeckoId"] !== undefined
                      ? parseDollarAmount(inputInFiatCurrency)
                      : amountConfig.setAmount(value);
                  }
                }}
                min={0}
                autoComplete="off"
              />

              <span>
                {isToggleClicked &&
                amountConfig.sendCurrency["coinGeckoId"] !== undefined
                  ? fiatCurrency.toUpperCase()
                  : amountConfig.sendCurrency.coinDenom.split(" ")[0]}
              </span>
            </div>
            <div className={styleCoinInput["amount-usd"]}>
              {isToggleClicked ||
              amountConfig.sendCurrency["coinGeckoId"] == undefined
                ? `${amountConfig.amount} ${amountConfig.sendCurrency.coinDenom}`
                : `${inputInFiatCurrency} ${currency}`}
            </div>
            {errorText != null ? (
              <div className={styleCoinInput["errorText"]}>{errorText}</div>
            ) : null}
          </div>
          <div className={styleCoinInput["right-widgets"]}>
            <button
              style={{ margin: "0px" }}
              className={styleCoinInput["widgetButton"]}
              onClick={isClicked}
              disabled={
                !SUPPORTED_LOCALE_FIAT_CURRENCIES.includes(fiatCurrency) ||
                amountConfig.sendCurrency["coinGeckoId"] == undefined
              }
            >
              <img src={require("@assets/svg/wireframe/chevron.svg")} alt="" />
              {`Change to ${
                !isToggleClicked ||
                amountConfig.sendCurrency["coinGeckoId"] == undefined
                  ? fiatCurrency.toUpperCase()
                  : amountConfig.sendCurrency.coinDenom
              }`}
            </button>
            {!disableAllBalance ? (
              <button
                style={{ margin: "0px" }}
                className={styleCoinInput["widgetButton"]}
                onClick={(e) => {
                  e.preventDefault();
                  onPress ? onPress() : amountConfig.toggleIsMax();
                }}
              >
                Use max
              </button>
            ) : null}
          </div>
        </FormGroup>
      </React.Fragment>
    );
  }
);

export interface TokenDropdownProps {
  dropdownDisabled?: boolean;
  amountConfig: IAmountConfig;
  overrideSelectableCurrencies?: AppCurrency[];
}
export const TokenSelectorDropdown: React.FC<TokenDropdownProps> = ({
  amountConfig,
  overrideSelectableCurrencies,
}) => {
  const [isOpenTokenSelector, setIsOpenTokenSelector] = useState(false);
  const [inputInFiatCurrency, setInputInFiatCurrency] = useState<
    string | undefined
  >("");
  const { queriesStore, priceStore, accountStore, chainStore, analyticsStore } =
    useStore();
  const isEvm = chainStore.current.features?.includes("evm") ?? false;
  const accountInfo = accountStore.getAccount(chainStore.current.chainId);
  const queries = queriesStore.get(chainStore.current.chainId);
  const queryBalances = queriesStore
    .get(amountConfig.chainId)
    .queryBalances.getQueryBech32Address(amountConfig.sender);

  const selectableCurrencies = (
    overrideSelectableCurrencies ||
    queries.cosmos.querySpendableBalances
      .getQueryBech32Address(accountInfo.bech32Address)
      .balances.map((b) => b.currency)
  )
    .filter((cur) => {
      const bal = queryBalances.getBalanceFromCurrency(cur);
      return !bal.toDec().isZero();
    })
    .sort((a, b) => {
      return a.coinDenom < b.coinDenom ? -1 : 1;
    });
  const spendableBalances = queries.cosmos.querySpendableBalances
    .getQueryBech32Address(accountInfo.bech32Address)
    .balances?.find(
      (bal) =>
        amountConfig.sendCurrency.coinMinimalDenom ===
        bal.currency.coinMinimalDenom
    );
  const balance = spendableBalances
    ? spendableBalances
    : new CoinPretty(amountConfig.sendCurrency, new Int(0));

  const language = useLanguage();
  const fiatCurrency = language.fiatCurrency;
  const convertToFiatCurrency = (currency: any) => {
    const value = priceStore.calculatePrice(currency, fiatCurrency);
    const inUsd = value && value.shrink(true).maxDecimals(6).toString();
    return inUsd;
  };

  const balancesMap = new Map(
    queryBalances.balances.map((bal) => [
      bal.currency.coinMinimalDenom,
      bal.balance,
    ])
  );

  const balanceETH =
    balancesMap.get(amountConfig.sendCurrency.coinMinimalDenom) ||
    new CoinPretty(amountConfig.sendCurrency, new Int(0));

  useEffect(() => {
    const currentChainBalance = isEvm ? balanceETH : balance;
    const valueInUsd = convertToFiatCurrency(currentChainBalance);
    setInputInFiatCurrency(valueInUsd);
  }, [amountConfig.sendCurrency]);

  return (
    <React.Fragment>
      <Label className={styleCoinInput["label"]}>Asset</Label>
      <Card
        style={{
          border: "1px solid var(--bg-grey-dark)",
          background: "#FFF",
          padding: "12px 18px",
          marginBottom: "0px",
        }}
        onClick={() => {
          setIsOpenTokenSelector(!isOpenTokenSelector);
          analyticsStore.logEvent("send_from_click", {
            pageName: "Send",
          });
        }}
        heading={<div>{amountConfig.sendCurrency.coinDenom}</div>}
        rightContent={require("@assets/svg/wireframe/chevron-down.svg")}
        subheading={
          <div
            style={{
              color: "var(--font-secondary)",
              fontSize: "12px",
            }}
          >
            {" "}
            {`Available: ${
              isEvm
                ? balanceETH.shrink(true).maxDecimals(6).toString()
                : balance.shrink(true).maxDecimals(6).toString()
            } `}
            {inputInFiatCurrency &&
              `(${inputInFiatCurrency} ${fiatCurrency.toUpperCase()})`}
          </div>
        }
      />
      <Dropdown
        setIsOpen={setIsOpenTokenSelector}
        isOpen={isOpenTokenSelector}
        title="Asset"
        closeClicked={() => {
          setIsOpenTokenSelector(false);
        }}
      >
        {selectableCurrencies.map((currency) => {
          const currencyBalance =
            balancesMap.get(currency.coinMinimalDenom) ||
            new CoinPretty(currency, new Int(0));

          return (
            <Card
              heading={currency.coinDenom}
              key={currency.coinMinimalDenom}
              isActive={
                currency.coinMinimalDenom ===
                amountConfig.sendCurrency.coinMinimalDenom
              }
              onClick={async (e: any) => {
                e.preventDefault();
                amountConfig.setSendCurrency(currency);
                analyticsStore.logEvent("select_token_click", {
                  pageName: "Send",
                });
              }}
              rightContent={`${currencyBalance
                .shrink(true)
                .maxDecimals(6)
                .toString()}`}
            />
          );
        })}
      </Dropdown>
    </React.Fragment>
  );
};
