import React, { FunctionComponent, useState } from "react";
import { Input } from "reactstrap";
import { IGasConfig } from "@keplr-wallet/hooks";
import { observer } from "mobx-react-lite";
import { Card } from "../card";
import style from "./gas-input.style.module.scss";
export interface GasInputProps {
  gasConfig: IGasConfig;
  label?: string;
  className?: string;
}

// TODO: Handle the max block gas limit(?)
export const GasInput: FunctionComponent<GasInputProps> = observer(
  ({ gasConfig, label }) => {
    const [inputId] = useState(() => {
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);
      return `input-${Buffer.from(bytes).toString("hex")}`;
    });
    const [rawGasInput, setRawGasInput] = useState(gasConfig.gasRaw);

    return (
      <React.Fragment>
        <div
          style={{
            color: "var(--font-secondary)",
            fontSize: "14px",
            fontWeight: 400,
            marginBottom: "8px",
          }}
        >
          {label}
        </div>
        <Card
          style={{ height: "48px", display: "flex", alignItems: "center" }}
          heading={
            <Input
              id={inputId}
              className={style["input"]}
              type="text"
              inputMode="numeric"
              value={rawGasInput}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, "");
                if (value === "" || parseInt(value) < 10 ** 18) {
                  setRawGasInput(value);
                  gasConfig.setGas(value);
                }

                e.preventDefault();
              }}
              autoComplete="off"
            />
          }
        />
      </React.Fragment>
    );
  }
);
