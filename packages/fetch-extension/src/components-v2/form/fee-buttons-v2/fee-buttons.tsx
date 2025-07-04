import React, {
  FunctionComponent,
  MouseEvent,
  useEffect,
  useState,
} from "react";

import { FormFeedback, FormGroup } from "reactstrap";

import { ButtonV2 } from "@components-v2/buttons/button";
import { ToggleSwitchButton } from "@components-v2/buttons/toggle-switch-button";
import { Card } from "@components-v2/card";
import { Dropdown } from "@components-v2/dropdown";
import {
  IFeeConfig,
  IGasConfig,
  IGasSimulator,
  InsufficientFeeError,
  NotLoadedFeeError,
} from "@keplr-wallet/hooks";
import { CoinGeckoPriceStore } from "@keplr-wallet/stores";
import { action, autorun, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { useIntl } from "react-intl";
import { useLanguage } from "../../../languages";
import { useStore } from "../../../stores";
import { GasContainer } from "../gas-form";
import { GasInput } from "../gas-input";
import { FeeCurrencySelector } from "./fee-currency-selector";
import feeButtonStyles from "./fee-buttons.module.scss";

export interface FeeButtonsProps {
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  priceStore: CoinGeckoPriceStore;

  className?: string;
  label?: string;
  feeSelectLabels?: {
    low: string;
    average: string;
    high: string;
  };

  gasLabel?: string;
  gasSimulator?: IGasSimulator;
  pageName?: string;

  showFeeCurrencySelectorUnderSetGas?: boolean;
}

class FeeButtonState {
  @observable
  protected _isGasInputOpen: boolean = false;

  constructor() {
    makeObservable(this);
  }

  get isGasInputOpen(): boolean {
    return this._isGasInputOpen;
  }

  @action
  setIsGasInputOpen(open: boolean) {
    this._isGasInputOpen = open;
  }
}

export const FeeButtons: FunctionComponent<FeeButtonsProps> = observer(
  ({
    feeConfig,
    gasConfig,
    priceStore,
    label,
    feeSelectLabels = { low: "Low", average: "Average", high: "High" },
    gasLabel,
    gasSimulator,
    showFeeCurrencySelectorUnderSetGas,
  }) => {
    const { queriesStore } = useStore();

    // This may be not the good way to handle the states across the components.
    // But, rather than using the context API with boilerplate code, just use the mobx state to simplify the logic.
    const [feeButtonState] = useState(() => new FeeButtonState());

    useEffect(() => {
      // Try to find other fee currency if the account doesn't have enough fee to pay.
      // This logic can be slightly complex, so use mobx's `autorun`.
      // This part fairly different with the approach of react's hook.
      let skip = false;
      // Try until 500ms to avoid the confusion to user.
      const timeoutId = setTimeout(() => {
        skip = true;
      }, 500);

      const disposer = autorun(() => {
        if (
          !skip &&
          !feeConfig.isManual &&
          feeConfig.feeCurrencies.length > 1 &&
          feeConfig.feeCurrency &&
          feeConfig.feeCurrencies[0].coinMinimalDenom ===
            feeConfig.feeCurrency.coinMinimalDenom
        ) {
          const queryBalances = queriesStore
            .get(feeConfig.chainId)
            .queryBalances.getQueryBech32Address(feeConfig.sender);

          // Basically, `FeeConfig` implementation select the first fee currency as default.
          // So, let's put the priority to first fee currency.
          const firstFeeCurrency = feeConfig.feeCurrencies[0];
          const firstFeeCurrencyBal =
            queryBalances.getBalanceFromCurrency(firstFeeCurrency);

          if (feeConfig.feeType) {
            const fee = feeConfig.getFeeTypePrettyForFeeCurrency(
              firstFeeCurrency,
              feeConfig.feeType
            );
            if (firstFeeCurrencyBal.toDec().lt(fee.toDec())) {
              // Not enough balances for fee.
              // Try to find other fee currency to send.
              for (const feeCurrency of feeConfig.feeCurrencies) {
                const feeCurrencyBal =
                  queryBalances.getBalanceFromCurrency(feeCurrency);
                const fee = feeConfig.getFeeTypePrettyForFeeCurrency(
                  feeCurrency,
                  feeConfig.feeType
                );

                if (feeCurrencyBal.toDec().gte(fee.toDec())) {
                  feeConfig.setAutoFeeCoinMinimalDenom(
                    feeCurrency.coinMinimalDenom
                  );
                  skip = true;
                  return;
                }
              }
            }
          }
        }
      });

      return () => {
        clearTimeout(timeoutId);
        disposer();
      };
    }, [feeConfig, queriesStore]);

    return (
      <React.Fragment>
        {feeConfig.feeCurrencies.length > 1 &&
        !showFeeCurrencySelectorUnderSetGas ? (
          <FeeCurrencySelector feeConfig={feeConfig} />
        ) : null}
        {feeConfig.feeCurrency ? (
          <FeeButtonsInner
            feeConfig={feeConfig}
            priceStore={priceStore}
            label={label}
            feeSelectLabels={feeSelectLabels}
            feeButtonState={feeButtonState}
            gasSimulator={gasSimulator}
            gasConfig={gasConfig}
            gasLabel={gasLabel}
            showFeeCurrencySelectorUnderSetGas={
              showFeeCurrencySelectorUnderSetGas
            }
          />
        ) : null}
      </React.Fragment>
    );
  }
);

export const FeeButtonsInner: FunctionComponent<
  Pick<
    FeeButtonsProps,
    | "feeConfig"
    | "priceStore"
    | "label"
    | "feeSelectLabels"
    | "gasSimulator"
    | "gasConfig"
    | "gasLabel"
    | "showFeeCurrencySelectorUnderSetGas"
    | "pageName"
  > & { feeButtonState: FeeButtonState }
> = observer(
  ({
    feeConfig,
    priceStore,
    feeSelectLabels = { low: "Low", average: "Average", high: "High" },
    feeButtonState,
    gasConfig,
    gasLabel,
    gasSimulator,
    showFeeCurrencySelectorUnderSetGas,
    pageName,
  }) => {
    const [isFeeDropdownOpen, setIsFeeDropdownOpen] = useState(false);

    useEffect(() => {
      if (feeConfig.feeCurrency && !feeConfig.fee) {
        feeConfig.setFeeType("average");
      }
    }, [feeConfig, feeConfig.feeCurrency, feeConfig.fee]);

    const { chainStore, analyticsStore } = useStore();

    const intl = useIntl();
    const isEvm = chainStore.current.features?.includes("evm") ?? false;

    const language = useLanguage();

    // For chains without feeCurrencies, Keplr assumes tx doesn’t need to include information about the fee and the fee button does not have to be rendered.
    // The architecture is designed so that fee button is not rendered if the parental component doesn’t have a feeCurrency.
    // However, because there may be situations where the fee buttons is rendered before the chain information is changed,
    // and the fee button is an observer, and the sequence of rendering the observer may not appear stabilized,
    // so only handling the rendering in the parent component may not be sufficient
    // Therefore, this line double checks to ensure that the fee buttons is not rendered if fee currency doesn’t exist.
    // But because this component uses hooks, using a hook in the line below can cause an error.
    // Note that hooks should be used above this line, and only rendering-related logic should exist below this line.
    if (!feeConfig.feeCurrency) {
      return <React.Fragment />;
    }

    const fiatCurrency = language.fiatCurrency;

    const lowFee = feeConfig.getFeeTypePretty("low");
    const lowFeePrice = priceStore.calculatePrice(lowFee, fiatCurrency);

    const averageFee = feeConfig.getFeeTypePretty("average");
    const averageFeePrice = priceStore.calculatePrice(averageFee, fiatCurrency);

    const highFee = feeConfig.getFeeTypePretty("high");
    const highFeePrice = priceStore.calculatePrice(highFee, fiatCurrency);

    const error = feeConfig.error;
    const errorText: string | undefined = (() => {
      if (error) {
        switch (error.constructor) {
          case InsufficientFeeError:
            return intl.formatMessage({
              id: "input.fee.error.insufficient",
            });
          case NotLoadedFeeError:
            return undefined;
          default:
            return (
              error.message ||
              intl.formatMessage({ id: "input.fee.error.unknown" })
            );
        }
      }
    })();

    return (
      <FormGroup>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div className={feeButtonStyles["transactionFeeLabel"]}>
            Transaction fee:
          </div>

          <div
            style={{
              display: "flex",
              gap: "6px",
              alignItems: "center",
            }}
          >
            <div className={feeButtonStyles["transactionFeeValue"]}>
              {feeButtonState.isGasInputOpen
                ? gasConfig.gasRaw
                : feeConfig.feeType === "low"
                ? lowFee.hideIBCMetadata(true).trim(true).toMetricPrefix(isEvm)
                : feeConfig.feeType === "average"
                ? averageFee
                    .hideIBCMetadata(true)
                    .trim(true)
                    .toMetricPrefix(isEvm)
                : highFee
                    .hideIBCMetadata(true)
                    .trim(true)
                    .toMetricPrefix(isEvm)}
            </div>

            <button
              style={{
                background: "transparent",
                borderRadius: "12px",
                padding: "2px 12px",
                border: "1px solid var(--bg-grey-dark)",
              }}
            >
              <img
                onClick={() => {
                  setIsFeeDropdownOpen((prev) => !prev);
                }}
                style={{
                  height: "12px",
                  width: "12px",
                }}
                src={require("@assets/svg/wireframe/setting.svg")}
                alt="settings"
              />
            </button>
          </div>
        </div>
        <Dropdown
          title="Transaction Fee"
          closeClicked={() => setIsFeeDropdownOpen(false)}
          showCloseIcon={true}
          isOpen={isFeeDropdownOpen}
          setIsOpen={setIsFeeDropdownOpen}
          styleProp={{
            paddingBottom: "64px",
          }}
        >
          <div>
            <Card
              onClick={(e: MouseEvent) => {
                feeConfig.setFeeType("low");
                e.preventDefault();
                analyticsStore.logEvent("fee_type_select", {
                  pageName: pageName,
                  feeType: "low",
                });
              }}
              style={{
                padding: "18px 16px",
                height: "54px",
              }}
              heading={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {feeSelectLabels.low}
                  <span
                    style={{
                      opacity: "0.6",
                      fontWeight: 400,
                      color: "var(--grey-white, #FFF)",
                      fontSize: "12px",
                      marginLeft: "5px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      width: "100px",
                      display: "inline-block",
                    }}
                  >
                    {lowFeePrice && lowFeePrice.trim(true).toString()}
                  </span>
                </div>
              }
              isActive={feeConfig.feeType === "low"}
              rightContent={
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 400,
                    opacity: "0.6",
                    display: "flex",
                    alignItems: "center",
                    gap: "2px",
                  }}
                >
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "50px",
                    }}
                  >
                    {
                      lowFee
                        .hideIBCMetadata(true)
                        .trim(true)
                        .toMetricPrefix(isEvm)
                        .toString()
                        .split(" ")[0]
                    }
                  </div>
                  <div>
                    {
                      lowFee
                        .hideIBCMetadata(true)
                        .trim(true)
                        .toMetricPrefix(isEvm)
                        .toString()
                        .split(" ")[1]
                    }
                  </div>
                </div>
              }
            />
            <Card
              isActive={feeConfig.feeType === "average"}
              heading={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {feeSelectLabels.average}{" "}
                  <span
                    style={{
                      opacity: "0.6",
                      fontWeight: 400,
                      color: "var(--grey-white, #FFF)",
                      fontSize: "12px",
                      marginLeft: "5px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      width: "100px",
                      display: "inline-block",
                    }}
                  >
                    {averageFeePrice && averageFeePrice.trim(true).toString()}
                  </span>
                </div>
              }
              onClick={(e: MouseEvent) => {
                feeConfig.setFeeType("average");
                e.preventDefault();
                analyticsStore.logEvent("fee_type_select", {
                  pageName: pageName,
                  feeType: "average",
                });
              }}
              style={{
                padding: "18px 16px",
                height: "54px",
              }}
              rightContent={
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 400,
                    opacity: "0.6",
                    display: "flex",
                    alignItems: "center",
                    gap: "2px",
                  }}
                >
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "50px",
                    }}
                  >
                    {
                      averageFee
                        .hideIBCMetadata(true)
                        .trim(true)
                        .toMetricPrefix(isEvm)
                        .toString()
                        .split(" ")[0]
                    }
                  </div>
                  <div>
                    {
                      averageFee
                        .hideIBCMetadata(true)
                        .trim(true)
                        .toMetricPrefix(isEvm)
                        .toString()
                        .split(" ")[1]
                    }
                  </div>
                </div>
              }
            />
            <Card
              isActive={feeConfig.feeType === "high"}
              heading={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {feeSelectLabels.high}{" "}
                  <span
                    style={{
                      opacity: "0.6",
                      fontWeight: 400,
                      color: "var(--grey-white, #FFF)",
                      fontSize: "12px",
                      marginLeft: "5px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      width: "100px",
                      display: "inline-block",
                    }}
                  >
                    {highFeePrice && highFeePrice.trim(true).toString()}
                  </span>
                </div>
              }
              onClick={(e: MouseEvent) => {
                feeConfig.setFeeType("high");
                e.preventDefault();
                analyticsStore.logEvent("fee_type_select", {
                  pageName: pageName,
                  feeType: "high",
                });
              }}
              style={{
                padding: "18px 16px",
                height: "54px",
              }}
              rightContent={
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 400,
                    opacity: "0.6",
                    display: "flex",
                    alignItems: "center",
                    gap: "2px",
                  }}
                >
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "50px",
                    }}
                  >
                    {
                      highFee
                        .hideIBCMetadata(true)
                        .trim(true)
                        .toMetricPrefix(isEvm)
                        .toString()
                        .split(" ")[0]
                    }
                  </div>
                  <div>
                    {
                      highFee
                        .hideIBCMetadata(true)
                        .trim(true)
                        .toMetricPrefix(isEvm)
                        .toString()
                        .split(" ")[1]
                    }
                  </div>
                </div>
              }
            />
            {errorText != null ? (
              <FormFeedback style={{ display: "block", position: "relative" }}>
                {errorText}
              </FormFeedback>
            ) : null}

            {/* XXX: In fact, it is not only set gas, but fee currency can also be set depending on the option. */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                marginTop: "12px",
              }}
            >
              <div className={feeButtonStyles["advancedSettingsLabel"]}>
                Advanced settings
              </div>

              <ToggleSwitchButton
                checked={feeButtonState.isGasInputOpen}
                onChange={() => {
                  feeButtonState.setIsGasInputOpen(
                    !feeButtonState.isGasInputOpen
                  );

                  analyticsStore.logEvent("fee_advance_click", {
                    pageName: pageName,
                  });
                }}
              />
              {/* <div>
                <label className={styleFeeButtons["switch"]}>
                  <input
                    type="checkbox"
                    checked={feeButtonState.isGasInputOpen}
                    onChange={() => {
                      feeButtonState.setIsGasInputOpen(
                        !feeButtonState.isGasInputOpen
                      );
                    }}
                  />
                  <span className={styleFeeButtons["slider"]} />
                </label>
              </div> */}
            </div>
          </div>

          {feeButtonState.isGasInputOpen || !feeConfig.feeCurrency ? (
            gasSimulator ? (
              feeConfig.feeCurrencies.length > 1 &&
              showFeeCurrencySelectorUnderSetGas ? (
                <React.Fragment>
                  <GasContainer
                    label={gasLabel}
                    gasConfig={gasConfig}
                    gasSimulator={gasSimulator}
                  />
                </React.Fragment>
              ) : (
                <GasContainer
                  label={gasLabel}
                  gasConfig={gasConfig}
                  gasSimulator={gasSimulator}
                />
              )
            ) : feeConfig.feeCurrencies.length > 1 &&
              showFeeCurrencySelectorUnderSetGas ? (
              <React.Fragment>
                <Card
                  style={{ background: "rgba(255, 255, 255, 0.10)" }}
                  heading={<FeeCurrencySelector feeConfig={feeConfig} />}
                >
                  <GasInput label={gasLabel} gasConfig={gasConfig} />
                </Card>
              </React.Fragment>
            ) : (
              <Card
                style={{ background: "rgba(255, 255, 255, 0.10)" }}
                heading={<GasInput label={gasLabel} gasConfig={gasConfig} />}
              />
            )
          ) : null}

          <ButtonV2
            variant="dark"
            text="Save changes"
            styleProps={{
              width: "94%",
              padding: "12px",
              height: "56px",
              margin: "0 auto",
              position: "fixed",
              bottom: "10px",
              left: "0px",
              right: "0px",
            }}
            onClick={() => {
              setIsFeeDropdownOpen(false);
            }}
            btnBgEnabled={true}
            disabled={errorText != null}
          />
        </Dropdown>
      </FormGroup>
    );
  }
);
