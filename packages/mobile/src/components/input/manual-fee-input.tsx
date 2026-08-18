import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { ViewStyle } from "react-native";
import { IFeeConfig, IGasConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { InputCardView } from "components/new/card-view/input-card";
import { useStyle } from "styles/index";
import { useStore } from "stores/index";
import { getMinimumGasPrice } from "./min-gas-price";

export const ManualFeeInput: FunctionComponent<{
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  gasSimulator?: IGasSimulator;
  onValidationChange?: (hasError: boolean) => void;
}> = observer(({ feeConfig, gasConfig, gasSimulator, onValidationChange }) => {
  const style = useStyle();
  const { chainStore } = useStore();

  const feeCurrency = feeConfig.feeCurrency as any;
  const coinDecimals: number = feeCurrency?.coinDecimals ?? 6;
  const minimalDenom: string = feeCurrency?.coinMinimalDenom ?? "";
  const displayDenom: string = feeCurrency?.coinDenom ?? "";

  const [minimumGasPriceData, setMinimumGasPriceData] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    const rpc = chainStore.current.rpc;
    const gasPrices = chainStore.current.feeCurrencies?.[0].gasPriceStep;
    const fallback = (gasPrices?.low || gasPrices?.average || 0).toString();
    const isEvm = chainStore.current.features?.includes("evm") ?? false;

    getMinimumGasPrice(rpc, fallback, isEvm).then((result) => {
      if (!cancelled) setMinimumGasPriceData(result);
    });

    return () => {
      cancelled = true;
    };
  }, [
    chainStore,
    chainStore.current.rpc,
    chainStore.current.chainId,
    chainStore.current.features,
  ]);

  const minGasPrice = parseFloat(minimumGasPriceData ?? "0") || 0;

  const initials = useMemo(() => {
    const feePrimitive = feeConfig.getFeePrimitive();
    const gas = Math.max(gasConfig.gas, 1);
    const feeMinimal = feePrimitive ? parseInt(feePrimitive.amount) || 0 : 0;
    const gasPrice = feeMinimal / gas;
    const feeDisplay = feeMinimal / Math.pow(10, coinDecimals);
    return {
      gasPrice: gasPrice.toString(),
      feeAmount: feeDisplay.toFixed(coinDecimals),
      gasLimit: gasConfig.gasRaw,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [gasPriceRaw, setGasPriceRaw] = useState(initials.gasPrice);
  const [feeAmountRaw, setFeeAmountRaw] = useState(initials.feeAmount);
  const [gasLimitRaw, setGasLimitRaw] = useState(initials.gasLimit);
  const [lastEdited, setLastEdited] = useState<"price" | "amount">("price");
  const [gasPriceError, setGasPriceError] = useState("");
  const [feeAmountError, setFeeAmountError] = useState("");
  const [gasLimitError, setGasLimitError] = useState("");

  const minFeeAmount = useMemo(() => {
    if (minGasPrice <= 0) return 0;
    const gasLimit = parseInt(gasLimitRaw) || 0;
    return (minGasPrice * gasLimit) / Math.pow(10, coinDecimals);
  }, [minGasPrice, gasLimitRaw, coinDecimals]);

  useEffect(() => {
    onValidationChange?.(
      Boolean(gasPriceError || feeAmountError || gasLimitError)
    );
  }, [gasPriceError, feeAmountError, gasLimitError, onValidationChange]);

  // Re-run validation once minGasPrice resolves from RPC (mirrors extension behaviour)
  useEffect(() => {
    if (minGasPrice > 0) {
      setGasPriceError(validateGasPrice(gasPriceRaw));
      setFeeAmountError(validateFeeAmount(feeAmountRaw));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minGasPrice]);

  const validateGasPrice = (value: string): string => {
    if (minGasPrice <= 0) return "";
    const parsed = parseFloat(value) || 0;
    if (parsed < minGasPrice) {
      return `Minimum gas price is ${minGasPrice} ${minimalDenom}/gas`;
    }
    return "";
  };

  const validateFeeAmount = (value: string): string => {
    if (minFeeAmount <= 0) return "";
    const parsed = parseFloat(value) || 0;
    if (parsed < minFeeAmount) {
      return `Minimum fee is ${minFeeAmount.toFixed(
        coinDecimals
      )} ${displayDenom}`;
    }
    return "";
  };

  const validateGasLimit = (value: string): string => {
    const gasLimit = parseInt(value);
    if (!gasLimit || gasLimit <= 0) {
      return "Gas limit must be greater than 0";
    }
    return "";
  };

  const trimLeadingZeros = (value: string) => {
    if (!value) return value;
    if (value.startsWith(".")) return `0${value}`;
    return value.replace(/^0+(?=\d)/, "");
  };

  const disableSimulator = () => {
    if (gasSimulator?.enabled) {
      gasSimulator.setEnabled(false);
    }
  };

  const applyFee = (feeAmountStr: string, gasLimitStr: string) => {
    const gasLimit = parseInt(gasLimitStr) || 0;
    const feeDisplay = parseFloat(feeAmountStr) || 0;
    const feeMinimal = Math.round(feeDisplay * Math.pow(10, coinDecimals));
    gasConfig.setGas(gasLimit);
    if (minimalDenom) {
      feeConfig.setManualFee({
        denom: minimalDenom,
        amount: feeMinimal.toString(),
      });
    }
  };

  const handleGasPriceChange = (rawValue: string) => {
    const value = trimLeadingZeros(rawValue);
    const regex = new RegExp(
      `^\\d{0,${coinDecimals}}(\\.\\d{0,${coinDecimals}})?$`
    );
    if (!regex.test(value)) return;

    setGasPriceRaw(value);
    setGasPriceError(validateGasPrice(value));
    setLastEdited("price");
    disableSimulator();

    const gasPrice = parseFloat(value) || 0;
    const gasLimit = parseInt(gasLimitRaw) || 0;
    const feeMinimal = gasPrice * gasLimit;
    const feeDisplay = feeMinimal / Math.pow(10, coinDecimals);
    const newFeeAmount = feeDisplay.toFixed(coinDecimals);
    const displayFee = parseFloat(newFeeAmount) === 0 ? "0" : newFeeAmount;
    setFeeAmountRaw(displayFee);
    setFeeAmountError(validateFeeAmount(displayFee));
    applyFee(newFeeAmount, gasLimitRaw);
  };

  const handleFeeAmountChange = (rawValue: string) => {
    const value = trimLeadingZeros(rawValue);
    const regex = new RegExp(
      `^\\d{0,${coinDecimals}}(\\.\\d{0,${coinDecimals}})?$`
    );
    if (!regex.test(value)) return;

    setFeeAmountRaw(value);
    setFeeAmountError(validateFeeAmount(value));
    setLastEdited("amount");
    disableSimulator();

    const feeDisplay = parseFloat(value) || 0;
    const gasLimit = parseInt(gasLimitRaw) || 0;
    const feeMinimal = feeDisplay * Math.pow(10, coinDecimals);
    const gasPrice = gasLimit > 0 ? feeMinimal / gasLimit : 0;
    const newGasPrice =
      gasPrice === 0
        ? "0"
        : parseFloat(gasPrice.toFixed(coinDecimals)).toString();
    setGasPriceRaw(newGasPrice);
    setGasPriceError(validateGasPrice(newGasPrice));
    applyFee(value, gasLimitRaw);
  };

  const handleGasLimitChange = (rawValue: string) => {
    const value = trimLeadingZeros(rawValue.replace(/[^0-9]/g, ""));
    setGasLimitRaw(value);
    disableSimulator();
    setGasLimitError(validateGasLimit(value));

    const gasLimit = parseInt(value) || 0;
    if (lastEdited === "price") {
      const gasPrice = parseFloat(gasPriceRaw) || 0;
      const feeMinimal = gasPrice * gasLimit;
      const feeDisplay = feeMinimal / Math.pow(10, coinDecimals);
      const newFeeAmount = feeDisplay.toFixed(coinDecimals);
      const displayFee = parseFloat(newFeeAmount) === 0 ? "0" : newFeeAmount;
      setFeeAmountRaw(displayFee);
      const newMinFee =
        minGasPrice > 0
          ? (minGasPrice * gasLimit) / Math.pow(10, coinDecimals)
          : 0;
      setFeeAmountError(
        newMinFee > 0 && (parseFloat(displayFee) || 0) < newMinFee
          ? `Min fee is ${newMinFee.toFixed(coinDecimals)} ${displayDenom}`
          : ""
      );
      applyFee(newFeeAmount, value);
    } else {
      const feeDisplay = parseFloat(feeAmountRaw) || 0;
      const feeMinimal = feeDisplay * Math.pow(10, coinDecimals);
      const gasPrice = gasLimit > 0 ? feeMinimal / gasLimit : 0;
      const newGasPrice = gasPrice.toString();
      setGasPriceRaw(newGasPrice);
      setGasPriceError(validateGasPrice(newGasPrice));
      applyFee(feeAmountRaw, value);
    }
  };

  return (
    <React.Fragment>
      <InputCardView
        label={`Gas Price (${minimalDenom}/gas)`}
        placeholder="0"
        value={gasPriceRaw}
        onChangeText={handleGasPriceChange}
        labelStyle={
          style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
        }
        containerStyle={style.flatten(["margin-bottom-16"]) as ViewStyle}
        keyboardType="decimal-pad"
        error={gasPriceError || undefined}
      />
      <InputCardView
        label={`Fee Amount (${displayDenom})`}
        placeholder="0"
        value={feeAmountRaw}
        onChangeText={handleFeeAmountChange}
        labelStyle={
          style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
        }
        containerStyle={style.flatten(["margin-bottom-16"]) as ViewStyle}
        keyboardType="decimal-pad"
        error={feeAmountError || undefined}
      />
      <InputCardView
        label="Gas Limit"
        placeholder="0"
        value={gasLimitRaw}
        onChangeText={handleGasLimitChange}
        labelStyle={
          style.flatten(["margin-y-0", "margin-bottom-12"]) as ViewStyle
        }
        containerStyle={style.flatten(["margin-bottom-16"]) as ViewStyle}
        keyboardType="numeric"
        error={gasLimitError || undefined}
      />
    </React.Fragment>
  );
});
