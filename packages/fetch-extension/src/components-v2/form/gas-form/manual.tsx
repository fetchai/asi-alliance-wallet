import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { IFeeConfig, IGasConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";
import { Input } from "reactstrap";
import { Card } from "@components-v2/card";
import styleAuto from "./auto.module.scss";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../../../stores";
import { getMinimumGasPrice } from "./utils";

type IFeeConfigWithManual = IFeeConfig & {
  setManualFee(fee: { denom: string; amount: string }): void;
};

const labelStyle: React.CSSProperties = {
  color: "var(--font-secondary)",
  fontSize: "14px",
  fontWeight: 400,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--bg-grey-dark)",
  padding: "12px 18px",
  height: "48px",
};

const cardErrorStyle: React.CSSProperties = {
  ...cardStyle,
  border: "1px solid var(--color-border-danger, #e24b4a)",
};

const headingStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
};

const middleSectionStyle: React.CSSProperties = {
  width: "100%",
};

const errorTextStyle: React.CSSProperties = {
  color: "var(--danger)",
  fontSize: "12px",
  marginTop: "-10px",
};

export const ManualFeeInput: FunctionComponent<{
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  gasSimulator?: IGasSimulator;
  onValidationChange?: (hasError: boolean) => void;
}> = observer(
  ({ feeConfig: _feeConfig, gasConfig, gasSimulator, onValidationChange }) => {
    const feeConfig = _feeConfig as IFeeConfigWithManual;
    const feeCurrency = feeConfig.feeCurrency;
    const coinDecimals = feeCurrency?.coinDecimals ?? 6;
    const minimalDenom = feeCurrency?.coinMinimalDenom ?? "";
    const displayDenom = feeCurrency?.coinDenom ?? "";
    const { chainStore } = useStore();
    const { data: minimumGasPrice } = useQuery({
      queryKey: [
        "minimumGasPrice",
        chainStore.current.rpc,
        chainStore.current.chainId,
      ],
      queryFn: async () => {
        const rpc = chainStore.current.rpc;
        const gasPrices = chainStore.current.feeCurrencies?.[0].gasPriceStep;
        const gasPrice = gasPrices?.low || gasPrices?.average || 0;
        return await getMinimumGasPrice(rpc, gasPrice.toString());
      },
      staleTime: 60 * 1000,
      retry: false,
    });

    const minGasPrice = parseFloat(minimumGasPrice ?? "0") || 0;

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
    const [gasPriceError, setGasPriceError] = useState<string>("");
    const [feeAmountError, setFeeAmountError] = useState<string>("");
    const [gasLimitError, setGasLimitError] = useState<string>("");

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
        return `Min gas price is ${minGasPrice} ${minimalDenom}/gas`;
      }
      return "";
    };

    const validateFeeAmount = (value: string): string => {
      if (minFeeAmount <= 0) return "";
      const parsed = parseFloat(value) || 0;
      if (parsed < minFeeAmount) {
        return `Min fee is ${minFeeAmount.toFixed(
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

    const trimLeadingZeros = (value: string) => {
      if (!value) return value;
      if (value.startsWith(".")) return `0${value}`;
      return value.replace(/^0+(?=\d)/, "");
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
      const value = trimLeadingZeros(rawValue);
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

    const renderField = (
      label: string,
      value: string,
      onChange: (v: string) => void,
      integerOnly = false,
      error = ""
    ) => (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={labelStyle}>{label}</div>
        <Card
          style={error ? cardErrorStyle : cardStyle}
          headingStyle={headingStyle}
          middleSectionStyle={middleSectionStyle}
          heading={
            <Input
              className={styleAuto["input"]}
              style={{ background: "transparent" }}
              type="text"
              inputMode={integerOnly ? "numeric" : "decimal"}
              value={value}
              invalid={!!error}
              onChange={(e) => {
                const raw = integerOnly
                  ? e.target.value.replace(/[^0-9]/g, "")
                  : e.target.value.replace(/[^0-9.]/g, "");
                onChange(raw);
              }}
              autoComplete="off"
            />
          }
        />
        {error && <div style={errorTextStyle}>{error}</div>}
      </div>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {renderField(
          `Gas Price (${minimalDenom}/gas)`,
          gasPriceRaw,
          handleGasPriceChange,
          false,
          gasPriceError
        )}
        {renderField(
          `Fee Amount (${displayDenom})`,
          feeAmountRaw,
          handleFeeAmountChange,
          false,
          feeAmountError
        )}
        {renderField(
          "Gas Limit",
          gasLimitRaw,
          handleGasLimitChange,
          true,
          gasLimitError
        )}
      </div>
    );
  }
);
