import React, { FunctionComponent, useMemo, useState } from "react";
import { IFeeConfig, IGasConfig, IGasSimulator } from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";

type IFeeConfigWithManual = IFeeConfig & {
  setManualFee(fee: { denom: string; amount: string }): void;
};
import { Input } from "reactstrap";
import { Card } from "@components-v2/card";
import styleAuto from "./auto.module.scss";

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

const headingStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
};

const middleSectionStyle: React.CSSProperties = {
  width: "100%",
};

export const ManualFeeInput: FunctionComponent<{
  feeConfig: IFeeConfig;
  gasConfig: IGasConfig;
  gasSimulator?: IGasSimulator;
}> = observer(({ feeConfig: _feeConfig, gasConfig, gasSimulator }) => {
  const feeConfig = _feeConfig as IFeeConfigWithManual;
  const feeCurrency = feeConfig.feeCurrency;
  const coinDecimals = feeCurrency?.coinDecimals ?? 6;
  const minimalDenom = feeCurrency?.coinMinimalDenom ?? "";
  const displayDenom = feeCurrency?.coinDenom ?? "";

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

    // Preserve decimals like "0.1", "0.01"
    if (value.startsWith(".")) {
      return `0${value}`;
    }

    return value.replace(/^0+(?=\d)/, "");
  };

  const handleGasPriceChange = (rawValue: string) => {
    const value = trimLeadingZeros(rawValue);
    const regex = new RegExp(
      `^\\d{0,${coinDecimals}}(\\.\\d{0,${coinDecimals}})?$`
    );

    if (!regex.test(value)) {
      return;
    }

    setGasPriceRaw(value);
    setLastEdited("price");
    disableSimulator();

    const gasPrice = parseFloat(value) || 0;
    const gasLimit = parseInt(gasLimitRaw) || 0;
    const feeMinimal = gasPrice * gasLimit;
    const feeDisplay = feeMinimal / Math.pow(10, coinDecimals);
    const newFeeAmount = feeDisplay.toFixed(coinDecimals);
    setFeeAmountRaw(parseFloat(newFeeAmount) === 0 ? "0" : newFeeAmount);
    applyFee(newFeeAmount, gasLimitRaw);
  };

  const handleFeeAmountChange = (rawValue: string) => {
    const value = trimLeadingZeros(rawValue);
    const regex = new RegExp(
      `^\\d{0,${coinDecimals}}(\\.\\d{0,${coinDecimals}})?$`
    );

    if (!regex.test(value)) {
      return;
    }

    setFeeAmountRaw(value);
    setLastEdited("amount");
    disableSimulator();

    const feeDisplay = parseFloat(value) || 0;
    const gasLimit = parseInt(gasLimitRaw) || 0;
    const feeMinimal = feeDisplay * Math.pow(10, coinDecimals);
    const gasPrice = gasLimit > 0 ? feeMinimal / gasLimit : 0;
    setGasPriceRaw(
      gasPrice === 0
        ? "0"
        : parseFloat(gasPrice.toFixed(coinDecimals)).toString()
    );
    applyFee(value, gasLimitRaw);
  };

  const handleGasLimitChange = (rawValue: string) => {
    const value = trimLeadingZeros(rawValue);
    setGasLimitRaw(value);
    disableSimulator();

    const gasLimit = parseInt(value) || 0;
    if (lastEdited === "price") {
      const gasPrice = parseFloat(gasPriceRaw) || 0;
      const feeMinimal = gasPrice * gasLimit;
      const feeDisplay = feeMinimal / Math.pow(10, coinDecimals);
      const newFeeAmount = feeDisplay.toFixed(coinDecimals);
      setFeeAmountRaw(parseFloat(newFeeAmount) === 0 ? "0" : newFeeAmount);
      applyFee(newFeeAmount, value);
    } else {
      const feeDisplay = parseFloat(feeAmountRaw) || 0;
      const feeMinimal = feeDisplay * Math.pow(10, coinDecimals);
      const gasPrice = gasLimit > 0 ? feeMinimal / gasLimit : 0;
      setGasPriceRaw(gasPrice.toString());
      applyFee(feeAmountRaw, value);
    }
  };

  const renderField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    integerOnly = false
  ) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={labelStyle}>{label}</div>
      <Card
        style={cardStyle}
        headingStyle={headingStyle}
        middleSectionStyle={middleSectionStyle}
        heading={
          <Input
            className={styleAuto["input"]}
            style={{ background: "transparent" }}
            type="text"
            inputMode={integerOnly ? "numeric" : "decimal"}
            value={value}
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
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {renderField(
        `Gas Price (${minimalDenom}/gas)`,
        gasPriceRaw,
        handleGasPriceChange
      )}
      {renderField(
        `Fee Amount (${displayDenom})`,
        feeAmountRaw,
        handleFeeAmountChange
      )}
      {renderField("Gas Limit", gasLimitRaw, handleGasLimitChange, true)}
    </div>
  );
});
